import type { TextElement } from '@shared/boardElements'

export type Rect = { left: number; top: number; right: number; bottom: number }

export type TransformBounds = {
  center: { x: number; y: number }
  rotation: number
  scale: number
  width: number
  height: number
  corners: Array<{ x: number; y: number }>
  aabb: Rect
}

export type TextLayout = {
  lines: string[]
  lineWidths: number[]
  maxLineWidth: number
  totalHeight: number
  blockWidth: number
  lineAdvance: number
  baselineOffsets: number[]
  ascent: number
  descent: number
  maxWidthPx: number
}

export type TextElementLayoutInfo = {
  layout: TextLayout
  wrapWidth: number
  width: number
  height: number
  inset: number
}

export type TextElementBounds = TransformBounds & { layout: TextElementLayoutInfo }

export const STICKY_FONT_FAMILY = '"Inter", "Segoe UI", sans-serif'
export const TEXT_DEFAULT_FONT_SIZE = 48
export const TEXT_COLOR = '#0f172a'
export const TEXT_DEFAULT_MAX_WIDTH = 800
export const TEXT_MIN_WRAP_WIDTH = 120
export const TEXT_MAX_WRAP_WIDTH = 3200
export const TEXT_SAFETY_INSET = 2
export const TEXT_LINE_HEIGHT = 1.18
export const TEXT_MIN_SCALE = 0.02
export const TEXT_MAX_SCALE = 40
export const TEXT_ROTATION_HANDLE_OFFSET = 32
export const TEXT_ROTATION_SNAP_EPSILON = (5 * Math.PI) / 180
export const TEXT_ROTATION_SNAP_INCREMENT = Math.PI / 2
export const TEXT_DEBUG_BOUNDS = false
export const TEXT_MEASURE_SAMPLE = 'Mg'

let sharedMeasureCtx: CanvasRenderingContext2D | null = null

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function getSharedMeasureContext() {
  if (sharedMeasureCtx) return sharedMeasureCtx
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  sharedMeasureCtx = canvas.getContext('2d')
  return sharedMeasureCtx
}

export function measureTextLayout(
  ctx: CanvasRenderingContext2D | null,
  text: string,
  fontSizePx: number,
  maxWidthPx: number,
  fontFamily: string,
  lineHeightMultiplier: number,
  fontWeight: 400 | 700 = 400,
  fontStyle: 'normal' | 'italic' = 'normal'
): TextLayout {
  const normalizedText = typeof text === 'string' ? text : ''
  if (!ctx) {
    const lines = normalizedText.split(/\n/) || ['']
    const fallbackLineHeight = fontSizePx * lineHeightMultiplier
    const widths = lines.map((line) => line.length * (fontSizePx * 0.6))
    const maxLineWidth = widths.reduce((max, width) => Math.max(max, width), 0)
    return {
      lines: lines.length > 0 ? lines : [''],
      lineWidths: widths,
      maxLineWidth,
      totalHeight: Math.max(1, lines.length) * fallbackLineHeight,
      blockWidth: maxLineWidth,
      lineAdvance: fallbackLineHeight,
      baselineOffsets: lines.map((_, index) => index * fallbackLineHeight + fontSizePx * 0.8),
      ascent: fontSizePx * 0.8,
      descent: fontSizePx * 0.2,
      maxWidthPx,
    }
  }

  ctx.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`
  const lineAdvance = Math.max(1, fontSizePx * lineHeightMultiplier)
  const lines: string[] = []
  const lineWidths: number[] = []

  const pushLine = (content: string) => {
    lines.push(content)
    lineWidths.push(ctx.measureText(content).width)
  }

  const processWordChunks = (word: string): string => {
    let chunk = ''
    for (const char of word) {
      const nextChunk = `${chunk}${char}`
      const width = ctx.measureText(nextChunk).width
      if (width <= maxWidthPx || chunk === '') {
        chunk = nextChunk
      } else {
        pushLine(chunk)
        chunk = char
      }
    }
    return chunk
  }

  const paragraphs = normalizedText.split(/\n/)
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      pushLine('')
    } else {
      let current = ''
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        const width = ctx.measureText(candidate).width
        if (width <= maxWidthPx || current === '') {
          current = candidate
        } else {
          if (current) pushLine(current)
          const wordWidth = ctx.measureText(word).width
          if (wordWidth <= maxWidthPx) {
            current = word
          } else {
            const remainder = processWordChunks(word)
            if (remainder) {
              current = remainder
            } else {
              current = ''
            }
          }
        }
      }
      pushLine(current)
    }
    if (paragraphIndex < paragraphs.length - 1) {
      pushLine('')
    }
  })

  if (lines.length === 0) {
    lines.push('')
    lineWidths.push(0)
  }

  const metrics = ctx.measureText(TEXT_MEASURE_SAMPLE)
  const ascent = metrics.actualBoundingBoxAscent ?? fontSizePx * 0.8
  const descent = metrics.actualBoundingBoxDescent ?? fontSizePx * 0.2
  const maxLineWidth = lineWidths.reduce((max, width) => Math.max(max, width), 0)
  const baselineOffsets = lines.map((_, index) => ascent + index * lineAdvance)
  const totalHeight =
    lines.length === 0 ? ascent + descent : baselineOffsets[baselineOffsets.length - 1] + descent
  return {
    lines,
    lineWidths,
    maxLineWidth,
    totalHeight,
    blockWidth: maxLineWidth,
    lineAdvance,
    baselineOffsets,
    ascent,
    descent,
    maxWidthPx,
  }
}

export function getTextLayoutForContent(
  text: string,
  fontSize: number,
  wrapWidth: number,
  ctx: CanvasRenderingContext2D | null,
  fontFamily: string = STICKY_FONT_FAMILY,
  fontWeight: 400 | 700 = 400,
  fontStyle: 'normal' | 'italic' = 'normal'
): TextLayout {
  return measureTextLayout(ctx, text, fontSize, wrapWidth, fontFamily, TEXT_LINE_HEIGHT, fontWeight, fontStyle)
}

export function resolveTextFontSize(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, value)
  }
  return TEXT_DEFAULT_FONT_SIZE
}

export function resolveTextWrapWidth(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clamp(value, TEXT_MIN_WRAP_WIDTH, TEXT_MAX_WRAP_WIDTH)
  }
  return TEXT_DEFAULT_MAX_WIDTH
}

export function resolveTextScale(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clamp(value, TEXT_MIN_SCALE, TEXT_MAX_SCALE)
  }
  return 1
}

export function resolveTextRotation(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return 0
}

export function getTextElementLayout(
  element: TextElement,
  ctx: CanvasRenderingContext2D | null
): TextElementLayoutInfo {
  const fontSize = resolveTextFontSize(element.fontSize)
  const wrapWidth = resolveTextWrapWidth(element.w)
  const fontFamily = element.fontFamily ?? STICKY_FONT_FAMILY
  const fontWeight = element.style?.fontWeight ?? 400
  const fontStyle = element.style?.fontStyle ?? 'normal'
  const layout = getTextLayoutForContent(element.text ?? '', fontSize, wrapWidth, ctx, fontFamily, fontWeight, fontStyle)
  const inset = TEXT_SAFETY_INSET
  const height = layout.totalHeight + inset * 2
  const width = wrapWidth + inset * 2
  return { layout, wrapWidth, width, height, inset }
}

export function computeTransformBounds(
  base: { x: number; y: number; width: number; height: number; rotation: number; scale: number }
): TransformBounds {
  const center = {
    x: base.x + base.width / 2,
    y: base.y + base.height / 2,
  }
  const halfWidth = base.width / 2
  const halfHeight = base.height / 2
  const cos = Math.cos(base.rotation)
  const sin = Math.sin(base.rotation)
  const transform = (dx: number, dy: number) => {
    const scaledX = dx * base.scale
    const scaledY = dy * base.scale
    return {
      x: center.x + scaledX * cos - scaledY * sin,
      y: center.y + scaledX * sin + scaledY * cos,
    }
  }
  const corners = [
    transform(-halfWidth, -halfHeight),
    transform(halfWidth, -halfHeight),
    transform(halfWidth, halfHeight),
    transform(-halfWidth, halfHeight),
  ]
  const aabb = corners.reduce<Rect>(
    (acc, point) => ({
      left: Math.min(acc.left, point.x),
      right: Math.max(acc.right, point.x),
      top: Math.min(acc.top, point.y),
      bottom: Math.max(acc.bottom, point.y),
    }),
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
  )
  return { center, rotation: base.rotation, scale: base.scale, width: base.width, height: base.height, corners, aabb }
}

export function getTextElementBounds(
  element: TextElement,
  ctx: CanvasRenderingContext2D | null
): TextElementBounds {
  const layoutInfo = getTextElementLayout(element, ctx)
  const rotation = resolveTextRotation(element.rotation)
  const scale = resolveTextScale(element.scale)
  const bounds = computeTransformBounds({
    x: element.x,
    y: element.y,
    width: layoutInfo.width,
    height: layoutInfo.height,
    rotation,
    scale,
  })
  return { ...bounds, layout: layoutInfo }
}

export function toTextLocalCoordinates(point: { x: number; y: number }, bounds: TransformBounds) {
  const dx = point.x - bounds.center.x
  const dy = point.y - bounds.center.y
  const cos = Math.cos(bounds.rotation)
  const sin = Math.sin(bounds.rotation)
  const rotatedX = dx * cos + dy * sin
  const rotatedY = -dx * sin + dy * cos
  return {
    x: rotatedX / bounds.scale,
    y: rotatedY / bounds.scale,
  }
}

export function getTextHandleLocalPosition(
  handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's',
  bounds: TransformBounds
) {
  const halfWidth = bounds.width / 2
  const halfHeight = bounds.height / 2
  switch (handle) {
    case 'nw':
      return { x: -halfWidth, y: -halfHeight }
    case 'ne':
      return { x: halfWidth, y: -halfHeight }
    case 'se':
      return { x: halfWidth, y: halfHeight }
    case 'sw':
      return { x: -halfWidth, y: halfHeight }
    case 'n':
      return { x: 0, y: -halfHeight }
    case 's':
    default:
      return { x: 0, y: halfHeight }
  }
}
