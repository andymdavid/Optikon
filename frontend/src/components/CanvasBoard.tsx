import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from 'react'

import type { BoardElement, RectangleElement, StickyNoteElement, TextElement } from '@shared/boardElements'

export type CameraState = {
  offsetX: number
  offsetY: number
  zoom: number
}

type ElementMap = Record<string, BoardElement>

const initialCameraState: CameraState = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
}

const BOARD_STORAGE_KEY = 'optikon.devBoardId'
const BOARD_TITLE = 'Dev Board'
const API_BASE_URL = 'http://localhost:3025'
const STICKY_SIZE = 220
const STICKY_MIN_SIZE = 120
const BOARD_BACKGROUND = '#f7f7f8'
const GRID_BASE_BOARD_SPACING = 100
const GRID_PRIMARY_TARGET_PX = 80
const GRID_SECONDARY_DIVISIONS = 4
const GRID_SECONDARY_FADE_START = 65
const GRID_SECONDARY_FADE_END = 115
const GRID_PRIMARY_ALPHA = 0.07
const GRID_SECONDARY_ALPHA = 0.04
const GRID_MAJOR_ALPHA = 0.12
const GRID_MAJOR_EVERY = 5
const GRID_COLOR_RGB = '15, 23, 42'
const STICKY_FILL_TOP = '#fff7a6'
const STICKY_FILL_BOTTOM = '#fef69e'
const STICKY_TEXT_COLOR = '#1f2937'
const STICKY_CORNER_RADIUS = 0
const SELECTION_FRAME_PADDING = 18
const RESIZE_HANDLE_RADIUS = 6
const RESIZE_HANDLE_HIT_RADIUS = 12
const ACCENT_COLOR = '#0ea5e9'
const MARQUEE_FILL = 'rgba(14, 165, 233, 0.12)'
const BASE_STICKY_FONT_MAX = 32
const BASE_STICKY_FONT_MIN = 12
const STICKY_TEXT_LINE_HEIGHT = 1.35
const STICKY_PADDING_X = 16
const STICKY_PADDING_Y = 14
const STICKY_FONT_FAMILY = '"Inter", "Segoe UI", sans-serif'
const TEXT_DEFAULT_FONT_SIZE = 48
const TEXT_COLOR = '#0f172a'
const TEXT_DEFAULT_MAX_WIDTH = 800
const TEXT_MIN_WRAP_WIDTH = 120
const TEXT_MAX_WRAP_WIDTH = 3200
const TEXT_SAFETY_INSET = 2
const TEXT_LINE_HEIGHT = 1.18
const TEXT_MIN_SCALE = 0.2
const TEXT_MAX_SCALE = 6
const TEXT_ROTATION_HANDLE_OFFSET = 32
const TEXT_ROTATION_SNAP_EPSILON = (5 * Math.PI) / 180
const TEXT_ROTATION_SNAP_INCREMENT = Math.PI / 2
const RECT_DEFAULT_FILL = '#dbeafe'
const RECT_DEFAULT_STROKE = '#2563eb'
const RECT_MIN_SIZE = 8
const TEXT_DEBUG_BOUNDS = false
const TEXT_MEASURE_SAMPLE = 'Mg'
type Rect = { left: number; top: number; right: number; bottom: number }
type ToolMode = 'select' | 'sticky' | 'text' | 'rect'

type TextLayout = {
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

const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  left: Math.min(a.x, b.x),
  top: Math.min(a.y, b.y),
  right: Math.max(a.x, b.x),
  bottom: Math.max(a.y, b.y),
})

let sharedMeasureCtx: CanvasRenderingContext2D | null = null
const getSharedMeasureContext = () => {
  if (sharedMeasureCtx) return sharedMeasureCtx
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  sharedMeasureCtx = canvas.getContext('2d')
  return sharedMeasureCtx
}

const measureTextLayout = (
  ctx: CanvasRenderingContext2D | null,
  text: string,
  fontSizePx: number,
  maxWidthPx: number,
  fontFamily: string,
  lineHeightMultiplier: number
): TextLayout => {
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

  ctx.font = `${fontSizePx}px ${fontFamily}`
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
            current = processWordChunks(word)
          }
        }
      }
      if (current) pushLine(current)
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

type TextElementLayoutInfo = {
  layout: TextLayout
  wrapWidth: number
  width: number
  height: number
  inset: number
}

type TransformBounds = {
  center: { x: number; y: number }
  rotation: number
  scale: number
  width: number
  height: number
  corners: Array<{ x: number; y: number }>
  aabb: Rect
}

type TextElementBounds = TransformBounds & { layout: TextElementLayoutInfo }
type RectElementBounds = TransformBounds

const getTextLayoutForContent = (
  text: string,
  fontSize: number,
  wrapWidth: number,
  ctx: CanvasRenderingContext2D | null
): TextLayout => measureTextLayout(ctx, text, fontSize, wrapWidth, STICKY_FONT_FAMILY, TEXT_LINE_HEIGHT)

const getTextElementLayout = (
  element: TextElement,
  ctx: CanvasRenderingContext2D | null
): TextElementLayoutInfo => {
  const fontSize = resolveTextFontSize(element.fontSize)
  const wrapWidth = resolveTextWrapWidth(element.w)
  const layout = getTextLayoutForContent(element.text ?? '', fontSize, wrapWidth, ctx)
  const inset = TEXT_SAFETY_INSET
  const height = layout.totalHeight + inset * 2
  const width = wrapWidth + inset * 2
  return { layout, wrapWidth, width, height, inset }
}

const computeTransformBounds = (
  base: { x: number; y: number; width: number; height: number; rotation: number; scale: number }
): TransformBounds => {
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

const getStickySize = (element: StickyNoteElement) => {
  const size = typeof element.size === 'number' && Number.isFinite(element.size) ? element.size : STICKY_SIZE
  return Math.max(STICKY_MIN_SIZE, size)
}

const getStickyBounds = (element: StickyNoteElement): Rect => {
  const size = getStickySize(element)
  return {
    left: element.x,
    top: element.y,
    right: element.x + size,
    bottom: element.y + size,
  }
}

const getTextElementBounds = (
  element: TextElement,
  ctx: CanvasRenderingContext2D | null
): TextElementBounds => {
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

const getRectangleElementBounds = (element: RectangleElement): RectElementBounds => {
  const width = Math.max(RECT_MIN_SIZE, element.w)
  const height = Math.max(RECT_MIN_SIZE, element.h)
  const rotation = resolveTextRotation(element.rotation)
  const scale = resolveTextScale(element.scale)
  return computeTransformBounds({
    x: element.x,
    y: element.y,
    width,
    height,
    rotation,
    scale,
  })
}

const getElementBounds = (element: BoardElement, ctx: CanvasRenderingContext2D | null): Rect => {
  if (isStickyElement(element)) return getStickyBounds(element)
  if (isTextElement(element)) return getTextElementBounds(element, ctx).aabb
  if (isRectangleElement(element)) return getRectangleElementBounds(element).aabb
  return { left: element.x, top: element.y, right: element.x, bottom: element.y }
}

const getStickyInnerSize = (element: StickyNoteElement) => {
  const size = getStickySize(element)
  return {
    width: Math.max(0, size - STICKY_PADDING_X * 2),
    height: Math.max(0, size - STICKY_PADDING_Y * 2),
  }
}

const getStickyFontBounds = (element: StickyNoteElement) => {
  const ratio = getStickySize(element) / STICKY_SIZE
  const max = BASE_STICKY_FONT_MAX * ratio
  const min = BASE_STICKY_FONT_MIN * ratio
  return {
    max: Math.max(min, max),
    min: Math.max(4, min),
  }
}

const clampFontSizeForElement = (element: StickyNoteElement, fontSize: number) => {
  const { min, max } = getStickyFontBounds(element)
  return clamp(fontSize, min, max)
}

const getElementFontSize = (element: StickyNoteElement) => resolveStickyFontSize(element.fontSize)

const rectsIntersect = (a: Rect, b: Rect) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
const DRAG_THROTTLE_MS = 50
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

function logInbound(message: unknown) {
  console.log('[ws in]', message)
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const resolveStickyFontSize = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, value)
  }
  return BASE_STICKY_FONT_MAX
}

const resolveTextFontSize = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, value)
  }
  return TEXT_DEFAULT_FONT_SIZE
}

const resolveTextWrapWidth = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clamp(value, TEXT_MIN_WRAP_WIDTH, TEXT_MAX_WRAP_WIDTH)
  }
  return TEXT_DEFAULT_MAX_WIDTH
}

const resolveTextScale = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clamp(value, TEXT_MIN_SCALE, TEXT_MAX_SCALE)
  }
  return 1
}

const resolveTextRotation = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return 0
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

const isStickyElement = (element: BoardElement | null | undefined): element is StickyNoteElement =>
  !!element && element.type === 'sticky'

const isTextElement = (element: BoardElement | null | undefined): element is TextElement =>
  !!element && element.type === 'text'

const isRectangleElement = (element: BoardElement | null | undefined): element is RectangleElement =>
  !!element && element.type === 'rect'

type GridSpec = {
  primaryBoardSpacing: number
  primarySpacingPx: number
  secondaryBoardSpacing: number
  secondarySpacingPx: number
  secondaryAlpha: number
}

type EditingState = {
  id: string
  text: string
  originalText: string
  fontSize: number
  elementType: 'sticky' | 'text'
}

type TransformState =
  | {
      mode: 'scale'
      pointerId: number
      id: string
      elementType: 'text' | 'rect'
      handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's'
      startBounds: TextElementBounds | RectElementBounds
    }
  | {
      mode: 'width'
      pointerId: number
      id: string
      elementType: 'text' | 'rect'
      handle: 'e' | 'w'
      startBounds: TextElementBounds | RectElementBounds
    }
  | {
      mode: 'height'
      pointerId: number
      id: string
      elementType: 'rect'
      handle: 'n' | 's'
      startBounds: RectElementBounds
    }
  | {
      mode: 'rotate'
      pointerId: number
      id: string
      elementType: 'text' | 'rect'
      handle: 'rotate'
      startBounds: TextElementBounds | RectElementBounds
      startPointerAngle: number
    }

function computeGridSpec(zoom: number): GridSpec {
  if (zoom <= 0) {
    return {
      primaryBoardSpacing: GRID_BASE_BOARD_SPACING,
      primarySpacingPx: 0,
      secondaryBoardSpacing: GRID_BASE_BOARD_SPACING / GRID_SECONDARY_DIVISIONS,
      secondarySpacingPx: 0,
      secondaryAlpha: 0,
    }
  }
  const basePx = GRID_BASE_BOARD_SPACING * zoom
  const level = Math.round(Math.log2(basePx / GRID_PRIMARY_TARGET_PX))
  const primaryBoardSpacing = GRID_BASE_BOARD_SPACING / 2 ** level
  const primarySpacingPx = primaryBoardSpacing * zoom
  const secondaryBoardSpacing = primaryBoardSpacing / GRID_SECONDARY_DIVISIONS
  const secondarySpacingPx = secondaryBoardSpacing * zoom
  const secondaryAlpha = smoothstep(
    GRID_SECONDARY_FADE_START,
    GRID_SECONDARY_FADE_END,
    primarySpacingPx
  )
  return { primaryBoardSpacing, primarySpacingPx, secondaryBoardSpacing, secondarySpacingPx, secondaryAlpha }
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const clamped = clamp(radius, 0, Math.min(width, height) / 2)
  ctx.beginPath()
  ctx.moveTo(x + clamped, y)
  ctx.lineTo(x + width - clamped, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + clamped)
  ctx.lineTo(x + width, y + height - clamped)
  ctx.quadraticCurveTo(x + width, y + height, x + width - clamped, y + height)
  ctx.lineTo(x + clamped, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - clamped)
  ctx.lineTo(x, y + clamped)
  ctx.quadraticCurveTo(x, y, x + clamped, y)
  ctx.closePath()
}

// Draws a board-anchored, multi-resolution grid. Coarse cells use a power-of-two
// hierarchy in board units, so they always line up with finer subdivisions while
// secondary lines fade in/out as you zoom (Miro-style renewal without sliding).
function drawBoardGrid(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  width: number,
  height: number
) {
  const spec = computeGridSpec(camera.zoom)
  if (spec.primarySpacingPx <= 0) return
  const alignHalfPixel = (value: number) => Math.round(value) + 0.5
  const color = (alpha: number) => `rgba(${GRID_COLOR_RGB}, ${alpha})`
  const boardLeft = -camera.offsetX
  const boardTop = -camera.offsetY
  const boardRight = boardLeft + width / camera.zoom
  const boardBottom = boardTop + height / camera.zoom

  const drawLayer = (spacingBoard: number, alpha: number, every = 1) => {
    if (spacingBoard <= 0 || alpha <= 0) return
    const startX = Math.floor(boardLeft / spacingBoard) - 1
    const endX = Math.ceil(boardRight / spacingBoard) + 1
    const startY = Math.floor(boardTop / spacingBoard) - 1
    const endY = Math.ceil(boardBottom / spacingBoard) + 1
    ctx.beginPath()
    const firstX = Math.ceil(startX / every) * every
    const firstY = Math.ceil(startY / every) * every
    for (let index = firstX; index <= endX; index += every) {
      const boardX = index * spacingBoard
      const screenX = alignHalfPixel((boardX + camera.offsetX) * camera.zoom)
      ctx.moveTo(screenX, 0)
      ctx.lineTo(screenX, height)
    }
    for (let index = firstY; index <= endY; index += every) {
      const boardY = index * spacingBoard
      const screenY = alignHalfPixel((boardY + camera.offsetY) * camera.zoom)
      ctx.moveTo(0, screenY)
      ctx.lineTo(width, screenY)
    }
    ctx.strokeStyle = color(alpha)
    ctx.lineWidth = 1
    ctx.stroke()
  }

  const secondaryAlpha = spec.secondaryAlpha * GRID_SECONDARY_ALPHA
  drawLayer(spec.secondaryBoardSpacing, secondaryAlpha)
  drawLayer(spec.primaryBoardSpacing, GRID_PRIMARY_ALPHA)
  drawLayer(spec.primaryBoardSpacing, GRID_MAJOR_ALPHA, GRID_MAJOR_EVERY)
}

function logOutbound(message: unknown) {
  console.log('[ws out]', message)
}

const randomId = () => Math.random().toString(36).slice(2, 10)

function parseStickyElement(raw: unknown): StickyNoteElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<StickyNoteElement>
  if (element.type !== 'sticky') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  if (typeof element.text !== 'string') return null
  const size = getStickySize({ ...element, size: element.size ?? STICKY_SIZE })
  const provisional: StickyNoteElement = {
    id: element.id,
    type: 'sticky',
    x: element.x,
    y: element.y,
    text: element.text,
    size,
  }
  const fontSize = clampFontSizeForElement(provisional, resolveStickyFontSize(element.fontSize))
  return {
    id: element.id,
    type: 'sticky',
    x: element.x,
    y: element.y,
    text: element.text,
    size,
    fontSize,
  }
}

function parseTextElement(raw: unknown): TextElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<TextElement>
  if (element.type !== 'text') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  if (typeof element.text !== 'string') return null
  const fontSize = resolveTextFontSize(element.fontSize)
  const wrapWidth = resolveTextWrapWidth(element.w)
  const scale = resolveTextScale(element.scale)
  const rotation = resolveTextRotation(element.rotation)
  return {
    id: element.id,
    type: 'text',
    x: element.x,
    y: element.y,
    text: element.text,
    fontSize,
    w: wrapWidth,
    scale,
    rotation,
  }
}

function parseRectangleElement(raw: unknown): RectangleElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<RectangleElement>
  if (element.type !== 'rect') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  if (typeof element.w !== 'number' || typeof element.h !== 'number') return null
  const width = Math.max(RECT_MIN_SIZE, element.w)
  const height = Math.max(RECT_MIN_SIZE, element.h)
  const rotation = resolveTextRotation(element.rotation)
  const scale = resolveTextScale(element.scale)
  return {
    id: element.id,
    type: 'rect',
    x: element.x,
    y: element.y,
    w: width,
    h: height,
    fill: typeof element.fill === 'string' ? element.fill : RECT_DEFAULT_FILL,
    stroke: typeof element.stroke === 'string' ? element.stroke : RECT_DEFAULT_STROKE,
    rotation,
    scale,
  }
}

function parseBoardElement(raw: unknown): BoardElement | null {
  if (!raw || typeof raw !== 'object') return null
  const type = (raw as { type?: string }).type
  if (type === 'sticky') return parseStickyElement(raw)
  if (type === 'text') return parseTextElement(raw)
  if (type === 'rect') return parseRectangleElement(raw)
  return null
}

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  alignCenter = false
): string[] {
  const lines: string[] = []
  const rawBlocks = text.split(/\n/)
  rawBlocks.forEach((block, index) => {
    const words = block.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      if (index < rawBlocks.length - 1) lines.push('')
      return
    }
    let current = ''
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word
      if (ctx.measureText(next).width <= maxWidth || current === '') {
        current = next
      } else {
        if (alignCenter && ctx.measureText(word).width > maxWidth) {
          const chars = word.split('')
          let chunk = ''
          chars.forEach((char) => {
            const nextChunk = `${chunk}${char}`
            if (ctx.measureText(nextChunk).width <= maxWidth || chunk === '') {
              chunk = nextChunk
            } else {
              if (chunk) lines.push(chunk)
              chunk = char
            }
          })
          if (chunk) {
            if (ctx.measureText(`${current} ${chunk}`).width <= maxWidth) {
              current = current ? `${current} ${chunk}` : chunk
            } else {
              if (current) lines.push(current)
              current = chunk
            }
          }
        } else {
          lines.push(current)
          current = word
        }
      }
    })
    if (current) lines.push(current)
  })
  return lines.length === 0 ? [''] : lines
}

const fontFitsSticky = (
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  maxWidth: number,
  maxHeight: number
) => {
  if (!text || text.trim().length === 0) return true
  ctx.font = `${fontSize}px ${STICKY_FONT_FAMILY}`
  const lines = wrapText(ctx, text, maxWidth, true)
  if (lines.length === 0) return true
  const totalHeight = lines.length * fontSize * STICKY_TEXT_LINE_HEIGHT
  if (totalHeight > maxHeight) return false
  for (const line of lines) {
    if (ctx.measureText(line).width > maxWidth) return false
  }
  return true
}

const fitFontSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  innerWidth: number,
  innerHeight: number,
  maxFontSize: number,
  minFontSize: number
) => {
  if (innerWidth <= 0 || innerHeight <= 0) return minFontSize
  const sanitizedMax = Math.max(minFontSize, maxFontSize)
  let low = minFontSize
  let high = sanitizedMax
  let best = minFontSize
  for (let index = 0; index < 12; index += 1) {
    const mid = (low + high) / 2
    if (fontFitsSticky(ctx, text, mid, innerWidth, innerHeight)) {
      best = mid
      low = mid
    } else {
      high = mid
    }
    if (high - low <= 0.5) break
  }
  return clamp(Math.min(best, sanitizedMax), minFontSize, sanitizedMax)
}

const getStickyScreenRect = (element: StickyNoteElement, camera: CameraState) => {
  const size = getStickySize(element) * camera.zoom
  return {
    x: (element.x + camera.offsetX) * camera.zoom,
    y: (element.y + camera.offsetY) * camera.zoom,
    size,
  }
}

const getSelectionFrameRect = (element: StickyNoteElement, camera: CameraState) => {
  const rect = getStickyScreenRect(element, camera)
  return {
    x: rect.x - SELECTION_FRAME_PADDING,
    y: rect.y - SELECTION_FRAME_PADDING,
    size: rect.size + SELECTION_FRAME_PADDING * 2,
  }
}

const drawStickyShadow = (
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  radius: number
) => {
  const passes = [
    { blur: 12, offsetY: 8, alpha: 0.18 },
    { blur: 20, offsetY: 18, alpha: 0.12 },
    { blur: 32, offsetY: 28, alpha: 0.08 },
  ]
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, rect.y + 2, ctx.canvas.width, ctx.canvas.height - rect.y)
  ctx.clip()
  passes.forEach((pass) => {
    ctx.save()
    ctx.shadowColor = `rgba(15, 23, 42, ${pass.alpha})`
    ctx.shadowBlur = pass.blur
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = pass.offsetY
    ctx.fillStyle = '#ffffff'
    drawRoundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius)
    ctx.fill()
    ctx.restore()
  })
  ctx.restore()
}

// TODO(phase-6.2.3): Keep this sticky renderer but add a drawElement dispatcher that picks the
// correct render function for TextElement vs StickyNoteElement.
function drawSticky(ctx: CanvasRenderingContext2D, element: StickyNoteElement, camera: CameraState) {
  const stickySize = getStickySize(element)
  const width = stickySize * camera.zoom
  const height = stickySize * camera.zoom
  const screenX = (element.x + camera.offsetX) * camera.zoom
  const screenY = (element.y + camera.offsetY) * camera.zoom
  const radius = STICKY_CORNER_RADIUS * camera.zoom
  const paddingY = STICKY_PADDING_Y * camera.zoom
  const fontSize = getElementFontSize(element) * camera.zoom
  const lineHeight = fontSize * STICKY_TEXT_LINE_HEIGHT
  const rect = { x: screenX, y: screenY, width, height }
  drawStickyShadow(ctx, rect, radius)
  ctx.save()
  const gradient = ctx.createLinearGradient(0, screenY, 0, screenY + height)
  gradient.addColorStop(0, STICKY_FILL_TOP)
  gradient.addColorStop(0.8, STICKY_FILL_BOTTOM)
  ctx.fillStyle = gradient
  drawRoundedRectPath(ctx, screenX, screenY, width, height, radius)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.fillRect(screenX + radius, screenY + 2 * camera.zoom, width - radius * 2, 6 * camera.zoom)
  ctx.fillStyle = STICKY_TEXT_COLOR
  ctx.font = `${fontSize}px ${STICKY_FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  const inner = getStickyInnerSize(element)
  const innerWidth = inner.width * camera.zoom
  const innerHeight = inner.height * camera.zoom
  const lines = wrapText(ctx, element.text, innerWidth, true)
  const totalHeight = lines.length * lineHeight
  const offsetY = Math.max(0, (innerHeight - totalHeight) / 2)
  const textX = screenX + width / 2
  lines.forEach((line, index) => {
    const textY = screenY + paddingY + offsetY + index * lineHeight
    ctx.fillText(line, textX, textY, innerWidth)
  })
  ctx.restore()
}

function drawTextElement(ctx: CanvasRenderingContext2D, element: TextElement, camera: CameraState) {
  const measureCtx = getSharedMeasureContext()
  const bounds = getTextElementBounds(element, measureCtx)
  const layoutInfo = bounds.layout
  const fontSize = resolveTextFontSize(element.fontSize)
  ctx.save()
  const screenCenterX = (bounds.center.x + camera.offsetX) * camera.zoom
  const screenCenterY = (bounds.center.y + camera.offsetY) * camera.zoom
  ctx.translate(screenCenterX, screenCenterY)
  ctx.rotate(bounds.rotation)
  const scaleFactor = bounds.scale * camera.zoom
  ctx.scale(scaleFactor, scaleFactor)
  ctx.translate(-bounds.width / 2 + layoutInfo.inset, -bounds.height / 2 + layoutInfo.inset)
  ctx.fillStyle = TEXT_COLOR
  ctx.font = `${fontSize}px ${STICKY_FONT_FAMILY}`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  layoutInfo.layout.lines.forEach((line, index) => {
    ctx.fillText(line, 0, layoutInfo.layout.baselineOffsets[index])
  })
  ctx.restore()
}

function drawRectangleElement(ctx: CanvasRenderingContext2D, element: RectangleElement, camera: CameraState) {
  const bounds = getRectangleElementBounds(element)
  ctx.save()
  const screenCenterX = (bounds.center.x + camera.offsetX) * camera.zoom
  const screenCenterY = (bounds.center.y + camera.offsetY) * camera.zoom
  ctx.translate(screenCenterX, screenCenterY)
  ctx.rotate(bounds.rotation)
  const scaleFactor = bounds.scale * camera.zoom
  ctx.scale(scaleFactor, scaleFactor)
  ctx.fillStyle = element.fill ?? RECT_DEFAULT_FILL
  ctx.strokeStyle = element.stroke ?? RECT_DEFAULT_STROKE
  ctx.lineWidth = 2 / scaleFactor
  const width = bounds.width
  const height = bounds.height
  ctx.beginPath()
  ctx.rect(-width / 2, -height / 2, width, height)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawStickySelection(
  ctx: CanvasRenderingContext2D,
  element: StickyNoteElement,
  camera: CameraState,
  options: { withHandles: boolean }
) {
  const frame = getSelectionFrameRect(element, camera)
  const handleRadius = RESIZE_HANDLE_RADIUS
  ctx.save()
  ctx.strokeStyle = ACCENT_COLOR
  ctx.lineWidth = 1.5
  ctx.strokeRect(frame.x, frame.y, frame.size, frame.size)
  if (options.withHandles) {
    const handles: Array<{ x: number; y: number }> = [
      { x: frame.x, y: frame.y },
      { x: frame.x + frame.size, y: frame.y },
      { x: frame.x + frame.size, y: frame.y + frame.size },
      { x: frame.x, y: frame.y + frame.size },
    ]
    handles.forEach((handle) => {
      ctx.beginPath()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = ACCENT_COLOR
      ctx.lineWidth = 1
      ctx.arc(handle.x, handle.y, handleRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    })
  }
  ctx.restore()
}

type TransformHandleSpec = {
  kind: 'scale' | 'width' | 'height' | 'rotate'
  handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'rotate'
  position: { x: number; y: number }
  anchor?: { x: number; y: number }
}

const getTransformHandleSpecs = (
  bounds: TransformBounds,
  options: { verticalMode: 'scale' | 'height'; horizontalMode: 'width' }
): TransformHandleSpec[] => {
  const specs: TransformHandleSpec[] = []
  const cornerHandles: Array<{ handle: 'nw' | 'ne' | 'se' | 'sw'; index: number }> = [
    { handle: 'nw', index: 0 },
    { handle: 'ne', index: 1 },
    { handle: 'se', index: 2 },
    { handle: 'sw', index: 3 },
  ]
  cornerHandles.forEach(({ handle, index }) => {
    specs.push({ kind: 'scale', handle, position: bounds.corners[index] })
  })
  const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  })
  const topCenter = midpoint(bounds.corners[0], bounds.corners[1])
  const rightCenter = midpoint(bounds.corners[1], bounds.corners[2])
  const bottomCenter = midpoint(bounds.corners[2], bounds.corners[3])
  const leftCenter = midpoint(bounds.corners[3], bounds.corners[0])
  specs.push({ kind: options.verticalMode, handle: 'n', position: topCenter })
  specs.push({ kind: options.verticalMode, handle: 's', position: bottomCenter })
  specs.push({ kind: options.horizontalMode, handle: 'e', position: rightCenter })
  specs.push({ kind: options.horizontalMode, handle: 'w', position: leftCenter })
  const cos = Math.cos(bounds.rotation)
  const sin = Math.sin(bounds.rotation)
  const offset = bounds.height / 2 * bounds.scale + TEXT_ROTATION_HANDLE_OFFSET
  const rotationLocal = { x: 0, y: -offset }
  const rotationPosition = {
    x: bounds.center.x + rotationLocal.x * cos - rotationLocal.y * sin,
    y: bounds.center.y + rotationLocal.x * sin + rotationLocal.y * cos,
  }
  specs.push({ kind: 'rotate', handle: 'rotate', position: rotationPosition, anchor: topCenter })
  return specs
}

const toTextLocalCoordinates = (point: { x: number; y: number }, bounds: TransformBounds) => {
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

const getTextHandleLocalPosition = (
  handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's',
  bounds: TransformBounds
) => {
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

function drawTextSelection(
  ctx: CanvasRenderingContext2D,
  element: TextElement,
  camera: CameraState,
  options: { withHandles: boolean }
) {
  const measureCtx = getSharedMeasureContext()
  const bounds = getTextElementBounds(element, measureCtx)
  const toScreen = (point: { x: number; y: number }) => ({
    x: (point.x + camera.offsetX) * camera.zoom,
    y: (point.y + camera.offsetY) * camera.zoom,
  })
  ctx.save()
  ctx.strokeStyle = ACCENT_COLOR
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const first = toScreen(bounds.corners[0])
  ctx.moveTo(first.x, first.y)
  for (let index = 1; index < bounds.corners.length; index += 1) {
    const point = toScreen(bounds.corners[index])
    ctx.lineTo(point.x, point.y)
  }
  ctx.closePath()
  ctx.stroke()
  if (TEXT_DEBUG_BOUNDS) {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)'
    ctx.setLineDash([4, 4])
    ctx.strokeRect(
      (bounds.aabb.left + camera.offsetX) * camera.zoom,
      (bounds.aabb.top + camera.offsetY) * camera.zoom,
      (bounds.aabb.right - bounds.aabb.left) * camera.zoom,
      (bounds.aabb.bottom - bounds.aabb.top) * camera.zoom
    )
    ctx.setLineDash([])
  }
  if (options.withHandles) {
    const handleRadius = RESIZE_HANDLE_RADIUS
    const drawHandle = (point: { x: number; y: number }) => {
      const screen = toScreen(point)
      ctx.beginPath()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = ACCENT_COLOR
      ctx.lineWidth = 1
      ctx.arc(screen.x, screen.y, handleRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    const handles = getTransformHandleSpecs(bounds, { verticalMode: 'scale', horizontalMode: 'width' })
    handles.forEach((handle) => {
      if (handle.kind === 'rotate' && handle.anchor) {
        const anchor = toScreen(handle.anchor)
        const rotationScreen = toScreen(handle.position)
        ctx.beginPath()
        ctx.strokeStyle = ACCENT_COLOR
        ctx.lineWidth = 1
        ctx.moveTo(anchor.x, anchor.y)
        ctx.lineTo(rotationScreen.x, rotationScreen.y)
        ctx.stroke()
      }
      drawHandle(handle.position)
    })
  }
  ctx.restore()
}

function drawRectangleSelection(
  ctx: CanvasRenderingContext2D,
  element: RectangleElement,
  camera: CameraState,
  options: { withHandles: boolean }
) {
  const bounds = getRectangleElementBounds(element)
  const toScreen = (point: { x: number; y: number }) => ({
    x: (point.x + camera.offsetX) * camera.zoom,
    y: (point.y + camera.offsetY) * camera.zoom,
  })
  ctx.save()
  ctx.strokeStyle = ACCENT_COLOR
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const first = toScreen(bounds.corners[0])
  ctx.moveTo(first.x, first.y)
  for (let index = 1; index < bounds.corners.length; index += 1) {
    const point = toScreen(bounds.corners[index])
    ctx.lineTo(point.x, point.y)
  }
  ctx.closePath()
  ctx.stroke()
  if (options.withHandles) {
    const handleRadius = RESIZE_HANDLE_RADIUS
    const drawHandle = (point: { x: number; y: number }) => {
      const screen = toScreen(point)
      ctx.beginPath()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = ACCENT_COLOR
      ctx.lineWidth = 1
      ctx.arc(screen.x, screen.y, handleRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    const handles = getTransformHandleSpecs(bounds, { verticalMode: 'height', horizontalMode: 'width' })
    handles.forEach((handle) => {
      if (handle.kind === 'rotate' && handle.anchor) {
        const anchor = toScreen(handle.anchor)
        const rotationScreen = toScreen(handle.position)
        ctx.beginPath()
        ctx.strokeStyle = ACCENT_COLOR
        ctx.lineWidth = 1
        ctx.moveTo(anchor.x, anchor.y)
        ctx.lineTo(rotationScreen.x, rotationScreen.y)
        ctx.stroke()
      }
      drawHandle(handle.position)
    })
  }
  ctx.restore()
}

function drawElementSelection(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  camera: CameraState,
  options: { withHandles: boolean }
) {
  if (isStickyElement(element)) {
    drawStickySelection(ctx, element, camera, options)
    return
  }
  if (isTextElement(element)) {
    drawTextSelection(ctx, element, camera, options)
    return
  }
  if (isRectangleElement(element)) {
    drawRectangleSelection(ctx, element, camera, options)
  }
}

export function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const joinedRef = useRef(false)
  const createBoardInFlightRef = useRef(false)
  const dragStateRef = useRef<
    | {
        ids: string[]
        offsetX?: number
        offsetY?: number
        pointerId: number
        startPointer: { x: number; y: number }
        startPositions: Record<string, { x: number; y: number }>
      }
    | null
  >(null)
  const resizeStateRef = useRef<
    | null
    | {
        id: string
        pointerId: number
        anchor: { x: number; y: number }
        handle: 'nw' | 'ne' | 'sw' | 'se'
      }
  >(null)
  const rectCreationRef = useRef<
    | null
    | {
        pointerId: number
        start: { x: number; y: number }
        id: string
      }
  >(null)
  const transformStateRef = useRef<TransformState | null>(null)
  const suppressClickRef = useRef(false)
  const lastBroadcastRef = useRef(0)
  const panStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)
  const spacePressedRef = useRef(false)
  const selectedIdsRef = useRef<Set<string>>(new Set())
  const interactionModeRef = useRef<
    'none' | 'pan' | 'drag' | 'marquee' | 'marqueeCandidate' | 'resize' | 'transform' | 'rect-create'
  >('none')
  const marqueeCandidateRef = useRef<
    | null
    | {
        startBoard: { x: number; y: number }
        startScreen: { x: number; y: number }
        shift: boolean
      }
  >(null)
  const editingStateRef = useRef<EditingState | null>(null)
  const editingContentRef = useRef<HTMLDivElement | null>(null)
  const measurementCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const releaseClickSuppression = useCallback(() => {
    requestAnimationFrame(() => {
      suppressClickRef.current = false
    })
  }, [])
  type MarqueeState = {
    start: { x: number; y: number }
    current: { x: number; y: number }
    screenStart: { x: number; y: number }
    screenCurrent: { x: number; y: number }
    shift: boolean
  }
  const [cameraState, setCameraState] = useState<CameraState>(initialCameraState)
  const [elements, setElements] = useState<ElementMap>({})
  const [boardId, setBoardId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [marquee, setMarqueeState] = useState<MarqueeState | null>(null)
  const [toolMode, setToolMode] = useState<ToolMode>('select')
  const [editingState, setEditingStateInternal] = useState<EditingState | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const setMarquee = useCallback(
    (next: MarqueeState | null | ((prev: MarqueeState | null) => MarqueeState | null)) => {
      const value = typeof next === 'function' ? (next as (prev: MarqueeState | null) => MarqueeState | null)(marqueeRef.current) : next
      marqueeRef.current = value
      setMarqueeState(value)
    },
    []
  )

  const getMeasureContext = useCallback(() => {
    if (!measurementCtxRef.current) {
      if (typeof document === 'undefined') return null
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      measurementCtxRef.current = ctx
    }
    return measurementCtxRef.current
  }, [])

  const updateEditingState = useCallback(
    (next: EditingState | null | ((prev: EditingState | null) => EditingState | null)) => {
      setEditingStateInternal((prev) => {
        const value = typeof next === 'function' ? (next as (prev: EditingState | null) => EditingState | null)(prev) : next
        editingStateRef.current = value
        return value
      })
    },
    []
  )

  const screenToBoard = useCallback(
    (point: { x: number; y: number }) => {
      return {
        x: point.x / cameraState.zoom - cameraState.offsetX,
        y: point.y / cameraState.zoom - cameraState.offsetY,
      }
    },
    [cameraState.offsetX, cameraState.offsetY, cameraState.zoom]
  )

  const upsertElement = useCallback((element: BoardElement) => {
    setElements((prev) => ({ ...prev, [element.id]: element }))
  }, [])

  const setSelection = useCallback((next: Set<string>) => {
    selectedIdsRef.current = next
    setSelectedIds(next)
  }, [])

  const clearSelection = useCallback(() => {
    const next = new Set<string>()
    selectedIdsRef.current = next
    setSelectedIds(next)
  }, [])

  const sendElementUpdate = useCallback(
    (element: BoardElement) => {
      const socket = socketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN || !joinedRef.current || !boardId) return
      const message = {
        type: 'elementUpdate',
        payload: { boardId, element } as { boardId: string; element: BoardElement },
      }
      logOutbound(message)
      socket.send(JSON.stringify(message))
    },
    [boardId]
  )

  const sendElementsUpdate = useCallback(
    (updated: BoardElement[]) => {
      const socket = socketRef.current
      if (!socket || !joinedRef.current || !boardId) return
      if (updated.length === 0) return
      const message = {
        type: 'elementsUpdate',
        payload: { boardId, elements: updated } as { boardId: string; elements: BoardElement[] },
      }
      logOutbound(message)
      socket.send(JSON.stringify(message))
    },
    [boardId]
  )

  const persistElementsUpdate = useCallback(
    async (board: string, elementsToPersist: BoardElement[]) => {
      if (elementsToPersist.length === 0) return
      try {
        const response = await fetch(`${API_BASE_URL}/boards/${board}/elements`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elements: elementsToPersist } satisfies { elements: BoardElement[] }),
        })
        if (!response.ok) throw new Error('Failed to update elements')
      } catch (error) {
        console.error('Failed to update board elements', error)
      }
    },
    []
  )

  // TODO(phase-6.2.5): Editing UX is sticky-exclusive; add an element-type switch when
  // TextElement editing arrives so keyboard shortcuts + overlay pick the correct component.
  const beginEditingSticky = useCallback(
    (element: StickyNoteElement) => {
      suppressClickRef.current = true
      releaseClickSuppression()
      setSelection(new Set([element.id]))
      const ctx = getMeasureContext()
      const inner = getStickyInnerSize(element)
      const { max, min } = getStickyFontBounds(element)
      const fitted = ctx ? fitFontSize(ctx, element.text, inner.width, inner.height, max, min) : max
      updateEditingState({
        id: element.id,
        elementType: 'sticky',
        text: element.text,
        originalText: element.text,
        fontSize: fitted,
      })
    },
    [getMeasureContext, releaseClickSuppression, setSelection, updateEditingState]
  )

  const beginEditingText = useCallback(
    (element: TextElement) => {
      suppressClickRef.current = true
      releaseClickSuppression()
      setSelection(new Set([element.id]))
      const fontSize = resolveTextFontSize(element.fontSize)
      updateEditingState({
        id: element.id,
        elementType: 'text',
        text: element.text,
        originalText: element.text,
        fontSize,
      })
    },
    [releaseClickSuppression, setSelection, updateEditingState]
  )

  const commitEditing = useCallback(() => {
    const current = editingStateRef.current
    if (!current) return
    updateEditingState(null)
    let updatedElement: BoardElement | null = null
    setElements((prev) => {
      const target = prev[current.id]
      if (!target) return prev
      if (isStickyElement(target)) {
        const nextFontSize = clampFontSizeForElement(target, resolveStickyFontSize(current.fontSize))
        if (target.text === current.text && resolveStickyFontSize(target.fontSize) === nextFontSize) return prev
        updatedElement = { ...target, text: current.text, fontSize: nextFontSize }
        return { ...prev, [current.id]: updatedElement }
      }
      if (isTextElement(target)) {
        const nextFontSize = resolveTextFontSize(current.fontSize)
        if (target.text === current.text && resolveTextFontSize(target.fontSize) === nextFontSize) return prev
        updatedElement = { ...target, text: current.text, fontSize: nextFontSize }
        return { ...prev, [current.id]: updatedElement }
      }
      return prev
    })
    if (updatedElement) {
      sendElementsUpdate([updatedElement])
      if (boardId) {
        void persistElementsUpdate(boardId, [updatedElement])
      }
    }
  }, [boardId, persistElementsUpdate, sendElementsUpdate, updateEditingState])

  const cancelEditing = useCallback(() => {
    if (!editingStateRef.current) return
    updateEditingState(null)
  }, [updateEditingState])

  const hitTestElement = useCallback(
    (x: number, y: number): string | null => {
      const values = Object.values(elements)
      const ctx = getSharedMeasureContext()
      const pointInPolygon = (point: { x: number; y: number }, corners: Array<{ x: number; y: number }>) => {
        let inside = false
        for (let i = 0, j = corners.length - 1; i < corners.length; j = i, i += 1) {
          const xi = corners[i].x
          const yi = corners[i].y
          const xj = corners[j].x
          const yj = corners[j].y
          const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-9) + xi
          if (intersect) inside = !inside
        }
        return inside
      }
      for (let i = values.length - 1; i >= 0; i -= 1) {
        const element = values[i]
        if (isTextElement(element)) {
          const bounds = getTextElementBounds(element, ctx)
          if (pointInPolygon({ x, y }, bounds.corners)) {
            return element.id
          }
          continue
        }
        if (isRectangleElement(element)) {
          const bounds = getRectangleElementBounds(element)
          if (pointInPolygon({ x, y }, bounds.corners)) {
            return element.id
          }
          continue
        }
        const aabb = getElementBounds(element, ctx)
        if (x >= aabb.left && x <= aabb.right && y >= aabb.top && y <= aabb.bottom) {
          return element.id
        }
      }
      return null
    },
    [elements]
  )

  const persistElementCreate = useCallback(async (board: string, element: BoardElement) => {
    try {
      const response = await fetch(`${API_BASE_URL}/boards/${board}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: element.type, element } satisfies { type: string; element: BoardElement }),
      })
      if (!response.ok) throw new Error('Failed to persist element')
    } catch (error) {
      console.error('Failed to persist board element', error)
    }
  }, [])

  const createStickyAtPoint = useCallback(
    (boardPoint: { x: number; y: number }, opts?: { autoEdit?: boolean }) => {
      if (!boardId) return
      const draft: StickyNoteElement = {
        id: randomId(),
        type: 'sticky',
        x: boardPoint.x,
        y: boardPoint.y,
        text: 'New note',
        size: STICKY_SIZE,
      }
      const ctx = getMeasureContext()
      const inner = getStickyInnerSize(draft)
      const { max, min } = getStickyFontBounds(draft)
      const fontSize = ctx ? fitFontSize(ctx, draft.text, inner.width, inner.height, max, min) : max
      const element = { ...draft, fontSize }
      upsertElement(element)
      sendElementUpdate(element)
      setSelection(new Set([element.id]))
      if (opts?.autoEdit) {
        beginEditingSticky(element)
      }
      void persistElementCreate(boardId, element)
    },
    [beginEditingSticky, boardId, getMeasureContext, persistElementCreate, sendElementUpdate, setSelection, upsertElement]
  )

  const createTextAtPoint = useCallback(
    (boardPoint: { x: number; y: number }) => {
      if (!boardId) return
      const element: TextElement = {
        id: randomId(),
        type: 'text',
        x: boardPoint.x,
        y: boardPoint.y,
        text: '',
        fontSize: TEXT_DEFAULT_FONT_SIZE,
        w: TEXT_DEFAULT_MAX_WIDTH,
        scale: 1,
        rotation: 0,
      }
      upsertElement(element)
      sendElementUpdate(element)
      setSelection(new Set([element.id]))
      beginEditingText(element)
      void persistElementCreate(boardId, element)
    },
    [beginEditingText, boardId, persistElementCreate, sendElementUpdate, setSelection, upsertElement]
  )

  const handleCanvasClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement> | PointerEvent<HTMLCanvasElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      if (!joinedRef.current || !boardId) return
      if (editingStateRef.current) return
      const rect = event.currentTarget.getBoundingClientRect()
      const boardPoint = screenToBoard({ x: event.clientX - rect.left, y: event.clientY - rect.top })
      const hitId = hitTestElement(boardPoint.x, boardPoint.y)
      if (hitId) {
        return
      }
      if (toolMode === 'sticky') {
        createStickyAtPoint(boardPoint)
      } else if (toolMode === 'text') {
        createTextAtPoint(boardPoint)
      } else if (toolMode === 'select') {
        clearSelection()
      }
    },
    [boardId, clearSelection, createStickyAtPoint, createTextAtPoint, hitTestElement, screenToBoard, toolMode]
  )

  const removeElements = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setElements((prev) => {
      let changed = false
      const next = { ...prev }
      ids.forEach((id) => {
        if (next[id]) {
          delete next[id]
          changed = true
        }
      })
      return changed ? next : prev
    })
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set(prev)
      let changed = false
      ids.forEach((id) => {
        if (next.delete(id)) changed = true
      })
      if (!changed) return prev
      selectedIdsRef.current = next
      return next
    })
  }, [])

  const sendElementsDelete = useCallback(
    (ids: string[]) => {
      const socket = socketRef.current
      if (!socket || !boardId || ids.length === 0) return
      const message = {
        type: 'elementsDelete',
        payload: { boardId, ids },
      }
      logOutbound(message)
      socket.send(JSON.stringify(message))
    },
    [boardId]
  )

  const persistElementsDelete = useCallback(async (board: string, ids: string[]) => {
    if (ids.length === 0) return
    try {
      const response = await fetch(`${API_BASE_URL}/boards/${board}/elements`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!response.ok) throw new Error('Failed to delete elements')
    } catch (error) {
      console.error('Failed to delete board elements', error)
    }
  }, [])

  const deleteSelectedElements = useCallback(
    (ids: string[]) => {
      if (!boardId || ids.length === 0) return
      removeElements(ids)
      sendElementsDelete(ids)
      void persistElementsDelete(boardId, ids)
    },
    [boardId, persistElementsDelete, removeElements, sendElementsDelete]
  )

  const handleCanvasDoubleClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (editingStateRef.current || !boardId) return
      const rect = event.currentTarget.getBoundingClientRect()
      const boardPoint = screenToBoard({ x: event.clientX - rect.left, y: event.clientY - rect.top })
      const hitId = hitTestElement(boardPoint.x, boardPoint.y)
      if (!hitId) return
      const hitElement = elements[hitId]
      if (!hitElement) return
      event.preventDefault()
      if (isStickyElement(hitElement)) {
        beginEditingSticky(hitElement)
      } else if (isTextElement(hitElement)) {
        beginEditingText(hitElement)
      }
    },
    [beginEditingSticky, beginEditingText, boardId, elements, hitTestElement, screenToBoard]
  )

  // TODO(phase-6.2.2): Selection frame + resize handles assume square sticky geometry.
  // TextElement will need its own bounding box + per-corner sizing rules.
  const hitTestResizeHandle = useCallback(
    (point: { x: number; y: number }): { element: StickyNoteElement; handle: 'nw' | 'ne' | 'sw' | 'se' } | null => {
      const selected = selectedIdsRef.current
      if (selected.size !== 1) return null
      const [id] = Array.from(selected)
      const element = elements[id]
      if (!isStickyElement(element)) return null
      const frame = getSelectionFrameRect(element, cameraState)
      const handles: Array<{ handle: 'nw' | 'ne' | 'sw' | 'se'; x: number; y: number }> = [
        { handle: 'nw', x: frame.x, y: frame.y },
        { handle: 'ne', x: frame.x + frame.size, y: frame.y },
        { handle: 'se', x: frame.x + frame.size, y: frame.y + frame.size },
        { handle: 'sw', x: frame.x, y: frame.y + frame.size },
      ]
      for (const handle of handles) {
        const distance = Math.hypot(point.x - handle.x, point.y - handle.y)
        if (distance <= RESIZE_HANDLE_HIT_RADIUS) {
          return { element, handle: handle.handle }
        }
      }
      return null
    },
    [cameraState, elements]
  )

  const hitTestTransformHandle = useCallback(
    (
      point: { x: number; y: number }
    ): {
      element: TextElement | RectangleElement
      bounds: TextElementBounds | RectElementBounds
      handle: TransformHandleSpec
    } | null => {
      const selected = selectedIdsRef.current
      if (selected.size !== 1) return null
      const [id] = Array.from(selected)
      const element = elements[id]
      if (!isTextElement(element) && !isRectangleElement(element)) return null
      const ctx = getSharedMeasureContext()
      const bounds = isTextElement(element)
        ? getTextElementBounds(element, ctx)
        : getRectangleElementBounds(element)
      const handleOptions = isTextElement(element)
        ? { verticalMode: 'scale' as const, horizontalMode: 'width' as const }
        : { verticalMode: 'height' as const, horizontalMode: 'width' as const }
      const handles = getTransformHandleSpecs(bounds, handleOptions)
      const handleRadius = RESIZE_HANDLE_HIT_RADIUS
      const toScreen = (position: { x: number; y: number }) => ({
        x: (position.x + cameraState.offsetX) * cameraState.zoom,
        y: (position.y + cameraState.offsetY) * cameraState.zoom,
      })
      for (const handle of handles) {
        const screen = toScreen(handle.position)
        const distance = Math.hypot(point.x - screen.x, point.y - screen.y)
        if (distance <= handleRadius) {
          return { element, bounds, handle }
        }
      }
      return null
    },
    [cameraState.offsetX, cameraState.offsetY, cameraState.zoom, elements]
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }

      if (editingStateRef.current) {
        return
      }

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // ignore
      }

      if (event.button === 1 || spacePressedRef.current) {
        suppressClickRef.current = true
        interactionModeRef.current = 'pan'
        panStateRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startOffsetX: cameraState.offsetX,
          startOffsetY: cameraState.offsetY,
        }
        if (event.currentTarget.setPointerCapture) {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        return
      }

      if (!boardId) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId)
        } catch {
          // ignore
        }
        interactionModeRef.current = 'none'
        marqueeCandidateRef.current = null
        setMarquee(null)
        return
      }
      const boardPoint = screenToBoard(canvasPoint)
      const transformHandleHit = hitTestTransformHandle(canvasPoint)
      if (transformHandleHit) {
        event.preventDefault()
        suppressClickRef.current = true
        interactionModeRef.current = 'transform'
        const handleSpec = transformHandleHit.handle
        if (handleSpec.kind === 'scale') {
          transformStateRef.current = {
            mode: 'scale',
            pointerId: event.pointerId,
            id: transformHandleHit.element.id,
            elementType: transformHandleHit.element.type,
            handle: handleSpec.handle as 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's',
            startBounds: transformHandleHit.bounds,
          }
        } else if (handleSpec.kind === 'width') {
          transformStateRef.current = {
            mode: 'width',
            pointerId: event.pointerId,
            id: transformHandleHit.element.id,
            elementType: transformHandleHit.element.type,
            handle: handleSpec.handle as 'e' | 'w',
            startBounds: transformHandleHit.bounds,
          }
        } else if (handleSpec.kind === 'height') {
          transformStateRef.current = {
            mode: 'height',
            pointerId: event.pointerId,
            id: transformHandleHit.element.id,
            elementType: 'rect',
            handle: handleSpec.handle as 'n' | 's',
            startBounds: transformHandleHit.bounds as RectElementBounds,
          }
        } else {
          const angle = Math.atan2(
            boardPoint.y - transformHandleHit.bounds.center.y,
            boardPoint.x - transformHandleHit.bounds.center.x
          )
          transformStateRef.current = {
            mode: 'rotate',
            pointerId: event.pointerId,
            id: transformHandleHit.element.id,
            elementType: transformHandleHit.element.type,
            handle: 'rotate',
            startBounds: transformHandleHit.bounds,
            startPointerAngle: angle,
          }
        }
        return
      }
      const handleHit = hitTestResizeHandle(canvasPoint)
      if (handleHit) {
        event.preventDefault()
        suppressClickRef.current = true
        interactionModeRef.current = 'resize'
        const size = getStickySize(handleHit.element)
        const startX = handleHit.element.x
        const startY = handleHit.element.y
        let anchor: { x: number; y: number }
        switch (handleHit.handle) {
          case 'nw':
            anchor = { x: startX + size, y: startY + size }
            break
          case 'ne':
            anchor = { x: startX, y: startY + size }
            break
          case 'sw':
            anchor = { x: startX + size, y: startY }
            break
          default:
            anchor = { x: startX, y: startY }
            break
        }
        resizeStateRef.current = {
          id: handleHit.element.id,
          pointerId: event.pointerId,
          anchor,
          handle: handleHit.handle,
        }
        return
      }
      const hitElementId = hitTestElement(boardPoint.x, boardPoint.y)
      const hitElement = hitElementId ? elements[hitElementId] : null
      if (!hitElement) {
        if (toolMode === 'rect') {
          event.preventDefault()
          const id = randomId()
          const newElement: RectangleElement = {
            id,
            type: 'rect',
            x: boardPoint.x,
            y: boardPoint.y,
            w: RECT_MIN_SIZE,
            h: RECT_MIN_SIZE,
            fill: RECT_DEFAULT_FILL,
            stroke: RECT_DEFAULT_STROKE,
            rotation: 0,
            scale: 1,
          }
          rectCreationRef.current = { pointerId: event.pointerId, start: boardPoint, id }
          interactionModeRef.current = 'rect-create'
          suppressClickRef.current = true
          setElements((prev) => ({ ...prev, [id]: newElement }))
          setSelection(new Set([id]))
          return
        }
        dragStateRef.current = null
        marqueeCandidateRef.current = { startBoard: boardPoint, startScreen: canvasPoint, shift: event.shiftKey }
        setMarquee(null)
        interactionModeRef.current = 'marqueeCandidate'
        return
      }
      event.preventDefault()
      suppressClickRef.current = true
      interactionModeRef.current = 'drag'

      const currentSelection = selectedIdsRef.current
      let nextSelection: Set<string>
      if (event.shiftKey) {
        nextSelection = new Set(currentSelection)
        if (nextSelection.has(hitElement.id)) nextSelection.delete(hitElement.id)
        else nextSelection.add(hitElement.id)
        if (nextSelection.size === 0) nextSelection.add(hitElement.id)
      } else if (currentSelection.has(hitElement.id)) {
        nextSelection = new Set(currentSelection)
      } else {
        nextSelection = new Set([hitElement.id])
      }
      if (!setsEqual(currentSelection, nextSelection)) {
        setSelection(nextSelection)
      }

      const dragIds = Array.from(nextSelection)
      const startPositions: Record<string, { x: number; y: number }> = {}
      dragIds.forEach((id) => {
        const element = elements[id]
        if (element) {
          startPositions[id] = { x: element.x, y: element.y }
        }
      })
      dragStateRef.current = {
        pointerId: event.pointerId,
        ids: dragIds,
        startPointer: boardPoint,
        startPositions,
      }
    },
    [boardId, cameraState.offsetX, cameraState.offsetY, elements, hitTestElement, hitTestResizeHandle, hitTestTransformHandle, screenToBoard, setMarquee, setSelection, toolMode]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const mode = interactionModeRef.current
      const rect = event.currentTarget.getBoundingClientRect()
      const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }

      if (editingStateRef.current) return

      const panState = panStateRef.current
      if (mode === 'pan' && panState && event.pointerId === panState.pointerId) {
        const deltaX = (event.clientX - panState.startX) / cameraState.zoom
        const deltaY = (event.clientY - panState.startY) / cameraState.zoom
        setCameraState((prev) => ({
          offsetX: panState.startOffsetX + deltaX,
          offsetY: panState.startOffsetY + deltaY,
          zoom: prev.zoom,
        }))
        return
      }
      if (mode === 'marqueeCandidate') {
        const candidate = marqueeCandidateRef.current
        if (!candidate) return
        const distance = Math.hypot(canvasPoint.x - candidate.startScreen.x, canvasPoint.y - candidate.startScreen.y)
        if (distance >= 5) {
          interactionModeRef.current = 'marquee'
          marqueeCandidateRef.current = null
          setMarquee({
            start: candidate.startBoard,
            current: screenToBoard(canvasPoint),
            screenStart: candidate.startScreen,
            screenCurrent: canvasPoint,
            shift: candidate.shift,
          })
        }
        return
      }
      if (mode === 'marquee') {
        setMarquee((prev) =>
          prev
            ? {
                ...prev,
                current: screenToBoard(canvasPoint),
                screenCurrent: canvasPoint,
              }
            : prev
        )
        return
      }

      const transformState = transformStateRef.current
      if (mode === 'transform' && transformState && transformState.pointerId === event.pointerId) {
        const boardPoint = screenToBoard(canvasPoint)
        const measureCtx = getSharedMeasureContext()
        let updatedElement: BoardElement | null = null
        setElements((prev) => {
          const target = prev[transformState.id]
          if (!target) return prev
          if (transformState.elementType === 'text' && !isTextElement(target)) return prev
          if (transformState.elementType === 'rect' && !isRectangleElement(target)) return prev
          let nextElement: BoardElement | null = null
          if (transformState.mode === 'width') {
            const pointerLocal = toTextLocalCoordinates(boardPoint, transformState.startBounds)
            const direction = transformState.handle === 'e' ? 1 : -1
            if (transformState.elementType === 'text' && isTextElement(target)) {
              const bounds = transformState.startBounds as TextElementBounds
              const inset = bounds.layout.inset
              const minHalfWidth = (TEXT_MIN_WRAP_WIDTH + inset * 2) / 2
              const targetHalf = direction * pointerLocal.x
              const newHalfWidth = Math.max(minHalfWidth, targetHalf)
              const newWidth = newHalfWidth * 2
              const newWrapWidth = clamp(newWidth - inset * 2, TEXT_MIN_WRAP_WIDTH, TEXT_MAX_WRAP_WIDTH)
              const baseHalfWidth = bounds.width / 2
              const deltaHalf = newHalfWidth - baseHalfWidth
              const cos = Math.cos(bounds.rotation)
              const sin = Math.sin(bounds.rotation)
              const shift = direction * deltaHalf * bounds.scale
              const newCenter = {
                x: bounds.center.x + shift * cos,
                y: bounds.center.y + shift * sin,
              }
              const provisional = { ...target, w: newWrapWidth }
              const layoutInfo = getTextElementLayout(provisional, measureCtx)
              const newX = newCenter.x - layoutInfo.width / 2
              const newY = newCenter.y - layoutInfo.height / 2
              nextElement = { ...target, x: newX, y: newY, w: newWrapWidth }
            } else if (transformState.elementType === 'rect' && isRectangleElement(target)) {
              const bounds = transformState.startBounds
              const minHalfWidth = RECT_MIN_SIZE / 2
              const targetHalf = direction * pointerLocal.x
              const newHalfWidth = Math.max(minHalfWidth, targetHalf)
              const newWidth = newHalfWidth * 2
              const baseHalfWidth = bounds.width / 2
              const deltaHalf = newHalfWidth - baseHalfWidth
              const cos = Math.cos(bounds.rotation)
              const sin = Math.sin(bounds.rotation)
              const shift = direction * deltaHalf * bounds.scale
              const newCenter = {
                x: bounds.center.x + shift * cos,
                y: bounds.center.y + shift * sin,
              }
              const newX = newCenter.x - newWidth / 2
              const newY = newCenter.y - bounds.height / 2
              nextElement = { ...target, x: newX, y: newY, w: newWidth }
            }
          } else if (transformState.mode === 'height' && isRectangleElement(target)) {
            const pointerLocal = toTextLocalCoordinates(boardPoint, transformState.startBounds)
            const direction = transformState.handle === 's' ? 1 : -1
            const bounds = transformState.startBounds
            const minHalfHeight = RECT_MIN_SIZE / 2
            const targetHalf = direction * pointerLocal.y
            const newHalfHeight = Math.max(minHalfHeight, targetHalf)
            const newHeight = newHalfHeight * 2
            const baseHalfHeight = bounds.height / 2
            const deltaHalf = newHalfHeight - baseHalfHeight
            const cos = Math.cos(bounds.rotation)
            const sin = Math.sin(bounds.rotation)
            const shift = direction * deltaHalf * bounds.scale
            const newCenter = {
              x: bounds.center.x - shift * sin,
              y: bounds.center.y + shift * cos,
            }
            const newX = newCenter.x - bounds.width / 2
            const newY = newCenter.y - newHeight / 2
            nextElement = { ...target, x: newX, y: newY, h: newHeight }
          } else if (transformState.mode === 'scale') {
            const pointerLocal = toTextLocalCoordinates(boardPoint, transformState.startBounds)
            const handleVector = getTextHandleLocalPosition(transformState.handle, transformState.startBounds)
            const denom = handleVector.x * handleVector.x + handleVector.y * handleVector.y
            if (denom > 0.0001) {
              const dot = pointerLocal.x * handleVector.x + pointerLocal.y * handleVector.y
              const rawScale = Math.abs(dot / denom)
              const nextScale = clamp(rawScale, TEXT_MIN_SCALE, TEXT_MAX_SCALE)
              nextElement = { ...target, scale: nextScale }
            }
          } else if (transformState.mode === 'rotate') {
            const dx = boardPoint.x - transformState.startBounds.center.x
            const dy = boardPoint.y - transformState.startBounds.center.y
            if (Math.abs(dx) + Math.abs(dy) >= 0.0001) {
              const angle = Math.atan2(dy, dx)
              const delta = angle - transformState.startPointerAngle
              let nextRotation = transformState.startBounds.rotation + delta
              const snapped = Math.round(nextRotation / TEXT_ROTATION_SNAP_INCREMENT) * TEXT_ROTATION_SNAP_INCREMENT
              if (Math.abs(snapped - nextRotation) <= TEXT_ROTATION_SNAP_EPSILON) {
                nextRotation = snapped
              }
              nextElement = { ...target, rotation: nextRotation }
            }
          }
          if (!nextElement) return prev
          updatedElement = nextElement
          return { ...prev, [nextElement.id]: nextElement }
        })
        if (updatedElement) {
          const now = Date.now()
          if (now - lastBroadcastRef.current >= DRAG_THROTTLE_MS) {
            sendElementsUpdate([updatedElement])
            lastBroadcastRef.current = now
          }
        }
        return
      }

      if (mode === 'rect-create') {
        const creation = rectCreationRef.current
        if (!creation || creation.pointerId !== event.pointerId) return
        const boardPoint = screenToBoard(canvasPoint)
        let updatedElement: RectangleElement | null = null
        setElements((prev) => {
          const target = prev[creation.id]
          if (!target || !isRectangleElement(target)) return prev
          const width = Math.max(RECT_MIN_SIZE, Math.abs(boardPoint.x - creation.start.x))
          const height = Math.max(RECT_MIN_SIZE, Math.abs(boardPoint.y - creation.start.y))
          const nextX = Math.min(creation.start.x, boardPoint.x)
          const nextY = Math.min(creation.start.y, boardPoint.y)
          const updated = { ...target, x: nextX, y: nextY, w: width, h: height }
          updatedElement = updated
          return { ...prev, [creation.id]: updated }
        })
        if (updatedElement) {
          const now = Date.now()
          if (now - lastBroadcastRef.current >= DRAG_THROTTLE_MS) {
            sendElementsUpdate([updatedElement])
            lastBroadcastRef.current = now
          }
        }
        return
      }

      const resizeState = resizeStateRef.current
      if (mode === 'resize' && resizeState && resizeState.pointerId === event.pointerId) {
        const boardPoint = screenToBoard(canvasPoint)
        let updatedElement: StickyNoteElement | null = null
        setElements((prev) => {
          const target = prev[resizeState.id]
          if (!target) return prev
          const anchor = resizeState.anchor
          const deltaX = boardPoint.x - anchor.x
          const deltaY = boardPoint.y - anchor.y
          const size = Math.max(STICKY_MIN_SIZE, Math.max(Math.abs(deltaX), Math.abs(deltaY)))
          let nextX = target.x
          let nextY = target.y
          switch (resizeState.handle) {
            case 'nw':
              nextX = anchor.x - size
              nextY = anchor.y - size
              break
            case 'ne':
              nextX = anchor.x
              nextY = anchor.y - size
              break
            case 'sw':
              nextX = anchor.x - size
              nextY = anchor.y
              break
            default:
              nextX = anchor.x
              nextY = anchor.y
              break
          }
          const updated = { ...target, x: nextX, y: nextY, size }
          updatedElement = updated
          return { ...prev, [resizeState.id]: updated }
        })
        if (updatedElement) {
          const now = Date.now()
          if (now - lastBroadcastRef.current >= DRAG_THROTTLE_MS) {
            sendElementsUpdate([updatedElement])
            lastBroadcastRef.current = now
          }
        }
        return
      }

      const dragState = dragStateRef.current
      if (mode !== 'drag' || !dragState || dragState.pointerId !== event.pointerId) return
      const boardPoint = screenToBoard(canvasPoint)
      const deltaX = boardPoint.x - dragState.startPointer.x
      const deltaY = boardPoint.y - dragState.startPointer.y
      const updatedElements: BoardElement[] = []
      setElements((prev) => {
        const next = { ...prev }
        let changed = false
        for (const id of dragState.ids) {
          const start = dragState.startPositions[id]
          const existing = next[id]
          if (!start || !existing) continue
          const updated = { ...existing, x: start.x + deltaX, y: start.y + deltaY }
          next[id] = updated
          updatedElements.push(updated)
          changed = true
        }
        return changed ? next : prev
      })
      if (updatedElements.length > 0) {
        const now = Date.now()
        if (now - lastBroadcastRef.current >= DRAG_THROTTLE_MS) {
          sendElementsUpdate(updatedElements)
          lastBroadcastRef.current = now
        }
      }
    },
    [cameraState.offsetX, cameraState.offsetY, cameraState.zoom, screenToBoard, sendElementsUpdate, setMarquee]
  )

  const finishDrag = useCallback(
    (event: PointerEvent<HTMLCanvasElement>, reason: 'up' | 'cancel') => {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }

      if (editingStateRef.current) return

      const mode = interactionModeRef.current
      interactionModeRef.current = 'none'

      if (mode === 'pan') {
        panStateRef.current = null
        suppressClickRef.current = true
        releaseClickSuppression()
        setMarquee(null)
        marqueeCandidateRef.current = null
        return
      }

      if (mode === 'drag') {
        const dragState = dragStateRef.current
        dragStateRef.current = null
        if (!dragState) return
        const finalElements: BoardElement[] = []
        dragState.ids.forEach((id) => {
          const element = elements[id]
          if (element) finalElements.push(element)
        })
        if (finalElements.length > 0) {
          sendElementsUpdate(finalElements)
          if (boardId) {
            void persistElementsUpdate(boardId, finalElements)
          }
        }
        suppressClickRef.current = false
        setMarquee(null)
        marqueeCandidateRef.current = null
        return
      }

      if (mode === 'resize') {
        const resizeState = resizeStateRef.current
        resizeStateRef.current = null
        const elementId = resizeState?.id
        suppressClickRef.current = false
        setMarquee(null)
        marqueeCandidateRef.current = null
        if (!elementId) return
        const element = elements[elementId]
        if (!element) return
        sendElementsUpdate([element])
        if (boardId) {
          void persistElementsUpdate(boardId, [element])
        }
        return
      }

      if (mode === 'transform') {
        const transformState = transformStateRef.current
        transformStateRef.current = null
        suppressClickRef.current = false
        setMarquee(null)
        marqueeCandidateRef.current = null
        if (!transformState) return
        const element = elements[transformState.id]
        if (!element) return
        sendElementsUpdate([element])
        if (boardId) {
          void persistElementsUpdate(boardId, [element])
        }
        return
      }

      if (mode === 'rect-create') {
        const creationState = rectCreationRef.current
        rectCreationRef.current = null
        suppressClickRef.current = false
        setMarquee(null)
        marqueeCandidateRef.current = null
        if (!creationState) return
        const element = elements[creationState.id]
        if (!element || !isRectangleElement(element)) return
        sendElementsUpdate([element])
        if (boardId) {
          void persistElementCreate(boardId, element)
        }
        return
      }

      const marqueeState = marqueeRef.current
      if (mode === 'marquee' && marqueeState && marqueeState.start && marqueeState.current) {
        const selectionRect = normalizeRect(marqueeState.start, marqueeState.current)
    const measureCtx = getSharedMeasureContext()
    const matchingIds = Object.values(elements)
          .filter((element) => rectsIntersect(selectionRect, getElementBounds(element, measureCtx)))
          .map((element) => element.id)

        console.log('[marquee]', { marqueeRect: selectionRect, selectedCount: matchingIds.length, total: Object.keys(elements).length })
        if (matchingIds.length === 0) {
          const sample = Object.values(elements)[0]
          if (sample) {
            const sampleCtx = getSharedMeasureContext()
            console.log('[marquee sample]', getElementBounds(sample, sampleCtx))
          }
        }

        if (matchingIds.length > 0) {
          if (marqueeState.shift) {
            const next = new Set(selectedIdsRef.current)
            matchingIds.forEach((id) => {
              if (next.has(id)) next.delete(id)
              else next.add(id)
            })
            setSelection(next.size === 0 ? new Set(matchingIds) : next)
          } else {
            setSelection(new Set(matchingIds))
          }
        } else if (!marqueeState.shift) {
          clearSelection()
        }
        setMarquee(null)
        marqueeCandidateRef.current = null
        suppressClickRef.current = true
        releaseClickSuppression()
        return
      }

      if (mode === 'marqueeCandidate') {
        marqueeCandidateRef.current = null
        setMarquee(null)
        if (reason === 'up') {
          handleCanvasClick(event as unknown as MouseEvent<HTMLCanvasElement>)
        }
        suppressClickRef.current = true
        releaseClickSuppression()
        return
      }

      marqueeCandidateRef.current = null
      setMarquee(null)
      suppressClickRef.current = true
      releaseClickSuppression()
    },
    [boardId, elements, handleCanvasClick, clearSelection, persistElementCreate, persistElementsUpdate, releaseClickSuppression, sendElementsUpdate, setMarquee, setSelection]
  )

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      finishDrag(event, 'up')
    },
    [finishDrag]
  )

  const handlePointerLeave = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      finishDrag(event, 'cancel')
    },
    [finishDrag]
  )

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      finishDrag(event, 'cancel')
    },
    [finishDrag]
  )

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLCanvasElement>) => {
      if (editingStateRef.current) return
      // Miro-like: pan on scroll, zoom on Cmd+scroll
      if (!event.metaKey) {
        event.preventDefault()
        setCameraState((prev) => ({
          offsetX: prev.offsetX - event.deltaX / prev.zoom,
          offsetY: prev.offsetY - event.deltaY / prev.zoom,
          zoom: prev.zoom,
        }))
        return
      }

      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const boardPoint = screenToBoard(canvasPoint)
      setCameraState((prev) => {
        const zoomFactor = event.deltaY < 0 ? 1.02 : 0.98
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * zoomFactor))
        const offsetX = canvasPoint.x / newZoom - boardPoint.x
        const offsetY = canvasPoint.y / newZoom - boardPoint.y
        return { offsetX, offsetY, zoom: newZoom }
      })
    },
    [screenToBoard]
  )

  useEffect(() => {
    let cancelled = false

    const resolveBoardId = async () => {
      const stored = localStorage.getItem(BOARD_STORAGE_KEY)
      if (stored) {
        setBoardId(stored)
        return
      }
      if (createBoardInFlightRef.current) return
      createBoardInFlightRef.current = true
      try {
        const response = await fetch(`${API_BASE_URL}/boards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: BOARD_TITLE }),
        })
        if (!response.ok) throw new Error('Failed to create board')
        const board = (await response.json()) as { id?: number | string }
        const newId = board?.id ? String(board.id) : null
        if (!newId) throw new Error('Invalid board response')
        localStorage.setItem(BOARD_STORAGE_KEY, newId)
        if (!cancelled) setBoardId(newId)
      } catch (error) {
        console.error('Failed to resolve board id', error)
      }
      createBoardInFlightRef.current = false
    }

    void resolveBoardId()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (editingStateRef.current) return
      if (event.code === 'Space') {
        if (!spacePressedRef.current) {
          spacePressedRef.current = true
          event.preventDefault()
        }
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const ids = Array.from(selectedIdsRef.current)
        if (ids.length === 0) return
        event.preventDefault()
        deleteSelectedElements(ids)
        return
      }

      if (event.key === 'v' || event.key === 'V') {
        setToolMode('select')
        return
      }
      if (event.key === 'n' || event.key === 'N') {
        setToolMode('sticky')
        return
      }
      if (event.key === 't' || event.key === 'T') {
        setToolMode('text')
        return
      }
      if (event.key === 'r' || event.key === 'R') {
        setToolMode('rect')
        return
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (editingStateRef.current) return
      if (event.code === 'Space') {
        spacePressedRef.current = false
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
    }, [deleteSelectedElements])

  useEffect(() => {
    setSelection(new Set())
  }, [boardId, setSelection])

  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])

  useEffect(() => {
    const ctx = getMeasureContext()
    if (!ctx) return
    // TODO(phase-6.2.5): Font auto-fit assumes every element follows sticky sizing rules;
    // skip non-sticky types (e.g. TextElement) once we support them.
    const adjustments: StickyNoteElement[] = []
    const editingId = editingStateRef.current?.id
    Object.values(elements).forEach((element) => {
      if (!isStickyElement(element)) return
      if (element.id === editingId) return
      const inner = getStickyInnerSize(element)
      const bounds = getStickyFontBounds(element)
      const fitted = fitFontSize(ctx, element.text, inner.width, inner.height, bounds.max, bounds.min)
      if (Math.abs(fitted - getElementFontSize(element)) > 0.1) {
        adjustments.push({ ...element, fontSize: fitted })
      }
    })
    if (adjustments.length === 0) return
    setElements((prev) => {
      const next = { ...prev }
      let changed = false
      adjustments.forEach((element) => {
        next[element.id] = element
        changed = true
      })
      return changed ? next : prev
    })
    sendElementsUpdate(adjustments)
    if (boardId) {
      void persistElementsUpdate(boardId, adjustments)
    }
  }, [boardId, elements, getMeasureContext, persistElementsUpdate, sendElementsUpdate])

  useEffect(() => {
    if (!boardId) return
    let cancelled = false

    const loadPersistedElements = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/boards/${boardId}/elements`)
        if (!response.ok) throw new Error('Failed to load elements')
        const data = (await response.json()) as {
          elements?: Array<{ id?: string; element?: BoardElement | null }>
        }
        const parsed: BoardElement[] = []
        data.elements?.forEach((entry) => {
          const parsedElement = parseBoardElement(entry?.element)
          if (parsedElement) {
            parsed.push(parsedElement)
          }
        })
        if (!cancelled && parsed.length > 0) {
          setElements((prev) => {
            const next = { ...prev }
            parsed.forEach((element) => {
              next[element.id] = element
            })
            return next
          })
        }
      } catch (error) {
        console.error('Failed to load board elements', error)
      }
    }

    void loadPersistedElements()

    return () => {
      cancelled = true
    }
  }, [boardId])

  useEffect(() => {
    if (!boardId) return
    let socket: WebSocket | null = null
    let retryDelay = 250
    let reconnectTimer: number | null = null
    let stopped = false
    let cancelledPendingOpen = false
    const connect = () => {
      if (stopped) return
      cancelledPendingOpen = false
      socket = new WebSocket('ws://localhost:3025/ws')
      const currentSocket = socket
      socketRef.current = currentSocket

      currentSocket.addEventListener('open', () => {
        console.log('[ws] open')
        if (stopped || cancelledPendingOpen) {
          currentSocket.close()
          return
        }
        retryDelay = 250
        const joinPayload = {
          type: 'joinBoard',
          payload: {
            boardId,
            user: { pubkey: 'anon' },
          },
        }
        logOutbound(joinPayload)
        currentSocket.send(JSON.stringify(joinPayload))
      })

      currentSocket.addEventListener('message', (event) => {
        try {
          const parsed = JSON.parse(event.data)
          logInbound(parsed)
          if (parsed?.type === 'joinAck') {
            joinedRef.current = true
          } else if (parsed?.type === 'elementUpdate') {
            console.log('[ws in elementUpdate]', parsed.payload)
            const incoming = parseBoardElement((parsed.payload as { element?: unknown })?.element)
            if (incoming) upsertElement(incoming)
          } else if (parsed?.type === 'elementsUpdate') {
            const payload = parsed.payload as { elements?: BoardElement[] }
            const updated = (payload?.elements ?? [])
              .map((element) => parseBoardElement(element))
              .filter((element): element is BoardElement => !!element)
            if (updated.length > 0) {
              setElements((prev) => {
                const next = { ...prev }
                updated.forEach((element) => {
                  next[element.id] = element
                })
                return next
              })
            }
          } else if (parsed?.type === 'elementsDelete') {
            const ids = (parsed.payload as { ids?: unknown })?.ids
            if (Array.isArray(ids)) {
              const filtered = ids.filter((id): id is string => typeof id === 'string')
              if (filtered.length > 0) removeElements(filtered)
            }
          }
        } catch (error) {
          console.error('[ws error] failed to parse message', error)
        }
      })

      currentSocket.addEventListener('close', (event) => {
        console.log('[ws] close', { code: event.code, reason: event.reason })
        joinedRef.current = false
        if (socketRef.current === currentSocket) {
          socketRef.current = null
        }
        if (stopped) return
        const delay = retryDelay
        retryDelay = Math.min(retryDelay * 2, 5000)
        reconnectTimer = window.setTimeout(connect, delay)
      })

      currentSocket.addEventListener('error', (event) => {
        console.error('[ws error]', event)
      })
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      joinedRef.current = false
      if (!socket) return
      if (socketRef.current === socket) {
        socketRef.current = null
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.close()
        return
      }
      if (socket.readyState === WebSocket.CONNECTING) {
        cancelledPendingOpen = true
        return
      }
      socket.close()
    }
  }, [boardId, removeElements, sendElementUpdate, upsertElement])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const targetWidth = Math.round(cssWidth * dpr)
    const targetHeight = Math.round(cssHeight * dpr)
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BOARD_BACKGROUND
    ctx.fillRect(0, 0, cssWidth, cssHeight)
    drawBoardGrid(ctx, cameraState, cssWidth, cssHeight)
    const values = Object.values(elements)
    const editingTextId = editingState?.elementType === 'text' ? editingState.id : null
    values.forEach((element) => {
      if (isStickyElement(element)) {
        drawSticky(ctx, element, cameraState)
      } else if (isTextElement(element)) {
        if (editingTextId && element.id === editingTextId) return
        drawTextElement(ctx, element, cameraState)
      } else if (isRectangleElement(element)) {
        drawRectangleElement(ctx, element, cameraState)
      }
    })
    const selectedArray = Array.from(selectedIds)
    const singleSelectionId = selectedArray.length === 1 ? selectedArray[0] : null
    selectedArray.forEach((id) => {
      const element = elements[id]
      if (!element) return
      const withHandles = singleSelectionId === id
      let selectionElement: BoardElement = element
      if (
        editingState?.elementType === 'text' &&
        editingState.id === id &&
        isTextElement(element)
      ) {
        selectionElement = { ...element, text: editingState.text, fontSize: editingState.fontSize }
      }
      drawElementSelection(ctx, selectionElement, cameraState, { withHandles })
    })
  }, [cameraState, editingState, elements, selectedIds])

  const editingElement = editingState ? elements[editingState.id] : null
  const editingStickyElement = isStickyElement(editingElement) ? editingElement : null
  const editingRect = editingStickyElement ? getStickyScreenRect(editingStickyElement, cameraState) : null
  const editingInnerSize = editingStickyElement ? getStickyInnerSize(editingStickyElement) : null
  const editingPaddingX = STICKY_PADDING_X * cameraState.zoom
  const editingPaddingY = STICKY_PADDING_Y * cameraState.zoom
  const editingContentWidth = editingInnerSize ? editingInnerSize.width : null
  const editingContentHeight = editingInnerSize ? editingInnerSize.height : null
  const editingStickyFontSizePx =
    editingState?.elementType === 'sticky' ? editingState.fontSize * cameraState.zoom : null
  const editingTextElement = isTextElement(editingElement) ? editingElement : null
  const editingTextWrapWidth = editingTextElement ? resolveTextWrapWidth(editingTextElement.w) : TEXT_DEFAULT_MAX_WIDTH
  const editingTextLayout =
    editingState?.elementType === 'text'
      ? getTextLayoutForContent(
          editingState.text,
          editingState.fontSize,
          editingTextWrapWidth,
          getSharedMeasureContext()
        )
      : null
  const editingTextBounds =
    editingState?.elementType === 'text' && editingTextElement && editingTextLayout
      ? {
          left: editingTextElement.x,
          top: editingTextElement.y,
          right:
            editingTextElement.x + editingTextWrapWidth + TEXT_SAFETY_INSET * 2,
          bottom:
            editingTextElement.y + editingTextLayout.totalHeight + TEXT_SAFETY_INSET * 2,
        }
      : null
  const editingTextRect = editingTextBounds
    ? {
        x: (editingTextBounds.left + cameraState.offsetX) * cameraState.zoom,
        y: (editingTextBounds.top + cameraState.offsetY) * cameraState.zoom,
        width: (editingTextWrapWidth + TEXT_SAFETY_INSET * 2) * cameraState.zoom,
        height: (editingTextLayout.totalHeight + TEXT_SAFETY_INSET * 2) * cameraState.zoom,
      }
    : null
  const editingTextFontSizePx =
    editingState?.elementType === 'text' ? editingState.fontSize * cameraState.zoom : null

  const updateEditingText = useCallback(
    (nextValue: string) => {
      const ctx = getMeasureContext()
      const stickyTarget = editingStickyElement
      updateEditingState((prev) => {
        if (!prev) return prev
        if (prev.elementType === 'sticky' && stickyTarget && ctx) {
          const inner = getStickyInnerSize(stickyTarget)
          const bounds = getStickyFontBounds(stickyTarget)
          const fitted = fitFontSize(ctx, nextValue, inner.width, inner.height, bounds.max, bounds.min)
          return { ...prev, text: nextValue, fontSize: fitted }
        }
        return { ...prev, text: nextValue }
      })
    },
    [editingStickyElement, getMeasureContext, updateEditingState]
  )

  const syncEditingTextFromDom = useCallback(() => {
    const content = editingContentRef.current
    if (!content) return
    const nextValue = content.textContent ?? ''
    updateEditingText(nextValue)
  }, [updateEditingText])

  const insertPlainText = useCallback(
    (text: string) => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      selection.deleteFromDocument()
      selection.getRangeAt(0).insertNode(document.createTextNode(text))
      selection.collapseToEnd()
      const content = editingContentRef.current
      updateEditingText(content?.textContent ?? '')
    },
    [updateEditingText]
  )

  useEffect(() => {
    const content = editingContentRef.current
    if (!content) return
    if (!editingState) {
      content.textContent = ''
      return
    }
    content.textContent = editingState.text
    requestAnimationFrame(() => {
      content.focus()
      const selection = window.getSelection()
      if (!selection) return
      const range = document.createRange()
      range.selectNodeContents(content)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    })
  }, [editingState?.id])

  useEffect(() => {
    if (editingState && !editingElement) {
      updateEditingState(null)
    }
  }, [editingElement, editingState, updateEditingState])

  useEffect(() => {
    const ctx = getMeasureContext()
    const current = editingStateRef.current
    if (!ctx || !current || !editingStickyElement) return
    const inner = getStickyInnerSize(editingStickyElement)
    const bounds = getStickyFontBounds(editingStickyElement)
    const fitted = fitFontSize(ctx, current.text, inner.width, inner.height, bounds.max, bounds.min)
    if (Math.abs(fitted - current.fontSize) > 0.1) {
      updateEditingState((prev) => (prev ? { ...prev, fontSize: fitted } : prev))
    }
  }, [editingStickyElement, editingStickyElement?.size, getMeasureContext, updateEditingState])

  return (
    <section
      aria-label="Canvas board"
      className="canvas-board"
      data-camera-x={cameraState.offsetX}
      data-camera-y={cameraState.offsetY}
      data-camera-zoom={cameraState.zoom}
    >
      <canvas
        ref={canvasRef}
        className="canvas-board__surface"
        onClick={handleCanvasClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        onDoubleClick={handleCanvasDoubleClick}
      />
      {marquee && (
        <div
          className="marquee-selection"
          style={{
            position: 'absolute',
            border: `1px solid ${ACCENT_COLOR}`,
            backgroundColor: MARQUEE_FILL,
            pointerEvents: 'none',
            left: Math.min(marquee.screenStart.x, marquee.screenCurrent.x),
            top: Math.min(marquee.screenStart.y, marquee.screenCurrent.y),
            width: Math.abs(marquee.screenCurrent.x - marquee.screenStart.x),
            height: Math.abs(marquee.screenCurrent.y - marquee.screenStart.y),
          }}
        />
      )}
      {editingState?.elementType === 'sticky' &&
        editingStickyElement &&
        editingRect &&
        editingStickyFontSizePx !== null &&
        editingContentWidth !== null &&
        editingContentHeight !== null && (
          // TODO(phase-6.2.5): Overlay styling + DOM structure is sticky-specific; split into
          // element-type specific overlays once TextElement editing is introduced.
          <div
            className="canvas-board__sticky-editor"
            style={{
              left: editingRect.x,
              top: editingRect.y,
              width: editingRect.size,
              height: editingRect.size,
              padding: `${editingPaddingY}px ${editingPaddingX}px`,
              fontSize: `${editingStickyFontSizePx}px`,
              lineHeight: STICKY_TEXT_LINE_HEIGHT,
            }}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
          >
            <div
              ref={editingContentRef}
              className="canvas-board__sticky-editor-content"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              spellCheck={false}
              onInput={syncEditingTextFromDom}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelEditing()
                  return
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  commitEditing()
                }
              }}
              onBlur={() => {
                commitEditing()
              }}
              onPaste={(event) => {
                event.preventDefault()
                const text = event.clipboardData?.getData('text/plain') ?? ''
                insertPlainText(text)
              }}
            />
          </div>
        )}
      {editingState?.elementType === 'text' &&
        editingTextElement &&
        editingTextLayout &&
        editingTextRect &&
        editingTextFontSizePx !== null && (
          <div
            className="canvas-board__text-editor"
            style={{
              left: editingTextRect.x,
              top: editingTextRect.y,
              width: editingTextRect.width,
              height: editingTextRect.height,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div
              ref={editingContentRef}
              className="canvas-board__text-editor-content"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              spellCheck={false}
              style={{
                fontSize: `${editingTextFontSizePx}px`,
                lineHeight: TEXT_LINE_HEIGHT,
                padding: `${TEXT_SAFETY_INSET}px`,
              }}
              onInput={syncEditingTextFromDom}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelEditing()
                  return
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  commitEditing()
                }
              }}
              onBlur={() => {
                commitEditing()
              }}
              onPaste={(event) => {
                event.preventDefault()
                const text = event.clipboardData?.getData('text/plain') ?? ''
                insertPlainText(text)
              }}
            />
          </div>
        )}
    </section>
  )
}
