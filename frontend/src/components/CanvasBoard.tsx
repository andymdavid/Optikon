import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type FocusEvent as ReactFocusEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import { createPortal } from 'react-dom'

import {
  STICKY_FONT_FAMILY,
  TEXT_COLOR,
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_DEFAULT_MAX_WIDTH,
  TEXT_MIN_WRAP_WIDTH,
  TEXT_MAX_WRAP_WIDTH,
  TEXT_SAFETY_INSET,
  TEXT_LINE_HEIGHT,
  TEXT_MIN_SCALE,
  TEXT_MAX_SCALE,
  TEXT_ROTATION_HANDLE_OFFSET,
  TEXT_ROTATION_SNAP_EPSILON,
  TEXT_ROTATION_SNAP_INCREMENT,
  TEXT_DEBUG_BOUNDS,
  clamp,
  computeTransformBounds,
  getSharedMeasureContext,
  getTextElementBounds,
  getTextElementLayout,
  getTextHandleLocalPosition,
  getTextLayoutForContent,
  smoothstep,
  toTextLocalCoordinates,
  resolveTextFontSize,
  resolveTextRotation,
  resolveTextScale,
  resolveTextWrapWidth,
  type Rect,
  type TextElementBounds,
  type TransformBounds,
} from './canvas/utils'
import { FloatingSelectionToolbar } from './toolbar/FloatingSelectionToolbar'
import { ToolRail, type ToolMode } from './toolbar/ToolRail'
import { ZoomPanel } from './toolbar/ZoomPanel'

import type {
  BoardElement,
  EllipseElement,
  RectangleElement,
  FrameElement,
  DiamondElement,
  TriangleElement,
  SpeechBubbleElement,
  RoundedRectElement,
  StickyNoteElement,
  CommentElement,
  TextElement,
  LineElement,
  LineEndpointBinding,
  ConnectorAnchor,
} from '@shared/boardElements'

console.log("CANVASBOARD_BUILD", "4e3d65c")

declare global {
  interface HTMLElementEventMap {
    gesturestart: Event
    gesturechange: Event
    gestureend: Event
  }
}

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
const STICKY_MIN_SIZE = 40
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
const FRAME_MIN_SIZE = 80
const FRAME_DEFAULT_WIDTH = 640
const FRAME_DEFAULT_HEIGHT = 420
const FRAME_HEADER_GAP_PX = 6
const FRAME_BORDER_COLOR = 'rgba(15, 23, 42, 0.3)'
const FRAME_FILL_COLOR = '#ffffff'
const FRAME_TITLE_FONT_SIZE = 16
const FRAME_TITLE_FONT_MIN = 10
const FRAME_TITLE_FONT_MAX = 20
const FRAME_TITLE_COLOR = '#0f172a'
const FRAME_TITLE_HIT_HEIGHT = 24
function getFrameTitleScreenFontSize(zoom: number) {
  const normalizedZoom = clamp(zoom, 0.4, 3)
  const adjusted = FRAME_TITLE_FONT_SIZE / Math.pow(normalizedZoom, 0.55)
  return clamp(adjusted, FRAME_TITLE_FONT_MIN, FRAME_TITLE_FONT_MAX)
}
const RECT_DEFAULT_FILL = 'rgba(0,0,0,0)'
const RECT_DEFAULT_STROKE = '#2563eb'
const RECT_MIN_SIZE = 8
const RECT_DEFAULT_SCREEN_SIZE = 180
const ROUND_RECT_DEFAULT_RADIUS = 12
const SPEECH_BUBBLE_CORNER_RATIO = 0.22
const SPEECH_BUBBLE_DEFAULT_TAIL_OFFSET = 0.35
const SPEECH_BUBBLE_DEFAULT_TAIL_RATIO = 0.18
const LINE_DEFAULT_STROKE = '#2563eb'
const LINE_DEFAULT_STROKE_WIDTH = 4
const LINE_ARROW_MIN_SCREEN = 10
const LINE_ARROW_MAX_SCREEN = 18
const LINE_ARROW_WIDTH_FACTOR = 0.6
const LINE_HIT_RADIUS_PX = 12
const LINE_SNAP_DISTANCE_PX = 24
const LINE_ANCHORS: ConnectorAnchor[] = ['top', 'right', 'bottom', 'left', 'center']
const VISIBLE_CONNECTOR_ANCHORS: ConnectorAnchor[] = ['top', 'right', 'bottom', 'left']
const CONNECTOR_HANDLE_RADIUS_PX = 3
const CONNECTOR_HANDLE_OFFSET_PX = 12
type ShapeElement =
  | RectangleElement
  | EllipseElement
  | RoundedRectElement
  | DiamondElement
  | TriangleElement
  | SpeechBubbleElement
type FrameOrShapeElement = ShapeElement | FrameElement
type LineElementBounds = {
  start: { x: number; y: number }
  end: { x: number; y: number }
  points: Array<{ x: number; y: number }>
  center: { x: number; y: number }
  length: number
  aabb: Rect
  strokeWidth: number
}

type LineEndpointKey = 'start' | 'end'

function getAxisAlignedAnchorPoint(rect: Rect, anchor: ConnectorAnchor) {
  const centerX = (rect.left + rect.right) / 2
  const centerY = (rect.top + rect.bottom) / 2
  switch (anchor) {
    case 'top':
      return { x: centerX, y: rect.top }
    case 'bottom':
      return { x: centerX, y: rect.bottom }
    case 'left':
      return { x: rect.left, y: centerY }
    case 'right':
      return { x: rect.right, y: centerY }
    default:
      return { x: centerX, y: centerY }
  }
}

function getTransformAnchorPoint(bounds: TransformBounds, anchor: ConnectorAnchor) {
  const { corners, center } = bounds
  const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  })
  switch (anchor) {
    case 'top':
      return midpoint(corners[0], corners[1])
    case 'right':
      return midpoint(corners[1], corners[2])
    case 'bottom':
      return midpoint(corners[2], corners[3])
    case 'left':
      return midpoint(corners[3], corners[0])
    default:
      return center
  }
}

function rotatePoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
  rotation: number
) {
  if (!rotation) return { ...point }
  const dx = point.x - center.x
  const dy = point.y - center.y
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

function getTriangleAnchorDetails(
  element: TriangleElement,
  anchor: ConnectorAnchor
): { point: { x: number; y: number }; center: { x: number; y: number } } {
  const width = Math.max(RECT_MIN_SIZE, element.w)
  const height = Math.max(RECT_MIN_SIZE, element.h)
  const center = { x: element.x + width / 2, y: element.y + height / 2 }
  const rotation = resolveTextRotation(element.rotation)
  const top = rotatePoint({ x: element.x + width / 2, y: element.y }, center, rotation)
  const leftBase = rotatePoint({ x: element.x, y: element.y + height }, center, rotation)
  const rightBase = rotatePoint({ x: element.x + width, y: element.y + height }, center, rotation)
  const baseMid = rotatePoint({ x: element.x + width / 2, y: element.y + height }, center, rotation)
  const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  })
  switch (anchor) {
    case 'top':
      return { point: top, center }
    case 'bottom':
      return { point: baseMid, center }
    case 'left': {
      const point = midpoint(top, leftBase)
      return { point, center }
    }
    case 'right': {
      const point = midpoint(top, rightBase)
      return { point, center }
    }
    default:
      return { point: center, center }
  }
}

function getElementAnchorDetails(
  element: BoardElement,
  anchor: ConnectorAnchor,
  options?: { ctx?: CanvasRenderingContext2D | null }
): { point: { x: number; y: number }; center: { x: number; y: number } } | null {
  if (isStickyElement(element)) {
    const bounds = getStickyBounds(element)
    const point = getAxisAlignedAnchorPoint(bounds, anchor)
    const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 }
    return { point, center }
  }
  const ctx = options?.ctx ?? null
  if (isTriangleElement(element)) {
    return getTriangleAnchorDetails(element, anchor)
  }
  if (isTextElement(element)) {
    const textBounds = getTextElementBounds(element, ctx)
    const point = getTransformAnchorPoint(textBounds, anchor)
    return { point, center: textBounds.center }
  }
  if (isShapeElement(element) || isFrameElement(element)) {
    const shapeBounds = getShapeElementBounds(element)
    const point = getTransformAnchorPoint(shapeBounds, anchor)
    return { point, center: shapeBounds.center }
  }
  return null
}

function getElementAnchorPoint(
  element: BoardElement,
  anchor: ConnectorAnchor,
  options?: { ctx?: CanvasRenderingContext2D | null }
) {
  return getElementAnchorDetails(element, anchor, options)?.point ?? null
}

function resolveLineEndpointPosition(
  element: LineElement,
  key: LineEndpointKey,
  options?: { resolveElement?: (id: string) => BoardElement | undefined; measureCtx?: CanvasRenderingContext2D | null }
) {
  const binding = key === 'start' ? element.startBinding : element.endBinding
  if (binding && options?.resolveElement) {
    const target = options.resolveElement(binding.elementId)
    if (target) {
      const ctx = options.measureCtx ?? null
      const anchorPoint = getElementAnchorPoint(target, binding.anchor, { ctx })
      if (anchorPoint) return anchorPoint
    }
  }
  return key === 'start'
    ? { x: element.x1, y: element.y1 }
    : { x: element.x2, y: element.y2 }
}

function getResolvedLineEndpoints(
  element: LineElement,
  options?: { resolveElement?: (id: string) => BoardElement | undefined; measureCtx?: CanvasRenderingContext2D | null }
) {
  const measureCtx = options?.measureCtx ?? null
  const resolver = options?.resolveElement
  const start = resolveLineEndpointPosition(element, 'start', { resolveElement: resolver, measureCtx })
  const end = resolveLineEndpointPosition(element, 'end', { resolveElement: resolver, measureCtx })
  return { start, end, points: element.points ?? [] }
}

function findNearestAnchorBinding(
  point: { x: number; y: number },
  elements: ElementMap,
  excludeId: string,
  camera: CameraState,
  measureCtx: CanvasRenderingContext2D | null
): { binding: LineEndpointBinding; position: { x: number; y: number } } | null {
  const threshold = LINE_SNAP_DISTANCE_PX / Math.max(0.01, camera.zoom)
  let best: { binding: LineEndpointBinding; position: { x: number; y: number }; distance: number } | null = null
  const anchorCtx = measureCtx ?? null
  Object.values(elements).forEach((element) => {
    if (!element || element.id === excludeId) return
    if (!isStickyElement(element) && !isTextElement(element) && !isFrameLikeElement(element)) return
    LINE_ANCHORS.forEach((anchor) => {
      const details = getElementAnchorDetails(element, anchor, { ctx: anchorCtx })
      const position = details?.point
      if (!position) return
      const distance = Math.hypot(point.x - position.x, point.y - position.y)
      if (distance > threshold) return
      if (!best || distance < best.distance) {
        best = {
          binding: { elementId: element.id, anchor },
          position,
          distance,
        }
      }
    })
  })
  if (!best) return null
  const { binding, position } = best
  return { binding, position }
}

function getLinePathPoints(
  element: LineElement,
  options?: { resolveElement?: (id: string) => BoardElement | undefined; measureCtx?: CanvasRenderingContext2D | null }
) {
  const { start, end, points } = getResolvedLineEndpoints(element, options)
  return [start, ...points, end]
}

function pointToMultiSegmentDistance(
  point: { x: number; y: number },
  path: Array<{ x: number; y: number }>
) {
  if (path.length < 2) return Infinity
  let best = Infinity
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index]
    const b = path[index + 1]
    const distance = pointToSegmentDistance(point, a, b)
    if (distance < best) best = distance
  }
  return best
}

function getSegmentOrientation(
  a: { x: number; y: number },
  b: { x: number; y: number }
): 'horizontal' | 'vertical' {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  return dx >= dy ? 'horizontal' : 'vertical'
}

function createOrthogonalPoints(start: { x: number; y: number }, end: { x: number; y: number }) {
  const points: Array<{ x: number; y: number }> = []
  const deltaY = end.y - start.y
  const deltaX = end.x - start.x
  if (Math.abs(deltaY) > Math.abs(deltaX)) {
    const midY = start.y + deltaY / 2
    points.push({ x: start.x, y: midY }, { x: end.x, y: midY })
  } else {
    const midX = start.x + deltaX / 2
    points.push({ x: midX, y: start.y }, { x: midX, y: end.y })
  }
  return points
}

type ConnectorHandleSpec = {
  element: BoardElement
  anchor: ConnectorAnchor
  board: { x: number; y: number }
  screen: { x: number; y: number }
}

function getConnectorAnchorHandles(
  element: BoardElement,
  camera: CameraState,
  measureCtx: CanvasRenderingContext2D | null
): ConnectorHandleSpec[] {
  if (!isStickyElement(element) && !isTextElement(element) && !isFrameLikeElement(element)) return []
  const handles: ConnectorHandleSpec[] = []
  const ctx = measureCtx ?? null
  VISIBLE_CONNECTOR_ANCHORS.forEach((anchor) => {
    const details = getElementAnchorDetails(element, anchor, { ctx })
    if (!details) return
    const anchorPoint = details.point
    const dirX = details.point.x - details.center.x
    const dirY = details.point.y - details.center.y
    const length = Math.hypot(dirX, dirY)
    const offset = (CONNECTOR_HANDLE_OFFSET_PX + CONNECTOR_HANDLE_RADIUS_PX) / Math.max(0.01, camera.zoom)
    const boardOffset = length > 1e-5 ? { x: (dirX / length) * offset, y: (dirY / length) * offset } : { x: 0, y: 0 }
    const markerBoard = { x: anchorPoint.x + boardOffset.x, y: anchorPoint.y + boardOffset.y }
    const screen = {
      x: (markerBoard.x + camera.offsetX) * camera.zoom,
      y: (markerBoard.y + camera.offsetY) * camera.zoom,
    }
    handles.push({ element, anchor, board: anchorPoint, screen })
  })
  return handles
}

function drawConnectorAnchors(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  camera: CameraState,
  measureCtx: CanvasRenderingContext2D | null,
  highlight: { elementId: string; anchor: ConnectorAnchor } | null
) {
  const handles = getConnectorAnchorHandles(element, camera, measureCtx)
  if (handles.length === 0) return
  handles.forEach((handle) => {
    ctx.save()
    const active =
      highlight && highlight.elementId === handle.element.id && highlight.anchor === handle.anchor
    ctx.fillStyle = active ? '#ffffff' : ACCENT_COLOR
    ctx.strokeStyle = active ? ACCENT_COLOR : '#ffffff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(handle.screen.x, handle.screen.y, CONNECTOR_HANDLE_RADIUS_PX, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  })
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  }
}

type ShapeElementBounds = TransformBounds

function resolveShapeMinSize(element: { type: BoardElement['type'] }) {
  return element.type === 'frame' ? FRAME_MIN_SIZE : RECT_MIN_SIZE
}

function getStickySize(element: StickyNoteElement) {
  const size = typeof element.size === 'number' && Number.isFinite(element.size) ? element.size : STICKY_SIZE
  return Math.max(STICKY_MIN_SIZE, size)
}

function getStickyBounds(element: StickyNoteElement): Rect {
  const size = getStickySize(element)
  return {
    left: element.x,
    top: element.y,
    right: element.x + size,
    bottom: element.y + size,
  }
}

function getShapeElementBounds(element: ShapeElement | FrameElement): ShapeElementBounds {
  const minSize = resolveShapeMinSize(element)
  const width = Math.max(minSize, element.w)
  const height = Math.max(minSize, element.h)
  const rotation = resolveTextRotation(element.rotation)
  return computeTransformBounds({
    x: element.x,
    y: element.y,
    width,
    height,
    rotation,
    scale: 1,
  })
}

function getRectangleElementBounds(element: RectangleElement): ShapeElementBounds {
  return getShapeElementBounds(element)
}

function getEllipseElementBounds(element: EllipseElement): ShapeElementBounds {
  return getShapeElementBounds(element)
}

function getLineStrokeWidth(element: LineElement) {
  if (typeof element.strokeWidth === 'number' && Number.isFinite(element.strokeWidth)) {
    return Math.max(0.5, element.strokeWidth)
  }
  return LINE_DEFAULT_STROKE_WIDTH
}

function getLineElementBounds(
  element: LineElement,
  options?: { resolveElement?: (id: string) => BoardElement | undefined; measureCtx?: CanvasRenderingContext2D | null }
): LineElementBounds {
  const { start, end, points } = getResolvedLineEndpoints(element, options)
  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }
  const strokeWidth = getLineStrokeWidth(element)
  const padding = strokeWidth / 2
  const pathPoints = [start, ...points, end]
  const aabb = pathPoints.reduce<Rect>(
    (acc, point) => ({
      left: Math.min(acc.left, point.x - padding),
      right: Math.max(acc.right, point.x + padding),
      top: Math.min(acc.top, point.y - padding),
      bottom: Math.max(acc.bottom, point.y + padding),
    }),
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
  )
  const length = pathPoints.reduce((sum, point, index) => {
    if (index === 0) return sum
    const prev = pathPoints[index - 1]
    return sum + Math.hypot(point.x - prev.x, point.y - prev.y)
  }, 0)
  return { start, end, points, center, length, aabb, strokeWidth }
}

function computeArrowLength(screenStrokeWidth: number, maxLength: number) {
  if (maxLength <= 0) return 0
  const clampedStroke = Math.max(1, screenStrokeWidth)
  const desiredLength = clamp(clampedStroke * 4, LINE_ARROW_MIN_SCREEN, LINE_ARROW_MAX_SCREEN)
  return Math.min(desiredLength, maxLength * 0.8)
}

function getElementBounds(
  element: BoardElement,
  ctx: CanvasRenderingContext2D | null,
  options?: { resolveElement?: (id: string) => BoardElement | undefined; measureCtx?: CanvasRenderingContext2D | null }
): Rect {
  if (isStickyElement(element)) return getStickyBounds(element)
  if (isTextElement(element)) return getTextElementBounds(element, ctx).aabb
  if (isRectangleElement(element)) return getRectangleElementBounds(element).aabb
  if (isFrameElement(element)) return getShapeElementBounds(element).aabb
  if (isRoundedRectElement(element)) return getShapeElementBounds(element).aabb
  if (isTriangleElement(element)) return getShapeElementBounds(element).aabb
  if (isDiamondElement(element)) return getShapeElementBounds(element).aabb
  if (isEllipseElement(element)) return getEllipseElementBounds(element).aabb
  if (isLineElement(element)) return getLineElementBounds(element, options).aabb
  return { left: 0, top: 0, right: 0, bottom: 0 }
}

function getMultiSelectionBounds(
  selectedIds: Set<string>,
  elements: ElementMap,
  ctx: CanvasRenderingContext2D | null,
  options?: { resolveElement?: (id: string) => BoardElement | undefined; measureCtx?: CanvasRenderingContext2D | null }
): Rect | null {
  if (selectedIds.size === 0) return null

  let bounds: Rect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  let hasValidElement = false

  selectedIds.forEach((id) => {
    const element = elements[id]
    if (!element) return
    const elementBounds = getElementBounds(element, ctx, options)
    bounds = {
      left: Math.min(bounds.left, elementBounds.left),
      top: Math.min(bounds.top, elementBounds.top),
      right: Math.max(bounds.right, elementBounds.right),
      bottom: Math.max(bounds.bottom, elementBounds.bottom),
    }
    hasValidElement = true
  })

  if (!hasValidElement) return null
  return bounds
}

function boardBoundsToScreen(bounds: Rect, camera: CameraState): Rect {
  return {
    left: (bounds.left + camera.offsetX) * camera.zoom,
    top: (bounds.top + camera.offsetY) * camera.zoom,
    right: (bounds.right + camera.offsetX) * camera.zoom,
    bottom: (bounds.bottom + camera.offsetY) * camera.zoom,
  }
}

function getStickyPadding(element: StickyNoteElement) {
  const size = getStickySize(element)
  const scale = size / STICKY_SIZE
  const paddingX = Math.max(2, STICKY_PADDING_X * scale)
  const paddingY = Math.max(2, STICKY_PADDING_Y * scale)
  return { paddingX, paddingY }
}

function getStickyInnerSize(element: StickyNoteElement) {
  const size = getStickySize(element)
  const { paddingX, paddingY } = getStickyPadding(element)
  return {
    width: Math.max(0, size - paddingX * 2),
    height: Math.max(0, size - paddingY * 2),
  }
}

function getStickyFontBounds(element: StickyNoteElement) {
  const ratio = getStickySize(element) / STICKY_SIZE
  const max = BASE_STICKY_FONT_MAX * ratio
  const min = Math.max(2, BASE_STICKY_FONT_MIN * ratio)
  return {
    max: Math.max(min, max),
    min,
  }
}

function clampFontSizeForElement(element: StickyNoteElement, fontSize: number) {
  const { min, max } = getStickyFontBounds(element)
  return clamp(fontSize, min, max)
}

function getElementFontSize(element: StickyNoteElement) {
  return resolveStickyFontSize(element.fontSize)
}

function rectsIntersect(a: Rect, b: Rect) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}
const DRAG_THROTTLE_MS = 50
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

function logInbound(message: unknown) {
  console.log('[ws in]', message)
}

function resolveStickyFontSize(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, value)
  }
  return BASE_STICKY_FONT_MAX
}

function resolveRoundedRectRadius(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value)
  }
  return ROUND_RECT_DEFAULT_RADIUS
}

function clampTailOffset(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : SPEECH_BUBBLE_DEFAULT_TAIL_OFFSET
}

function pointToSegmentDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq <= 1e-12) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1)
  const proj = { x: start.x + t * dx, y: start.y + t * dy }
  return Math.hypot(point.x - proj.x, point.y - proj.y)
}

function isStickyElement(element: BoardElement | null | undefined): element is StickyNoteElement {
  return !!element && element.type === 'sticky'
}

function isTextElement(element: BoardElement | null | undefined): element is TextElement {
  return !!element && element.type === 'text'
}

function isRectangleElement(element: BoardElement | null | undefined): element is RectangleElement {
  return !!element && element.type === 'rect'
}

function isEllipseElement(element: BoardElement | null | undefined): element is EllipseElement {
  return !!element && element.type === 'ellipse'
}

function isRoundedRectElement(
  element: BoardElement | null | undefined
): element is RoundedRectElement {
  return !!element && element.type === 'roundRect'
}

function isDiamondElement(element: BoardElement | null | undefined): element is DiamondElement {
  return !!element && element.type === 'diamond'
}

function isTriangleElement(element: BoardElement | null | undefined): element is TriangleElement {
  return !!element && element.type === 'triangle'
}

function isSpeechBubbleElement(
  element: BoardElement | null | undefined
): element is SpeechBubbleElement {
  return !!element && element.type === 'speechBubble'
}

function isShapeElement(element: BoardElement | null | undefined): element is ShapeElement {
  return (
    isRectangleElement(element) ||
    isEllipseElement(element) ||
    isRoundedRectElement(element) ||
    isDiamondElement(element) ||
    isTriangleElement(element) ||
    isSpeechBubbleElement(element)
  )
}

function isFrameElement(element: BoardElement | null | undefined): element is FrameElement {
  return !!element && element.type === 'frame'
}

function isFrameLikeElement(
  element: BoardElement | null | undefined
): element is FrameOrShapeElement {
  return isShapeElement(element) || isFrameElement(element)
}

function isCommentElement(element: BoardElement | null | undefined): element is CommentElement {
  return !!element && element.type === 'comment'
}

function getFrameLabelRect(element: FrameElement, camera: CameraState) {
  const width = Math.max(0, element.w * camera.zoom)
  const x = (element.x + camera.offsetX) * camera.zoom
  const y = (element.y + camera.offsetY) * camera.zoom
  return {
    x,
    y: y - FRAME_TITLE_HIT_HEIGHT - FRAME_HEADER_GAP_PX,
    width,
    height: FRAME_TITLE_HIT_HEIGHT,
  }
}

function getCommentBoardPosition(element: CommentElement) {
  return { x: element.x, y: element.y }
}

function isLineElement(element: BoardElement | null | undefined): element is LineElement {
  return !!element && element.type === 'line'
}

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
  fontSize?: number
  elementType: 'sticky' | 'text' | 'frame'
}

type TransformState =
  | {
      mode: 'scale'
      pointerId: number
      id: string
      elementType: 'text'
      handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's'
      startBounds: TextElementBounds
    }
  | {
      mode: 'shapeScale'
      pointerId: number
      id: string
      elementType: 'rect' | 'frame' | 'ellipse' | 'roundRect' | 'diamond' | 'triangle' | 'speechBubble'
      handle: 'nw' | 'ne' | 'se' | 'sw'
      startBounds: ShapeElementBounds
    }
  | {
      mode: 'width'
      pointerId: number
      id: string
      elementType: 'text' | 'rect' | 'frame' | 'ellipse' | 'roundRect' | 'diamond' | 'triangle' | 'speechBubble'
      handle: 'e' | 'w'
      startBounds: TextElementBounds | ShapeElementBounds
    }
  | {
      mode: 'height'
      pointerId: number
      id: string
      elementType: 'rect' | 'frame' | 'ellipse' | 'roundRect' | 'diamond' | 'triangle' | 'speechBubble'
      handle: 'n' | 's'
      startBounds: ShapeElementBounds
    }
  | {
      mode: 'rotate'
      pointerId: number
      id: string
      elementType: 'text' | 'rect' | 'frame' | 'ellipse' | 'roundRect' | 'diamond' | 'triangle' | 'speechBubble'
      handle: 'rotate'
      startBounds: TextElementBounds | ShapeElementBounds
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

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

function parseStickyElement(raw: unknown): StickyNoteElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<StickyNoteElement>
  if (element.type !== 'sticky') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  if (typeof element.text !== 'string') return null
  const rawSize = typeof element.size === 'number' && Number.isFinite(element.size) ? element.size : STICKY_SIZE
  const size = Math.max(STICKY_MIN_SIZE, rawSize)
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
  }
}

function parseFrameElement(raw: unknown): FrameElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<FrameElement>
  if (element.type !== 'frame') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  if (typeof element.w !== 'number' || typeof element.h !== 'number') return null
  const width = Math.max(FRAME_MIN_SIZE, element.w)
  const height = Math.max(FRAME_MIN_SIZE, element.h)
  const rotation = resolveTextRotation(element.rotation)
  const title = typeof element.title === 'string' && element.title.trim().length > 0 ? element.title.trim() : 'Frame'
  return {
    id: element.id,
    type: 'frame',
    x: element.x,
    y: element.y,
    w: width,
    h: height,
    rotation,
    title,
  }
}

function parseEllipseElement(raw: unknown): EllipseElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<EllipseElement>
  if (element.type !== 'ellipse') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  if (typeof element.w !== 'number' || typeof element.h !== 'number') return null
  const width = Math.max(RECT_MIN_SIZE, element.w)
  const height = Math.max(RECT_MIN_SIZE, element.h)
  const rotation = resolveTextRotation(element.rotation)
  return {
    id: element.id,
    type: 'ellipse',
    x: element.x,
    y: element.y,
    w: width,
    h: height,
    fill: typeof element.fill === 'string' ? element.fill : RECT_DEFAULT_FILL,
    stroke: typeof element.stroke === 'string' ? element.stroke : RECT_DEFAULT_STROKE,
    rotation,
  }
}

function parseRoundedRectElement(raw: unknown): RoundedRectElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<RoundedRectElement>
  if (element.type !== 'roundRect') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  if (typeof element.w !== 'number' || typeof element.h !== 'number') return null
  const width = Math.max(RECT_MIN_SIZE, element.w)
  const height = Math.max(RECT_MIN_SIZE, element.h)
  const rotation = resolveTextRotation(element.rotation)
  const radiusValue = resolveRoundedRectRadius(element.r)
  return {
    id: element.id,
    type: 'roundRect',
    x: element.x,
    y: element.y,
    w: width,
    h: height,
    r: radiusValue,
    fill: typeof element.fill === 'string' ? element.fill : RECT_DEFAULT_FILL,
    stroke: typeof element.stroke === 'string' ? element.stroke : RECT_DEFAULT_STROKE,
    rotation,
  }
}

function parseDiamondElement(raw: unknown): DiamondElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<DiamondElement>
  if (element.type !== 'diamond') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  if (typeof element.w !== 'number' || typeof element.h !== 'number') return null
  const width = Math.max(RECT_MIN_SIZE, element.w)
  const height = Math.max(RECT_MIN_SIZE, element.h)
  const rotation = resolveTextRotation(element.rotation)
  return {
    id: element.id,
    type: 'diamond',
    x: element.x,
    y: element.y,
    w: width,
    h: height,
    fill: typeof element.fill === 'string' ? element.fill : RECT_DEFAULT_FILL,
    stroke: typeof element.stroke === 'string' ? element.stroke : RECT_DEFAULT_STROKE,
    rotation,
  }
}

function parseTriangleElement(raw: unknown): TriangleElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<TriangleElement>
  if (element.type !== 'triangle') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  if (typeof element.w !== 'number' || typeof element.h !== 'number') return null
  const width = Math.max(RECT_MIN_SIZE, element.w)
  const height = Math.max(RECT_MIN_SIZE, element.h)
  const rotation = resolveTextRotation(element.rotation)
  return {
    id: element.id,
    type: 'triangle',
    x: element.x,
    y: element.y,
    w: width,
    h: height,
    fill: typeof element.fill === 'string' ? element.fill : RECT_DEFAULT_FILL,
    stroke: typeof element.stroke === 'string' ? element.stroke : RECT_DEFAULT_STROKE,
    rotation,
  }
}

function parseSpeechBubbleElement(raw: unknown): SpeechBubbleElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<SpeechBubbleElement>
  if (element.type !== 'speechBubble') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  if (typeof element.w !== 'number' || typeof element.h !== 'number') return null
  const width = Math.max(RECT_MIN_SIZE, element.w)
  const height = Math.max(RECT_MIN_SIZE, element.h)
  const rotation = resolveTextRotation(element.rotation)
  const tailSpec = element.tail
  const defaultTailSize = Math.max(RECT_MIN_SIZE / 2, Math.min(width, height) * SPEECH_BUBBLE_DEFAULT_TAIL_RATIO)
  const tail = tailSpec
    ? ({
        side:
          tailSpec.side === 'top' || tailSpec.side === 'left' || tailSpec.side === 'right'
            ? tailSpec.side
            : 'bottom',
        offset: clampTailOffset(tailSpec.offset),
        size:
          typeof tailSpec.size === 'number'
            ? Math.max(RECT_MIN_SIZE / 2, tailSpec.size)
            : defaultTailSize,
      } satisfies SpeechBubbleTail)
    : undefined
  const bubble: SpeechBubbleElement = {
    id: element.id,
    type: 'speechBubble',
    x: element.x,
    y: element.y,
    w: width,
    h: height,
    fill: typeof element.fill === 'string' ? element.fill : RECT_DEFAULT_FILL,
    stroke: typeof element.stroke === 'string' ? element.stroke : RECT_DEFAULT_STROKE,
    rotation,
    tail,
  }
  return applySpeechBubbleTailSizing(bubble, width, height)
}

function isConnectorAnchor(value: unknown): value is ConnectorAnchor {
  return value === 'top' || value === 'right' || value === 'bottom' || value === 'left' || value === 'center'
}

function parseLineEndpointBindingField(value: unknown): LineEndpointBinding | undefined {
  if (!value || typeof value !== 'object') return undefined
  const binding = value as Partial<LineEndpointBinding>
  if (typeof binding.elementId !== 'string') return undefined
  if (!isConnectorAnchor(binding.anchor)) return undefined
  return { elementId: binding.elementId, anchor: binding.anchor }
}

function parseLineElement(raw: unknown): LineElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<LineElement>
  if (element.type !== 'line') return null
  if (typeof element.id !== 'string') return null
  if (
    typeof element.x1 !== 'number' ||
    typeof element.y1 !== 'number' ||
    typeof element.x2 !== 'number' ||
    typeof element.y2 !== 'number'
  ) {
    return null
  }
  const strokeWidth =
    typeof element.strokeWidth === 'number' && Number.isFinite(element.strokeWidth)
      ? Math.max(0.5, element.strokeWidth)
      : LINE_DEFAULT_STROKE_WIDTH
  const points = Array.isArray(element.points)
    ? element.points
        .map((point) =>
          point && typeof point === 'object' && typeof point.x === 'number' && typeof point.y === 'number'
            ? { x: point.x, y: point.y }
            : null
        )
        .filter((point): point is { x: number; y: number } => !!point)
    : undefined
  return {
    id: element.id,
    type: 'line',
    x1: element.x1,
    y1: element.y1,
    x2: element.x2,
    y2: element.y2,
    stroke: typeof element.stroke === 'string' ? element.stroke : LINE_DEFAULT_STROKE,
    strokeWidth,
    startArrow: !!element.startArrow,
    endArrow: !!element.endArrow,
    points,
    orthogonal: element.orthogonal === true,
    startBinding: parseLineEndpointBindingField(element.startBinding) ?? undefined,
    endBinding: parseLineEndpointBindingField(element.endBinding) ?? undefined,
  }
}

function parseCommentElement(raw: unknown): CommentElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<CommentElement>
  if (element.type !== 'comment') return null
  if (typeof element.id !== 'string') return null
  if (typeof element.x !== 'number' || typeof element.y !== 'number') return null
  const text = typeof element.text === 'string' ? element.text : ''
  const elementId = typeof element.elementId === 'string' ? element.elementId : undefined
  return {
    id: element.id,
    type: 'comment',
    x: element.x,
    y: element.y,
    text,
    elementId,
  }
}

function parseBoardElement(raw: unknown): BoardElement | null {
  if (!raw || typeof raw !== 'object') return null
  const type = (raw as { type?: string }).type
  if (type === 'sticky') return parseStickyElement(raw)
  if (type === 'text') return parseTextElement(raw)
  if (type === 'rect') return parseRectangleElement(raw)
  if (type === 'frame') return parseFrameElement(raw)
  if (type === 'ellipse') return parseEllipseElement(raw)
  if (type === 'roundRect') return parseRoundedRectElement(raw)
  if (type === 'diamond') return parseDiamondElement(raw)
  if (type === 'triangle') return parseTriangleElement(raw)
  if (type === 'speechBubble') return parseSpeechBubbleElement(raw)
  if (type === 'line') return parseLineElement(raw)
  if (type === 'comment') return parseCommentElement(raw)
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

function fontFitsSticky(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  maxWidth: number,
  maxHeight: number
) {
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

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  innerWidth: number,
  innerHeight: number,
  maxFontSize: number,
  minFontSize: number
) {
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

function getStickyScreenRect(element: StickyNoteElement, camera: CameraState) {
  const size = getStickySize(element) * camera.zoom
  return {
    x: (element.x + camera.offsetX) * camera.zoom,
    y: (element.y + camera.offsetY) * camera.zoom,
    size,
  }
}

function getSelectionFrameRect(element: StickyNoteElement, camera: CameraState) {
  const rect = getStickyScreenRect(element, camera)
  return {
    x: rect.x - SELECTION_FRAME_PADDING,
    y: rect.y - SELECTION_FRAME_PADDING,
    size: rect.size + SELECTION_FRAME_PADDING * 2,
  }
}

function drawStickyShadow(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  radius: number
) {
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
  const { paddingY } = getStickyPadding(element)
  const paddingYScreen = paddingY * camera.zoom
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
    const textY = screenY + paddingYScreen + offsetY + index * lineHeight
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
  ctx.lineWidth = 1 / scaleFactor
  const width = bounds.width
  const height = bounds.height
  ctx.beginPath()
  ctx.rect(-width / 2, -height / 2, width, height)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawEllipseElement(ctx: CanvasRenderingContext2D, element: EllipseElement, camera: CameraState) {
  const bounds = getEllipseElementBounds(element)
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
  const radiusX = bounds.width / 2
  const radiusY = bounds.height / 2
  ctx.beginPath()
  ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function getRoundedRectRadius(element: { r?: number }, width: number, height: number) {
  const requested = resolveRoundedRectRadius(element.r)
  return Math.min(requested, width / 2, height / 2)
}

function drawRoundedRectElement(
  ctx: CanvasRenderingContext2D,
  element: RoundedRectElement,
  camera: CameraState
) {
  const bounds = getShapeElementBounds(element)
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
  const radius = getRoundedRectRadius(element, width, height)
  ctx.beginPath()
  drawRoundedRectPath(ctx, -width / 2, -height / 2, width, height, radius)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawFrameElement(
  ctx: CanvasRenderingContext2D,
  element: FrameElement,
  camera: CameraState,
  options?: { hideLabel?: boolean }
) {
  const bounds = getShapeElementBounds(element)
  const screenCenterX = (bounds.center.x + camera.offsetX) * camera.zoom
  const screenCenterY = (bounds.center.y + camera.offsetY) * camera.zoom
  ctx.save()
  ctx.translate(screenCenterX, screenCenterY)
  ctx.rotate(bounds.rotation)
  const scaleFactor = bounds.scale * camera.zoom
  ctx.scale(scaleFactor, scaleFactor)
  const width = bounds.width
  const height = bounds.height
  ctx.fillStyle = FRAME_FILL_COLOR
  ctx.strokeStyle = FRAME_BORDER_COLOR
  ctx.lineWidth = 2 / scaleFactor
  ctx.beginPath()
  ctx.rect(-width / 2, -height / 2, width, height)
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  // Draw title in screen space so it stays legible across zoom levels.
  const labelRect = getFrameLabelRect(element, camera)
  if (!options?.hideLabel) {
    ctx.save()
    const screenFontSize = getFrameTitleScreenFontSize(camera.zoom)
    ctx.fillStyle = FRAME_TITLE_COLOR
    ctx.font = `${screenFontSize}px ${STICKY_FONT_FAMILY}`
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'left'
    const textY = labelRect.y + labelRect.height
    const title = element.title && element.title.trim().length > 0 ? element.title.trim() : 'Frame'
    ctx.fillText(title, labelRect.x, textY, Math.max(0, labelRect.width))
    ctx.restore()
  }
}

function drawCommentElement(ctx: CanvasRenderingContext2D, element: CommentElement, camera: CameraState) {
  const screenX = (element.x + camera.offsetX) * camera.zoom
  const screenY = (element.y + camera.offsetY) * camera.zoom
  const radius = 8
  ctx.save()
  ctx.fillStyle = '#0ea5e9'
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(screenX, screenY, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawDiamondElement(ctx: CanvasRenderingContext2D, element: DiamondElement, camera: CameraState) {
  const bounds = getShapeElementBounds(element)
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
  const halfWidth = bounds.width / 2
  const halfHeight = bounds.height / 2
  ctx.beginPath()
  ctx.moveTo(0, -halfHeight)
  ctx.lineTo(halfWidth, 0)
  ctx.lineTo(0, halfHeight)
  ctx.lineTo(-halfWidth, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function getLineStrokeColor(element: LineElement) {
  return element.stroke ?? LINE_DEFAULT_STROKE
}

function drawLineArrowhead(
  ctx: CanvasRenderingContext2D,
  tip: { x: number; y: number },
  origin: { x: number; y: number },
  strokeColor: string,
  screenStrokeWidth: number,
  arrowLength: number
) {
  if (arrowLength <= 1e-3) return
  const dx = origin.x - tip.x
  const dy = origin.y - tip.y
  const length = Math.hypot(dx, dy)
  if (length <= 1e-3) return
  const ux = dx / length
  const uy = dy / length
  const clampedStroke = Math.max(1, screenStrokeWidth)
  const cappedLength = Math.min(arrowLength, clamp(clampedStroke * 4, LINE_ARROW_MIN_SCREEN, LINE_ARROW_MAX_SCREEN))
  const arrowWidth = cappedLength * LINE_ARROW_WIDTH_FACTOR
  const baseX = tip.x + ux * cappedLength
  const baseY = tip.y + uy * cappedLength
  const perpX = -uy
  const perpY = ux
  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.lineTo(baseX + perpX * (arrowWidth / 2), baseY + perpY * (arrowWidth / 2))
  ctx.lineTo(baseX - perpX * (arrowWidth / 2), baseY - perpY * (arrowWidth / 2))
  ctx.closePath()
  ctx.fillStyle = strokeColor
  ctx.fill()
}

function drawLineElement(
  ctx: CanvasRenderingContext2D,
  element: LineElement,
  camera: CameraState,
  options?: { resolveElement?: (id: string) => BoardElement | undefined; measureCtx?: CanvasRenderingContext2D | null }
) {
  const strokeWidth = getLineStrokeWidth(element)
  const screenStrokeWidth = Math.max(1, strokeWidth * camera.zoom)
  const { start: startBoard, end: endBoard, points } = getResolvedLineEndpoints(element, options)
  const pathPoints = [startBoard, ...points, endBoard]
  const toScreen = (point: { x: number; y: number }) => ({
    x: (point.x + camera.offsetX) * camera.zoom,
    y: (point.y + camera.offsetY) * camera.zoom,
  })
  const strokeColor = getLineStrokeColor(element)
  const screenPoints = pathPoints.map(toScreen)
  const getSegmentLength = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y)
  const lineLength = screenPoints.reduce((sum, point, index) => {
    if (index === 0) return sum
    const prev = screenPoints[index - 1]
    return sum + getSegmentLength(prev, point)
  }, 0)
  let startTrim = 0
  let endTrim = 0
  if (lineLength > 0) {
    if (element.startArrow) {
      startTrim = computeArrowLength(screenStrokeWidth, lineLength)
    }
    if (element.endArrow) {
      endTrim = computeArrowLength(screenStrokeWidth, lineLength)
    }
    if (startTrim + endTrim > lineLength) {
      const scale = lineLength / (startTrim + endTrim)
      startTrim *= scale
      endTrim *= scale
    }
  }
  const adjustPolyline = (
    points: Array<{ x: number; y: number }>,
    trimStart: number,
    trimEnd: number
  ) => {
    const result = points.map((point) => ({ ...point }))
    const trimSegment = (direction: 'forward' | 'backward', trim: number) => {
      let remaining = trim
      if (direction === 'forward') {
        for (let i = 0; i < result.length - 1 && remaining > 0; i += 1) {
          const a = result[i]
          const b = result[i + 1]
          const length = getSegmentLength(a, b)
          if (length >= remaining) {
            const ratio = remaining / length
            result[i] = {
              x: a.x + (b.x - a.x) * ratio,
              y: a.y + (b.y - a.y) * ratio,
            }
            break
          }
          remaining -= length
          result[i] = { ...b }
        }
      } else {
        for (let i = result.length - 1; i > 0 && remaining > 0; i -= 1) {
          const a = result[i - 1]
          const b = result[i]
          const length = getSegmentLength(a, b)
          if (length >= remaining) {
            const ratio = remaining / length
            result[i] = {
              x: b.x - (b.x - a.x) * ratio,
              y: b.y - (b.y - a.y) * ratio,
            }
            break
          }
          remaining -= length
          result[i] = { ...a }
        }
      }
    }
    if (trimStart > 0) trimSegment('forward', trimStart)
    if (trimEnd > 0) trimSegment('backward', trimEnd)
    return result
  }
  const trimmedScreenPoints = adjustPolyline(screenPoints, startTrim, endTrim)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = screenStrokeWidth
  ctx.beginPath()
  trimmedScreenPoints.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y)
    else ctx.lineTo(point.x, point.y)
  })
  ctx.stroke()
  if (element.startArrow && startTrim > 0 && trimmedScreenPoints.length >= 2) {
    const [a, b] = trimmedScreenPoints.slice(0, 2)
    drawLineArrowhead(ctx, a, b, strokeColor, screenStrokeWidth, startTrim)
  }
  if (element.endArrow && endTrim > 0 && trimmedScreenPoints.length >= 2) {
    const slice = trimmedScreenPoints.slice(-2)
    const a = slice[0]
    const b = slice[1]
    drawLineArrowhead(ctx, b, a, strokeColor, screenStrokeWidth, endTrim)
  }
  ctx.restore()
}

type SpeechBubbleTail = Required<SpeechBubbleElement>['tail']

function getSpeechBubbleTail(element: SpeechBubbleElement, width: number, height: number) {
  const defaultSize = Math.max(RECT_MIN_SIZE / 2, Math.min(width, height) * SPEECH_BUBBLE_DEFAULT_TAIL_RATIO)
  return {
    side: element.tail?.side ?? 'bottom',
    offset: element.tail ? clampTailOffset(element.tail.offset) : SPEECH_BUBBLE_DEFAULT_TAIL_OFFSET,
    size: typeof element.tail?.size === 'number' ? Math.max(RECT_MIN_SIZE / 2, element.tail.size) : defaultSize,
  } satisfies SpeechBubbleTail
}

function applySpeechBubbleTailSizing(
  element: SpeechBubbleElement,
  width: number,
  height: number
): SpeechBubbleElement {
  const tail = getSpeechBubbleTail(element, width, height)
  const size = Math.max(RECT_MIN_SIZE / 2, Math.min(width, height) * SPEECH_BUBBLE_DEFAULT_TAIL_RATIO)
  return { ...element, tail: { ...tail, size } }
}

function withSpeechBubbleTail(element: ShapeElement, width: number, height: number): ShapeElement {
  if (!isSpeechBubbleElement(element)) return element
  return applySpeechBubbleTailSizing(element, width, height)
}

type TailSegment = {
  side: SpeechBubbleTail['side']
  baseStart: { x: number; y: number }
  baseEnd: { x: number; y: number }
  tip: { x: number; y: number }
}

function computeTailSegment(
  tail: SpeechBubbleTail,
  width: number,
  height: number,
  radius: number
): TailSegment {
  const left = -width / 2
  const right = width / 2
  const top = -height / 2
  const bottom = height / 2
  if (tail.side === 'left' || tail.side === 'right') {
    const available = height - radius * 2
    const baseSpan = Math.min(Math.max(tail.size, RECT_MIN_SIZE / 2), Math.max(RECT_MIN_SIZE / 2, available))
    const centerY = clamp(
      top + height * tail.offset,
      top + radius + baseSpan / 2,
      bottom - radius - baseSpan / 2
    )
    const baseStartY = centerY - baseSpan / 2
    const baseEndY = centerY + baseSpan / 2
    const edgeX = tail.side === 'right' ? right : left
    const tipX = edgeX + (tail.side === 'right' ? 1 : -1) * tail.size * 1.2
    const tipY = centerY - baseSpan * 0.25
    return {
      side: tail.side,
      baseStart: { x: edgeX, y: baseStartY },
      baseEnd: { x: edgeX, y: baseEndY },
      tip: { x: tipX, y: tipY },
    }
  }
  const available = width - radius * 2
  const baseSpan = Math.min(Math.max(tail.size, RECT_MIN_SIZE / 2), Math.max(RECT_MIN_SIZE / 2, available))
  const centerX = clamp(
    left + width * tail.offset,
    left + radius + baseSpan / 2,
    right - radius - baseSpan / 2
  )
  const baseStartX = centerX - baseSpan / 2
  const baseEndX = centerX + baseSpan / 2
  const edgeY = tail.side === 'top' ? top : bottom
  const tipY = edgeY + (tail.side === 'top' ? -1 : 1) * tail.size * 1.2
  const tipX = centerX - baseSpan * 0.25
  return {
    side: tail.side,
    baseStart: { x: baseStartX, y: edgeY },
    baseEnd: { x: baseEndX, y: edgeY },
    tip: { x: tipX, y: tipY },
  }
}

function getSpeechBubbleCornerRadius(width: number, height: number) {
  const base = Math.min(width, height) * SPEECH_BUBBLE_CORNER_RATIO
  return Math.min(base, width / 2, height / 2)
}

function drawSpeechBubbleElement(
  ctx: CanvasRenderingContext2D,
  element: SpeechBubbleElement,
  camera: CameraState
) {
  const bounds = getShapeElementBounds(element)
  ctx.save()
  const screenCenterX = (bounds.center.x + camera.offsetX) * camera.zoom
  const screenCenterY = (bounds.center.y + camera.offsetY) * camera.zoom
  ctx.translate(screenCenterX, screenCenterY)
  ctx.rotate(bounds.rotation)
  const scaleFactor = bounds.scale * camera.zoom
  ctx.scale(scaleFactor, scaleFactor)
  const width = bounds.width
  const height = bounds.height
  const radius = getSpeechBubbleCornerRadius(width, height)
  const tail = getSpeechBubbleTail(element, width, height)
  const tailSegment = computeTailSegment(tail, width, height, radius)
  ctx.fillStyle = element.fill ?? RECT_DEFAULT_FILL
  ctx.strokeStyle = element.stroke ?? RECT_DEFAULT_STROKE
  const lineWidth = 2 / scaleFactor
  ctx.lineWidth = lineWidth
  const left = -width / 2
  const right = width / 2
  const top = -height / 2
  const bottom = height / 2
  ctx.beginPath()
  ctx.moveTo(left + radius, top)
  if (tailSegment.side === 'top') {
    ctx.lineTo(tailSegment.baseStart.x, top)
    ctx.lineTo(tailSegment.tip.x, tailSegment.tip.y)
    ctx.lineTo(tailSegment.baseEnd.x, top)
  }
  ctx.lineTo(right - radius, top)
  ctx.arcTo(right, top, right, top + radius, radius)
  if (tailSegment.side === 'right') {
    ctx.lineTo(right, tailSegment.baseStart.y)
    ctx.lineTo(tailSegment.tip.x, tailSegment.tip.y)
    ctx.lineTo(right, tailSegment.baseEnd.y)
  }
  ctx.lineTo(right, bottom - radius)
  ctx.arcTo(right, bottom, right - radius, bottom, radius)
  if (tailSegment.side === 'bottom') {
    ctx.lineTo(tailSegment.baseStart.x, bottom)
    ctx.lineTo(tailSegment.tip.x, tailSegment.tip.y)
    ctx.lineTo(tailSegment.baseEnd.x, bottom)
  }
  ctx.lineTo(left + radius, bottom)
  ctx.arcTo(left, bottom, left, bottom - radius, radius)
  if (tailSegment.side === 'left') {
    ctx.lineTo(left, tailSegment.baseStart.y)
    ctx.lineTo(tailSegment.tip.x, tailSegment.tip.y)
    ctx.lineTo(left, tailSegment.baseEnd.y)
  }
  ctx.lineTo(left, top + radius)
  ctx.arcTo(left, top, left + radius, top, radius)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawTriangleElement(ctx: CanvasRenderingContext2D, element: TriangleElement, camera: CameraState) {
  const bounds = getShapeElementBounds(element)
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
  const halfWidth = bounds.width / 2
  const halfHeight = bounds.height / 2
  ctx.beginPath()
  ctx.moveTo(0, -halfHeight)
  ctx.lineTo(-halfWidth, halfHeight)
  ctx.lineTo(halfWidth, halfHeight)
  ctx.closePath()
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
  kind: 'corner' | 'scale' | 'width' | 'height' | 'rotate'
  handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'rotate'
  position: { x: number; y: number }
  anchor?: { x: number; y: number }
}

function getTransformHandleSpecs(
  bounds: TransformBounds,
  options: { cornerMode: 'scale' | 'corner'; verticalMode: 'height' | 'scale'; horizontalMode: 'width' }
): TransformHandleSpec[] {
  const specs: TransformHandleSpec[] = []
  const cornerHandles: Array<{ handle: 'nw' | 'ne' | 'se' | 'sw'; index: number }> = [
    { handle: 'nw', index: 0 },
    { handle: 'ne', index: 1 },
    { handle: 'se', index: 2 },
    { handle: 'sw', index: 3 },
  ]
  cornerHandles.forEach(({ handle, index }) => {
    specs.push({ kind: options.cornerMode, handle, position: bounds.corners[index] })
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
    const handles = getTransformHandleSpecs(bounds, {
      cornerMode: 'scale',
      verticalMode: 'scale',
      horizontalMode: 'width',
    })
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

function drawShapeSelection(
  ctx: CanvasRenderingContext2D,
  element: ShapeElement | FrameElement,
  camera: CameraState,
  options: { withHandles: boolean }
) {
  const bounds = getShapeElementBounds(element)
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
    const handles = getTransformHandleSpecs(bounds, {
      cornerMode: 'corner',
      verticalMode: 'height',
      horizontalMode: 'width',
    })
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

function drawLineSelection(
  ctx: CanvasRenderingContext2D,
  element: LineElement,
  camera: CameraState,
  options: { withHandles: boolean },
  resolveElement?: (id: string) => BoardElement | undefined,
  measureCtx?: CanvasRenderingContext2D | null
) {
  const { start: startBoard, end: endBoard, points } = getResolvedLineEndpoints(element, {
    resolveElement,
    measureCtx,
  })
  const toScreen = (point: { x: number; y: number }) => ({
    x: (point.x + camera.offsetX) * camera.zoom,
    y: (point.y + camera.offsetY) * camera.zoom,
  })
  const screenPath = [startBoard, ...points, endBoard].map(toScreen)
  const baseWidth = Math.max(1, getLineStrokeWidth(element) * camera.zoom)
  const selectionWidth = Math.max(2, baseWidth + 2)
  ctx.save()
  ctx.strokeStyle = ACCENT_COLOR
  ctx.lineWidth = selectionWidth
  ctx.lineCap = 'round'
  ctx.beginPath()
  screenPath.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y)
    else ctx.lineTo(point.x, point.y)
  })
  ctx.stroke()
  if (options.withHandles) {
    const drawHandle = (point: { x: number; y: number }) => {
      ctx.beginPath()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = ACCENT_COLOR
      ctx.lineWidth = 1
      ctx.arc(point.x, point.y, RESIZE_HANDLE_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    screenPath.forEach((point) => drawHandle(point))
  }
  ctx.restore()
}

function drawElementSelection(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  camera: CameraState,
  options: { withHandles: boolean },
  resolveElement?: (id: string) => BoardElement | undefined,
  measureCtx?: CanvasRenderingContext2D | null
) {
  if (isStickyElement(element)) {
    drawStickySelection(ctx, element, camera, options)
    return
  }
  if (isTextElement(element)) {
    drawTextSelection(ctx, element, camera, options)
    return
  }
  if (isLineElement(element)) {
    drawLineSelection(ctx, element, camera, options, resolveElement, measureCtx)
    return
  }
  if (isFrameElement(element)) {
    drawShapeSelection(ctx, element, camera, options)
    return
  }
  if (isCommentElement(element)) {
    const boardPosition = getCommentBoardPosition(element as CommentElement)
    const screenX = (boardPosition.x + camera.offsetX) * camera.zoom
    const screenY = (boardPosition.y + camera.offsetY) * camera.zoom
    const radius = 12
    ctx.save()
    ctx.strokeStyle = ACCENT_COLOR
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    return
  }
  if (isRectangleElement(element)) {
    drawShapeSelection(ctx, element, camera, options)
    return
  }
  if (isRoundedRectElement(element)) {
    drawShapeSelection(ctx, element, camera, options)
    return
  }
  if (isDiamondElement(element)) {
    drawShapeSelection(ctx, element, camera, options)
    return
  }
  if (isTriangleElement(element)) {
    drawShapeSelection(ctx, element, camera, options)
    return
  }
  if (isSpeechBubbleElement(element)) {
    drawShapeSelection(ctx, element, camera, options)
    return
  }
  if (isEllipseElement(element)) {
    drawShapeSelection(ctx, element, camera, options)
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
        startPositions: Record<
          string,
          { x: number; y: number; x2?: number; y2?: number; points?: Array<{ x: number; y: number }> }
        >
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
  const lineHandleStateRef = useRef<
    | null
    | {
        id: string
        pointerId: number
        handle: 'start' | 'end'
        candidateBinding: LineEndpointBinding | null
      }
  >(null)
  const lineBendStateRef = useRef<
    | null
    | {
        id: string
        pointerId: number
        index: number
        basePoints: Array<{ x: number; y: number }>
        prevOrientation: 'horizontal' | 'vertical'
        nextOrientation: 'horizontal' | 'vertical'
      }
  >(null)
const shapeCreationRef = useRef<
  | null
  | {
      pointerId: number
      start: { x: number; y: number }
      id: string
      baseSize: number
      hasDragged: boolean
      elementType: 'rect' | 'frame' | 'ellipse' | 'roundRect' | 'diamond' | 'triangle' | 'speechBubble'
    }
>(null)
  const lineCreationRef = useRef<
    | null
    | {
        pointerId: number
        id: string
        start: { x: number; y: number }
        hasDragged: boolean
        startBinding: LineEndpointBinding | null
        endBinding: LineEndpointBinding | null
        kind: 'straight' | 'elbow'
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
    | 'none'
    | 'pan'
    | 'drag'
    | 'marquee'
    | 'marqueeCandidate'
    | 'resize'
    | 'transform'
    | 'shape-create'
    | 'line-create'
    | 'line-handle'
    | 'line-bend'
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
  const commentPopoverRef = useRef<HTMLDivElement | null>(null)
  const lastSelectedCommentIdRef = useRef<string | null>(null)
  const skipCommentPopoverCloseRef = useRef(false)
  const measurementCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const releaseClickSuppression = useCallback(() => {
    requestAnimationFrame(() => {
      suppressClickRef.current = false
    })
  }, [])

  const preventNextPopoverClose = useCallback(() => {
    skipCommentPopoverCloseRef.current = true
    if (typeof window === 'undefined') {
      skipCommentPopoverCloseRef.current = false
      return
    }
    window.requestAnimationFrame(() => {
      skipCommentPopoverCloseRef.current = false
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
  const [connectorHighlight, setConnectorHighlight] = useState<
    { elementId: string; anchor: ConnectorAnchor } | null
  >(null)
  const [commentPopoverMode, setCommentPopoverMode] = useState<'closed' | 'view' | 'edit'>('closed')
  const [editingCommentDraft, setEditingCommentDraft] = useState('')
  const isCommentEditing = commentPopoverMode === 'edit'
  const marqueeRef = useRef<MarqueeState | null>(null)
  const setMarquee = useCallback(
    (next: MarqueeState | null | ((prev: MarqueeState | null) => MarqueeState | null)) => {
      const value = typeof next === 'function' ? (next as (prev: MarqueeState | null) => MarqueeState | null)(marqueeRef.current) : next
      marqueeRef.current = value
      setMarqueeState(value)
    },
    []
  )

  const updateConnectorHighlight = useCallback((binding: LineEndpointBinding | null) => {
    if (!binding) {
      setConnectorHighlight((prev) => (prev ? null : prev))
      return
    }
    setConnectorHighlight((prev) => {
      if (prev && prev.elementId === binding.elementId && prev.anchor === binding.anchor) return prev
      return { elementId: binding.elementId, anchor: binding.anchor }
    })
  }, [])

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

  // Zoom panel callbacks
  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { width, height } = canvas.getBoundingClientRect()
    const focalScreenX = width / 2
    const focalScreenY = height / 2

    setCameraState((prev) => {
      const focalBoardX = focalScreenX / prev.zoom - prev.offsetX
      const focalBoardY = focalScreenY / prev.zoom - prev.offsetY
      const newZoom = Math.min(MAX_ZOOM, prev.zoom * 1.2)
      const offsetX = focalScreenX / newZoom - focalBoardX
      const offsetY = focalScreenY / newZoom - focalBoardY
      return { offsetX, offsetY, zoom: newZoom }
    })
  }, [])

  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { width, height } = canvas.getBoundingClientRect()
    const focalScreenX = width / 2
    const focalScreenY = height / 2

    setCameraState((prev) => {
      const focalBoardX = focalScreenX / prev.zoom - prev.offsetX
      const focalBoardY = focalScreenY / prev.zoom - prev.offsetY
      const newZoom = Math.max(MIN_ZOOM, prev.zoom / 1.2)
      const offsetX = focalScreenX / newZoom - focalBoardX
      const offsetY = focalScreenY / newZoom - focalBoardY
      return { offsetX, offsetY, zoom: newZoom }
    })
  }, [])

  const handleZoomReset = useCallback(() => {
    setCameraState(initialCameraState)
  }, [])

  const handleZoomFit = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { width: viewportWidth, height: viewportHeight } = canvas.getBoundingClientRect()

    const allElements = Object.values(elements)
    if (allElements.length === 0) {
      setCameraState(initialCameraState)
      return
    }

    // Compute bounding box of all elements
    const measureCtx = getSharedMeasureContext()
    const resolveElement = (id: string) => elements[id]
    let bounds: Rect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }

    allElements.forEach((element) => {
      const elementBounds = getElementBounds(element, measureCtx, { resolveElement, measureCtx })
      bounds = {
        left: Math.min(bounds.left, elementBounds.left),
        top: Math.min(bounds.top, elementBounds.top),
        right: Math.max(bounds.right, elementBounds.right),
        bottom: Math.max(bounds.bottom, elementBounds.bottom),
      }
    })

    // Add padding (10% of bounds or min 60 board units)
    const boundsWidth = bounds.right - bounds.left
    const boundsHeight = bounds.bottom - bounds.top
    const paddingX = Math.max(60, boundsWidth * 0.1)
    const paddingY = Math.max(60, boundsHeight * 0.1)
    bounds = {
      left: bounds.left - paddingX,
      top: bounds.top - paddingY,
      right: bounds.right + paddingX,
      bottom: bounds.bottom + paddingY,
    }

    const paddedWidth = bounds.right - bounds.left
    const paddedHeight = bounds.bottom - bounds.top
    const boundsCenterX = (bounds.left + bounds.right) / 2
    const boundsCenterY = (bounds.top + bounds.bottom) / 2

    // Compute zoom to fit bounds in viewport
    const zoomX = viewportWidth / paddedWidth
    const zoomY = viewportHeight / paddedHeight
    const newZoom = clamp(Math.min(zoomX, zoomY), MIN_ZOOM, MAX_ZOOM)

    // Center bounds in viewport
    const offsetX = viewportWidth / 2 / newZoom - boundsCenterX
    const offsetY = viewportHeight / 2 / newZoom - boundsCenterY

    setCameraState({ offsetX, offsetY, zoom: newZoom })
  }, [elements])

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

  const beginEditingFrame = useCallback(
    (element: FrameElement) => {
      suppressClickRef.current = true
      releaseClickSuppression()
      setSelection(new Set([element.id]))
      const title = element.title?.trim() ? element.title : 'Frame'
      updateEditingState({
        id: element.id,
        elementType: 'frame',
        text: title,
        originalText: title,
      })
    },
    [releaseClickSuppression, setSelection, updateEditingState]
  )

  const openCommentPopoverForElement = useCallback((element: CommentElement, mode?: 'view' | 'edit') => {
    const desiredMode = mode ?? (element.text ? 'view' : 'edit')
    if (desiredMode === 'edit') {
      setEditingCommentDraft(element.text ?? '')
    }
    setCommentPopoverMode(desiredMode)
  }, [])


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
      if (isFrameElement(target)) {
        const nextTitle = current.text.trim() ? current.text.trim() : 'Frame'
        if (target.title === nextTitle) return prev
        updatedElement = { ...target, title: nextTitle }
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
      const pointInEllipse = (point: { x: number; y: number }, element: EllipseElement) => {
        const bounds = getEllipseElementBounds(element)
        const local = toTextLocalCoordinates(point, bounds)
        const rx = Math.max(RECT_MIN_SIZE / 2, bounds.width / 2)
        const ry = Math.max(RECT_MIN_SIZE / 2, bounds.height / 2)
        if (rx <= 0 || ry <= 0) return false
        const normalized = (local.x * local.x) / (rx * rx) + (local.y * local.y) / (ry * ry)
        return normalized <= 1
      }
      const pointInDiamond = (point: { x: number; y: number }, element: DiamondElement) => {
        const bounds = getShapeElementBounds(element)
        const local = toTextLocalCoordinates(point, bounds)
        const halfWidth = Math.max(RECT_MIN_SIZE / 2, bounds.width / 2)
        const halfHeight = Math.max(RECT_MIN_SIZE / 2, bounds.height / 2)
        if (halfWidth <= 0 || halfHeight <= 0) return false
        const dx = Math.abs(local.x) / halfWidth
        const dy = Math.abs(local.y) / halfHeight
        return dx + dy <= 1
      }
      const pointInTriangle = (point: { x: number; y: number }, element: TriangleElement) => {
        const bounds = getShapeElementBounds(element)
        const local = toTextLocalCoordinates(point, bounds)
        const halfWidth = Math.max(RECT_MIN_SIZE / 2, bounds.width / 2)
        const halfHeight = Math.max(RECT_MIN_SIZE / 2, bounds.height / 2)
        // Triangle vertices in local coordinates
        const p0 = { x: 0, y: -halfHeight }
        const p1 = { x: -halfWidth, y: halfHeight }
        const p2 = { x: halfWidth, y: halfHeight }
        const area = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
          Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2)
        const totalArea = area(p0, p1, p2)
        const area1 = area(local, p1, p2)
        const area2 = area(p0, local, p2)
        const area3 = area(p0, p1, local)
        const epsilon = Math.max(0.0001, totalArea * 0.001)
        return Math.abs(totalArea - (area1 + area2 + area3)) <= epsilon
      }
      const commentRadius = 10 / Math.max(0.01, cameraState.zoom)
      for (let i = values.length - 1; i >= 0; i -= 1) {
        const element = values[i]
        if (isLineElement(element)) {
          const tolerance = LINE_HIT_RADIUS_PX / cameraState.zoom
          const measureCtx = getSharedMeasureContext()
          const path = getLinePathPoints(element, {
            resolveElement: (elementId) => elements[elementId],
            measureCtx,
          })
          const distance = pointToMultiSegmentDistance({ x, y }, path)
          if (distance <= tolerance) {
            return element.id
          }
          continue
        }
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
        if (isFrameElement(element)) {
          const bounds = getShapeElementBounds(element)
          if (pointInPolygon({ x, y }, bounds.corners)) {
            return element.id
          }
          const screenPoint = {
            x: (x + cameraState.offsetX) * cameraState.zoom,
            y: (y + cameraState.offsetY) * cameraState.zoom,
          }
          const labelRect = getFrameLabelRect(element, cameraState)
          if (
            screenPoint.x >= labelRect.x &&
            screenPoint.x <= labelRect.x + labelRect.width &&
            screenPoint.y >= labelRect.y &&
            screenPoint.y <= labelRect.y + labelRect.height
          ) {
            return element.id
          }
          continue
        }
        if (isRoundedRectElement(element)) {
          const bounds = getShapeElementBounds(element)
          if (pointInPolygon({ x, y }, bounds.corners)) {
            return element.id
          }
          continue
        }
        if (isDiamondElement(element)) {
          if (pointInDiamond({ x, y }, element)) {
            return element.id
          }
          continue
        }
        if (isSpeechBubbleElement(element)) {
          const bounds = getShapeElementBounds(element)
          if (pointInPolygon({ x, y }, bounds.corners)) {
            return element.id
          }
          continue
        }
        if (isTriangleElement(element)) {
          if (pointInTriangle({ x, y }, element)) {
            return element.id
          }
          continue
        }
        if (isEllipseElement(element)) {
          if (pointInEllipse({ x, y }, element)) {
            return element.id
          }
          continue
        }
        if (isCommentElement(element)) {
          const dx = x - element.x
          const dy = y - element.y
          if (Math.hypot(dx, dy) <= commentRadius) {
            return element.id
          }
          continue
        }
        const aabb = getElementBounds(element, ctx, {
          resolveElement: (id) => elements[id],
          measureCtx: ctx,
        })
        if (x >= aabb.left && x <= aabb.right && y >= aabb.top && y <= aabb.bottom) {
          return element.id
        }
      }
      return null
    },
    [cameraState.offsetX, cameraState.offsetY, cameraState.zoom, elements]
  )

  const persistElementCreate = useCallback(async (board: string, element: BoardElement) => {
    try {
      const response = await fetch(`${API_BASE_URL}/boards/${board}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ element } satisfies { element: BoardElement }),
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
    (event: MouseEvent<HTMLCanvasElement> | ReactPointerEvent<HTMLCanvasElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      if (!joinedRef.current || !boardId) return
      if (editingStateRef.current || isCommentEditing) return
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
    [
      boardId,
      clearSelection,
      createStickyAtPoint,
      createTextAtPoint,
      hitTestElement,
      isCommentEditing,
      screenToBoard,
      toolMode,
    ]
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
      if (editingStateRef.current || isCommentEditing || !boardId) return
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
      } else if (isFrameElement(hitElement)) {
        beginEditingFrame(hitElement)
      } else if (isCommentElement(hitElement)) {
        suppressClickRef.current = true
        releaseClickSuppression()
        setSelection(new Set([hitElement.id]))
        preventNextPopoverClose()
        openCommentPopoverForElement(hitElement, 'edit')
      }
    },
    [
      beginEditingFrame,
      beginEditingSticky,
      beginEditingText,
      boardId,
      elements,
      hitTestElement,
      isCommentEditing,
      openCommentPopoverForElement,
      preventNextPopoverClose,
      releaseClickSuppression,
      screenToBoard,
      setSelection,
    ]
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

  const hitTestLineHandle = useCallback(
    (
      point: { x: number; y: number }
    ): { element: LineElement; handle: 'start' | 'end' } | null => {
      const selected = selectedIdsRef.current
      if (selected.size !== 1) return null
      const [id] = Array.from(selected)
      const element = elements[id]
      if (!isLineElement(element)) return null
      const measureCtx = getSharedMeasureContext()
      const { start, end } = getResolvedLineEndpoints(element, {
        resolveElement: (elementId) => elements[elementId],
        measureCtx,
      })
      const handles: Array<{ handle: 'start' | 'end'; x: number; y: number }> = [
        {
          handle: 'start',
          x: (start.x + cameraState.offsetX) * cameraState.zoom,
          y: (start.y + cameraState.offsetY) * cameraState.zoom,
        },
        {
          handle: 'end',
          x: (end.x + cameraState.offsetX) * cameraState.zoom,
          y: (end.y + cameraState.offsetY) * cameraState.zoom,
        },
      ]
      for (const handle of handles) {
        const distance = Math.hypot(point.x - handle.x, point.y - handle.y)
        if (distance <= RESIZE_HANDLE_HIT_RADIUS) {
          return { element, handle: handle.handle }
        }
      }
      return null
    },
    [cameraState.offsetX, cameraState.offsetY, cameraState.zoom, elements]
  )

  const hitTestConnectorAnchor = useCallback(
    (point: { x: number; y: number }): { element: BoardElement; anchor: ConnectorAnchor; board: { x: number; y: number } } | null => {
      const measureCtx = getSharedMeasureContext()
      const values = Object.values(elements)
      for (let index = values.length - 1; index >= 0; index -= 1) {
        const element = values[index]
        if (!element || isLineElement(element)) continue
        const handles = getConnectorAnchorHandles(element, cameraState, measureCtx)
        for (const handle of handles) {
          const distance = Math.hypot(point.x - handle.screen.x, point.y - handle.screen.y)
          if (distance <= CONNECTOR_HANDLE_RADIUS_PX + 4) {
            return { element: handle.element, anchor: handle.anchor, board: handle.board }
          }
        }
      }
      return null
    },
    [cameraState, elements]
  )

  const hitTestLineBendHandle = useCallback(
    (point: { x: number; y: number }): { element: LineElement; index: number } | null => {
      const selected = selectedIdsRef.current
      if (selected.size !== 1) return null
      const [id] = Array.from(selected)
      const element = elements[id]
      if (!isLineElement(element) || !element.points || element.points.length === 0) return null
      const measureCtx = getSharedMeasureContext()
      const resolved = getResolvedLineEndpoints(element, {
        resolveElement: (elementId) => elements[elementId],
        measureCtx,
      })
      const handles = resolved.points
      for (let index = 0; index < handles.length; index += 1) {
        const handle = handles[index]
        const screen = {
          x: (handle.x + cameraState.offsetX) * cameraState.zoom,
          y: (handle.y + cameraState.offsetY) * cameraState.zoom,
        }
        const distance = Math.hypot(point.x - screen.x, point.y - screen.y)
        if (distance <= RESIZE_HANDLE_HIT_RADIUS) {
          return { element, index }
        }
      }
      return null
    },
    [cameraState.offsetX, cameraState.offsetY, cameraState.zoom, elements]
  )

  const hitTestTransformHandle = useCallback(
    (
      point: { x: number; y: number }
    ): {
      element: TextElement | ShapeElement | FrameElement
      bounds: TextElementBounds | ShapeElementBounds
      handle: TransformHandleSpec
    } | null => {
      const selected = selectedIdsRef.current
      if (selected.size !== 1) return null
      const [id] = Array.from(selected)
      const element = elements[id]
      const isFrame = isFrameElement(element)
      if (!isTextElement(element) && !isShapeElement(element) && !isFrame) return null
      const ctx = getSharedMeasureContext()
      const bounds = isTextElement(element)
        ? getTextElementBounds(element, ctx)
        : getShapeElementBounds(element)
      const handleOptions = isTextElement(element)
        ? { cornerMode: 'scale' as const, verticalMode: 'scale' as const, horizontalMode: 'width' as const }
        : { cornerMode: 'corner' as const, verticalMode: 'height' as const, horizontalMode: 'width' as const }
      let handles = getTransformHandleSpecs(bounds, handleOptions)
      if (isFrame) {
        handles = handles.filter((handle) => handle.kind !== 'rotate')
      }
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
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }

      if (editingStateRef.current || isCommentEditing) {
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
      if (toolMode === 'comment') {
        event.preventDefault()
        suppressClickRef.current = true
        const id = randomId()
        const element: CommentElement = {
          id,
          type: 'comment',
          x: boardPoint.x,
          y: boardPoint.y,
          text: '',
        }
        upsertElement(element)
        sendElementUpdate(element)
        setSelection(new Set([id]))
        preventNextPopoverClose()
        openCommentPopoverForElement(element, 'edit')
        if (boardId) {
          void persistElementCreate(boardId, element)
        }
        return
      }
      const transformHandleHit = toolMode === 'select' ? hitTestTransformHandle(canvasPoint) : null
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
            elementType: 'text',
            handle: handleSpec.handle as 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's',
            startBounds: transformHandleHit.bounds as TextElementBounds,
          }
        } else if (handleSpec.kind === 'corner') {
          const shapeType = transformHandleHit.element.type as
            | 'rect'
            | 'frame'
            | 'ellipse'
            | 'roundRect'
            | 'diamond'
            | 'triangle'
            | 'speechBubble'
          transformStateRef.current = {
            mode: 'shapeScale',
            pointerId: event.pointerId,
            id: transformHandleHit.element.id,
            elementType: shapeType,
            handle: handleSpec.handle as 'nw' | 'ne' | 'se' | 'sw',
            startBounds: transformHandleHit.bounds as ShapeElementBounds,
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
          const shapeType = transformHandleHit.element.type as
            | 'rect'
            | 'frame'
            | 'ellipse'
            | 'roundRect'
            | 'diamond'
            | 'triangle'
            | 'speechBubble'
          transformStateRef.current = {
            mode: 'height',
            pointerId: event.pointerId,
            id: transformHandleHit.element.id,
            elementType: shapeType,
            handle: handleSpec.handle as 'n' | 's',
            startBounds: transformHandleHit.bounds as ShapeElementBounds,
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
      if (toolMode === 'select') {
        const lineHandleHit = hitTestLineHandle(canvasPoint)
        if (lineHandleHit) {
          event.preventDefault()
          suppressClickRef.current = true
          interactionModeRef.current = 'line-handle'
          const measureCtx = getSharedMeasureContext()
          setElements((prev) => {
            const target = prev[lineHandleHit.element.id]
            if (!target || !isLineElement(target)) return prev
            const resolved = getResolvedLineEndpoints(target, {
              resolveElement: (elementId) => prev[elementId],
              measureCtx,
            })
            let updated: LineElement
            if (lineHandleHit.handle === 'start') {
              updated = { ...target, startBinding: undefined, x1: resolved.start.x, y1: resolved.start.y }
            } else {
              updated = { ...target, endBinding: undefined, x2: resolved.end.x, y2: resolved.end.y }
            }
            return { ...prev, [target.id]: updated }
          })
          lineHandleStateRef.current = {
            id: lineHandleHit.element.id,
            pointerId: event.pointerId,
            handle: lineHandleHit.handle,
            candidateBinding:
              lineHandleHit.handle === 'start'
                ? lineHandleHit.element.startBinding ?? null
                : lineHandleHit.element.endBinding ?? null,
          }
          if (event.currentTarget.setPointerCapture) {
            event.currentTarget.setPointerCapture(event.pointerId)
          }
          return
        }
        const bendHandleHit = hitTestLineBendHandle(canvasPoint)
        if (bendHandleHit) {
          event.preventDefault()
          suppressClickRef.current = true
          interactionModeRef.current = 'line-bend'
          const measureCtx = getSharedMeasureContext()
          const resolvedPath = getLinePathPoints(bendHandleHit.element, {
            resolveElement: (elementId) => elements[elementId],
            measureCtx,
          })
          const pathIndex = bendHandleHit.index + 1
          const prevPoint = resolvedPath[pathIndex - 1] ?? resolvedPath[pathIndex]
          const currentPoint = resolvedPath[pathIndex]
          const nextPoint = resolvedPath[pathIndex + 1] ?? resolvedPath[pathIndex]
          const prevOrientation = getSegmentOrientation(prevPoint, currentPoint)
          const nextOrientation = getSegmentOrientation(currentPoint, nextPoint)
          lineBendStateRef.current = {
            id: bendHandleHit.element.id,
            pointerId: event.pointerId,
            index: bendHandleHit.index,
            basePoints: bendHandleHit.element.points ? bendHandleHit.element.points.map((point) => ({ ...point })) : [],
            prevOrientation,
            nextOrientation,
          }
          if (event.currentTarget.setPointerCapture) {
            event.currentTarget.setPointerCapture(event.pointerId)
          }
          return
        }
      }
      const hitElementId = hitTestElement(boardPoint.x, boardPoint.y)
      const hitElement = hitElementId ? elements[hitElementId] : null
      if (!hitElement) {
        if (
          toolMode === 'rect' ||
          toolMode === 'frame' ||
          toolMode === 'ellipse' ||
          toolMode === 'roundRect' ||
          toolMode === 'diamond' ||
          toolMode === 'triangle' ||
          toolMode === 'speechBubble'
        ) {
          event.preventDefault()
          const id = randomId()
          const defaultWidth = Math.max(RECT_MIN_SIZE, (RECT_DEFAULT_SCREEN_SIZE * 1.6) / cameraState.zoom)
          const isEllipseTool = toolMode === 'ellipse'
          const defaultHeight = isEllipseTool
            ? defaultWidth
            : Math.max(RECT_MIN_SIZE, (RECT_DEFAULT_SCREEN_SIZE * 0.9) / cameraState.zoom)
          let newElement: FrameOrShapeElement
          if (toolMode === 'rect') {
            newElement = {
              id,
              type: 'rect',
              x: boardPoint.x,
              y: boardPoint.y,
              w: defaultWidth,
              h: defaultHeight,
              fill: RECT_DEFAULT_FILL,
              stroke: RECT_DEFAULT_STROKE,
              rotation: 0,
            }
          } else if (toolMode === 'frame') {
            const frameWidth = Math.max(FRAME_MIN_SIZE, FRAME_DEFAULT_WIDTH / cameraState.zoom)
            const frameHeight = Math.max(FRAME_MIN_SIZE, FRAME_DEFAULT_HEIGHT / cameraState.zoom)
            newElement = {
              id,
              type: 'frame',
              x: boardPoint.x,
              y: boardPoint.y,
              w: frameWidth,
              h: frameHeight,
              rotation: 0,
              title: 'Frame',
            }
          } else if (isEllipseTool) {
            newElement = {
              id,
              type: 'ellipse',
              x: boardPoint.x,
              y: boardPoint.y,
              w: defaultWidth,
              h: defaultHeight,
              fill: RECT_DEFAULT_FILL,
              stroke: RECT_DEFAULT_STROKE,
              rotation: 0,
            }
          } else if (toolMode === 'roundRect') {
            newElement = {
              id,
              type: 'roundRect',
              x: boardPoint.x,
              y: boardPoint.y,
              w: defaultWidth,
              h: defaultHeight,
              r: ROUND_RECT_DEFAULT_RADIUS,
              fill: RECT_DEFAULT_FILL,
              stroke: RECT_DEFAULT_STROKE,
              rotation: 0,
            }
          } else if (toolMode === 'diamond') {
            newElement = {
              id,
              type: 'diamond',
              x: boardPoint.x,
              y: boardPoint.y,
              w: defaultWidth,
              h: defaultHeight,
              fill: RECT_DEFAULT_FILL,
              stroke: RECT_DEFAULT_STROKE,
              rotation: 0,
            }
          } else if (toolMode === 'speechBubble') {
            const baseTailSize = Math.max(RECT_MIN_SIZE / 2, Math.min(defaultWidth, defaultHeight) * SPEECH_BUBBLE_DEFAULT_TAIL_RATIO)
            newElement = {
              id,
              type: 'speechBubble',
              x: boardPoint.x,
              y: boardPoint.y,
              w: defaultWidth,
              h: defaultHeight,
              fill: RECT_DEFAULT_FILL,
              stroke: RECT_DEFAULT_STROKE,
              rotation: 0,
              tail: { side: 'bottom', offset: SPEECH_BUBBLE_DEFAULT_TAIL_OFFSET, size: baseTailSize },
            }
          } else {
            newElement = {
              id,
              type: 'triangle',
              x: boardPoint.x,
              y: boardPoint.y,
              w: defaultWidth,
              h: defaultHeight,
              fill: RECT_DEFAULT_FILL,
              stroke: RECT_DEFAULT_STROKE,
              rotation: 0,
            }
          }
          shapeCreationRef.current = {
            pointerId: event.pointerId,
            start: boardPoint,
            id,
            baseSize: defaultWidth,
            hasDragged: false,
            elementType: toolMode as
              | 'rect'
              | 'frame'
              | 'ellipse'
              | 'roundRect'
              | 'diamond'
              | 'triangle'
              | 'speechBubble',
          }
          interactionModeRef.current = 'shape-create'
          suppressClickRef.current = true
          setElements((prev) => ({ ...prev, [id]: newElement }))
          setSelection(new Set([id]))
          return
        }
        if (toolMode === 'line' || toolMode === 'arrow' || toolMode === 'elbow') {
          const isElbowTool = toolMode === 'elbow'
          const anchorHit = hitTestConnectorAnchor(canvasPoint)
          const id = randomId()
          const measureCtx = getSharedMeasureContext()
          const fallbackSnap = findNearestAnchorBinding(boardPoint, elements, id, cameraState, measureCtx)
          const initialBinding = anchorHit?.anchor ? { elementId: anchorHit.element.id, anchor: anchorHit.anchor } : fallbackSnap?.binding ?? null
          const startPosition = anchorHit?.board ?? fallbackSnap?.position ?? boardPoint
          let newElement: LineElement = {
            id,
            type: 'line',
            x1: startPosition.x,
            y1: startPosition.y,
            x2: startPosition.x,
            y2: startPosition.y,
            stroke: LINE_DEFAULT_STROKE,
            strokeWidth: LINE_DEFAULT_STROKE_WIDTH,
            startArrow: false,
            endArrow: toolMode === 'arrow',
            orthogonal: isElbowTool,
            points: isElbowTool ? [] : undefined,
          }
          if (initialBinding) {
            newElement = { ...newElement, startBinding: initialBinding }
          }
          lineCreationRef.current = {
            pointerId: event.pointerId,
            id,
            start: startPosition,
            hasDragged: false,
            startBinding: initialBinding,
            endBinding: null,
            kind: isElbowTool ? 'elbow' : 'straight',
          }
          interactionModeRef.current = 'line-create'
          suppressClickRef.current = true
          setElements((prev) => ({ ...prev, [id]: newElement }))
          setSelection(new Set([id]))
          if (event.currentTarget.setPointerCapture) {
            event.currentTarget.setPointerCapture(event.pointerId)
          }
          return
        }
        dragStateRef.current = null
        marqueeCandidateRef.current = { startBoard: boardPoint, startScreen: canvasPoint, shift: event.shiftKey }
        setMarquee(null)
        interactionModeRef.current = 'marqueeCandidate'
        return
      }
      if (isCommentElement(hitElement)) {
        preventNextPopoverClose()
        openCommentPopoverForElement(hitElement)
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
      const startPositions: Record<
        string,
        { x: number; y: number; x2?: number; y2?: number; points?: Array<{ x: number; y: number }> }
      > = {}
      dragIds.forEach((id) => {
        const element = elements[id]
        if (element) {
          if (isLineElement(element)) {
            startPositions[id] = {
              x: element.x1,
              y: element.y1,
              x2: element.x2,
              y2: element.y2,
              points: element.points ? element.points.map((point) => ({ ...point })) : undefined,
            }
          } else {
            startPositions[id] = { x: element.x, y: element.y }
          }
        }
      })
      dragStateRef.current = {
        pointerId: event.pointerId,
        ids: dragIds,
        startPointer: boardPoint,
        startPositions,
      }
    },
    [
      boardId,
      cameraState.offsetX,
      cameraState.offsetY,
      cameraState.zoom,
      elements,
      hitTestElement,
      hitTestLineHandle,
      hitTestResizeHandle,
      hitTestTransformHandle,
      isCommentEditing,
      preventNextPopoverClose,
      openCommentPopoverForElement,
      persistElementCreate,
      screenToBoard,
      sendElementUpdate,
      setMarquee,
      setSelection,
      toolMode,
      upsertElement,
    ]
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const mode = interactionModeRef.current
      const rect = event.currentTarget.getBoundingClientRect()
      const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }

      if (editingStateRef.current || isCommentEditing) return

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

      if (mode === 'line-handle') {
        const lineHandleState = lineHandleStateRef.current
        if (!lineHandleState || lineHandleState.pointerId !== event.pointerId) return
        const boardPoint = screenToBoard(canvasPoint)
        const measureCtx = getSharedMeasureContext()
        const snap = findNearestAnchorBinding(boardPoint, elements, lineHandleState.id, cameraState, measureCtx)
        const targetPoint = snap?.position ?? boardPoint
        let updatedLine: LineElement | null = null
        setElements((prev) => {
          const target = prev[lineHandleState.id]
          if (!target || !isLineElement(target)) return prev
          const next: LineElement =
            lineHandleState.handle === 'start'
              ? { ...target, x1: targetPoint.x, y1: targetPoint.y }
              : { ...target, x2: targetPoint.x, y2: targetPoint.y }
          updatedLine = next
          return { ...prev, [lineHandleState.id]: next }
        })
        if (lineHandleStateRef.current) {
          lineHandleStateRef.current = { ...lineHandleStateRef.current, candidateBinding: snap?.binding ?? null }
        }
        updateConnectorHighlight(snap?.binding ?? null)
        if (updatedLine) {
          const now = Date.now()
          if (now - lastBroadcastRef.current >= DRAG_THROTTLE_MS) {
            sendElementsUpdate([updatedLine])
            lastBroadcastRef.current = now
          }
        }
        return
      }

      if (mode === 'line-bend') {
        const bendState = lineBendStateRef.current
        if (!bendState || bendState.pointerId !== event.pointerId) return
        const boardPoint = screenToBoard(canvasPoint)
        const measureCtx = getSharedMeasureContext()
        let updatedElement: LineElement | null = null
        setElements((prev) => {
          const target = prev[bendState.id]
          if (!target || !isLineElement(target)) return prev
          const points = target.points ? [...target.points] : []
          if (!points[bendState.index]) return prev
          const resolvedPath = getLinePathPoints(target, {
            resolveElement: (elementId) => prev[elementId],
            measureCtx,
          })
          const pathIndex = bendState.index + 1
          const prevPoint = resolvedPath[pathIndex - 1] ?? resolvedPath[pathIndex]
          const nextPoint = resolvedPath[pathIndex + 1] ?? resolvedPath[pathIndex]
          const nextValue = { x: boardPoint.x, y: boardPoint.y }
          if (bendState.prevOrientation === 'horizontal') nextValue.y = prevPoint.y
          else nextValue.x = prevPoint.x
          if (bendState.nextOrientation === 'horizontal') nextValue.y = nextPoint.y
          else nextValue.x = nextPoint.x
          points[bendState.index] = nextValue
          updatedElement = { ...target, points }
          return { ...prev, [target.id]: updatedElement }
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

      const transformState = transformStateRef.current
      if (mode === 'transform' && transformState && transformState.pointerId === event.pointerId) {
        const boardPoint = screenToBoard(canvasPoint)
        const measureCtx = getSharedMeasureContext()
        let updatedElement: BoardElement | null = null
        setElements((prev) => {
          const target = prev[transformState.id]
          if (!target) return prev
      let nextElement: BoardElement | null = null
          if (transformState.mode === 'scale') {
            if (!isTextElement(target)) return prev
            const pointerLocal = toTextLocalCoordinates(boardPoint, transformState.startBounds)
            const handleVector = getTextHandleLocalPosition(transformState.handle, transformState.startBounds)
            const denom = handleVector.x * handleVector.x + handleVector.y * handleVector.y
            if (denom > 0.0001) {
              const dot = pointerLocal.x * handleVector.x + pointerLocal.y * handleVector.y
              const rawScale = Math.abs(dot / denom)
              const nextScale = clamp(rawScale, TEXT_MIN_SCALE, TEXT_MAX_SCALE)
              nextElement = { ...target, scale: nextScale }
            }
          } else if (transformState.mode === 'shapeScale') {
            if (!isShapeElement(target) && !isFrameElement(target)) return prev
            const bounds = transformState.startBounds
            const pointerLocal = toTextLocalCoordinates(boardPoint, bounds)
            const minDimension = transformState.elementType === 'frame' ? FRAME_MIN_SIZE : RECT_MIN_SIZE
            const baseHalfWidth = Math.max(minDimension / 2, bounds.width / 2)
            const baseHalfHeight = Math.max(minDimension / 2, bounds.height / 2)
            const scaleX = baseHalfWidth > 0 ? Math.abs(pointerLocal.x) / baseHalfWidth : 1
            const scaleY = baseHalfHeight > 0 ? Math.abs(pointerLocal.y) / baseHalfHeight : 1
            const minScale = minDimension / Math.max(bounds.width, minDimension)
            const scale = Math.max(scaleX, scaleY, minScale)
            const newWidth = Math.max(minDimension, bounds.width * scale)
            const newHeight = Math.max(minDimension, bounds.height * scale)
            const newCenter = bounds.center
            const newX = newCenter.x - newWidth / 2
            const newY = newCenter.y - newHeight / 2
            let shapeNext: FrameOrShapeElement = { ...target, x: newX, y: newY, w: newWidth, h: newHeight }
            if (isSpeechBubbleElement(shapeNext)) {
              shapeNext = withSpeechBubbleTail(shapeNext, newWidth, newHeight)
            }
            nextElement = shapeNext
          } else if (transformState.mode === 'width') {
            const pointerLocal = toTextLocalCoordinates(boardPoint, transformState.startBounds)
            const direction = transformState.handle === 'e' ? 1 : -1
            if (transformState.elementType === 'text' && isTextElement(target)) {
              const bounds = transformState.startBounds as TextElementBounds
              const inset = bounds.layout.inset
              const minHalfWidth = (TEXT_MIN_WRAP_WIDTH + inset * 2) / 2
              const targetHalf = direction * pointerLocal.x
              const newHalfWidth = Math.max(minHalfWidth, targetHalf)
              const newWidth = newHalfWidth * 2
              const rawWrap = newWidth - inset * 2
              const newWrapWidth =
                rawWrap < TEXT_MIN_WRAP_WIDTH
                  ? TEXT_MIN_WRAP_WIDTH
                  : rawWrap > TEXT_MAX_WRAP_WIDTH
                    ? TEXT_MAX_WRAP_WIDTH
                    : rawWrap
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
            } else if (
              transformState.elementType !== 'text' &&
              (isShapeElement(target) || isFrameElement(target))
            ) {
              const bounds = transformState.startBounds
              const minHalfWidth =
                (transformState.elementType === 'frame' ? FRAME_MIN_SIZE : RECT_MIN_SIZE) / 2
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
              let shapeNext: FrameOrShapeElement = { ...target, x: newX, y: newY, w: newWidth }
              if (isSpeechBubbleElement(shapeNext)) {
                shapeNext = withSpeechBubbleTail(shapeNext, newWidth, bounds.height)
              }
              nextElement = shapeNext
            }
          } else if (
            transformState.mode === 'height' &&
            (isShapeElement(target) || isFrameElement(target))
          ) {
            const pointerLocal = toTextLocalCoordinates(boardPoint, transformState.startBounds)
            const direction = transformState.handle === 's' ? 1 : -1
            const bounds = transformState.startBounds
            const minHalfHeight =
              (transformState.elementType === 'frame' ? FRAME_MIN_SIZE : RECT_MIN_SIZE) / 2
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
            let shapeNext: FrameOrShapeElement = { ...target, x: newX, y: newY, h: newHeight }
            if (isSpeechBubbleElement(shapeNext)) {
              shapeNext = withSpeechBubbleTail(shapeNext, bounds.width, newHeight)
            }
            nextElement = shapeNext
          } else if (transformState.mode === 'rotate') {
            if (!isTextElement(target) && !isShapeElement(target)) return prev
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
              const rotTarget = target
              nextElement = { ...rotTarget, rotation: nextRotation }
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

      if (mode === 'shape-create') {
        const creation = shapeCreationRef.current
        if (!creation || creation.pointerId !== event.pointerId) return
        const boardPoint = screenToBoard(canvasPoint)
        let updatedElement: FrameOrShapeElement | null = null
        setElements((prev) => {
          const target = prev[creation.id]
          if (!target || (!isShapeElement(target) && !isFrameElement(target))) return prev
          const minSize = target.type === 'frame' ? FRAME_MIN_SIZE : RECT_MIN_SIZE
          const width = Math.max(minSize, Math.abs(boardPoint.x - creation.start.x))
          const height = Math.max(minSize, Math.abs(boardPoint.y - creation.start.y))
          const nextX = Math.min(creation.start.x, boardPoint.x)
          const nextY = Math.min(creation.start.y, boardPoint.y)
          let updated: FrameOrShapeElement = { ...target, x: nextX, y: nextY, w: width, h: height }
          if (isSpeechBubbleElement(updated)) {
            updated = withSpeechBubbleTail(updated, width, height)
          }
          updatedElement = updated
          return { ...prev, [creation.id]: updated }
        })
        if (updatedElement) {
          const elementForSize = updatedElement as FrameOrShapeElement
          const dragDistanceX = Math.abs(boardPoint.x - creation.start.x)
          const dragDistanceY = Math.abs(boardPoint.y - creation.start.y)
          const minSize = elementForSize.type === 'frame' ? FRAME_MIN_SIZE : RECT_MIN_SIZE
          if (!creation.hasDragged && (dragDistanceX > minSize || dragDistanceY > minSize)) {
            shapeCreationRef.current = { ...creation, hasDragged: true }
          }
        }
        if (updatedElement) {
          const now = Date.now()
          if (now - lastBroadcastRef.current >= DRAG_THROTTLE_MS) {
            sendElementsUpdate([updatedElement])
            lastBroadcastRef.current = now
          }
        }
        return
      }

      if (mode === 'line-create') {
        const creation = lineCreationRef.current
        if (!creation || creation.pointerId !== event.pointerId) return
        const boardPoint = screenToBoard(canvasPoint)
        const measureCtx = getSharedMeasureContext()
        const snap = findNearestAnchorBinding(boardPoint, elements, creation.id, cameraState, measureCtx)
        const targetPoint = snap?.position ?? boardPoint
        let nextLine: LineElement | null = null
        setElements((prev) => {
          const target = prev[creation.id]
          if (!target || !isLineElement(target)) return prev
          let updated: LineElement = { ...target, x2: targetPoint.x, y2: targetPoint.y }
          if (creation.kind === 'elbow') {
            const startPoint = creation.start
            updated = { ...updated, points: createOrthogonalPoints(startPoint, targetPoint), orthogonal: true }
          }
          nextLine = updated
          return { ...prev, [creation.id]: updated }
        })
        if (nextLine) {
          const dragDistance = Math.hypot(
            targetPoint.x - creation.start.x,
            targetPoint.y - creation.start.y
          )
          if (!creation.hasDragged && dragDistance > RECT_MIN_SIZE / 4) {
            lineCreationRef.current = { ...creation, hasDragged: true }
          }
          const now = Date.now()
          if (now - lastBroadcastRef.current >= DRAG_THROTTLE_MS) {
            sendElementsUpdate([nextLine])
            lastBroadcastRef.current = now
          }
        }
        if (lineCreationRef.current) {
          lineCreationRef.current = { ...lineCreationRef.current, endBinding: snap?.binding ?? null }
        }
        updateConnectorHighlight(snap?.binding ?? null)
        return
      }

      const resizeState = resizeStateRef.current
      if (mode === 'resize' && resizeState && resizeState.pointerId === event.pointerId) {
        const boardPoint = screenToBoard(canvasPoint)
        let updatedElement: StickyNoteElement | null = null
        const ctx = getMeasureContext()
        setElements((prev) => {
          const target = prev[resizeState.id]
          if (!target || !isStickyElement(target)) return prev
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
          const resized: StickyNoteElement = { ...target, x: nextX, y: nextY, size }
          const inner = getStickyInnerSize(resized)
          const bounds = getStickyFontBounds(resized)
          const fitted = ctx
            ? fitFontSize(ctx, resized.text, inner.width, inner.height, bounds.max, bounds.min)
            : bounds.max
          const updated = { ...resized, fontSize: fitted }
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
          let updated: BoardElement | null = null
          if (isLineElement(existing)) {
            if (typeof start.x2 !== 'number' || typeof start.y2 !== 'number') {
              updated = existing
            } else {
              const startBindingActive =
                !!existing.startBinding && !!prev[existing.startBinding.elementId]
              const endBindingActive =
                !!existing.endBinding && !!prev[existing.endBinding.elementId]
              let lineNext: LineElement = existing
              if (!startBindingActive) {
                lineNext = { ...lineNext, x1: start.x + deltaX, y1: start.y + deltaY }
              }
              if (!endBindingActive) {
                lineNext = { ...lineNext, x2: start.x2 + deltaX, y2: start.y2 + deltaY }
              }
              if (start.points && start.points.length > 0) {
                const shifted = start.points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY }))
                lineNext = { ...lineNext, points: shifted }
              }
              updated = lineNext
            }
          } else {
            updated = { ...existing, x: start.x + deltaX, y: start.y + deltaY }
          }
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
    [
      cameraState.offsetX,
      cameraState.offsetY,
      cameraState.zoom,
      getMeasureContext,
      isCommentEditing,
      screenToBoard,
      sendElementsUpdate,
      setMarquee,
    ]
  )

  const finishDrag = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>, reason: 'up' | 'cancel') => {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }

      if (editingStateRef.current || isCommentEditing) return

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

      if (mode === 'shape-create') {
        const creationState = shapeCreationRef.current
        shapeCreationRef.current = null
        suppressClickRef.current = false
        setMarquee(null)
        marqueeCandidateRef.current = null
        if (!creationState) return
        const element = elements[creationState.id]
        if (!element || (!isShapeElement(element) && !isFrameElement(element))) return
        sendElementsUpdate([element])
        if (boardId) {
          void persistElementCreate(boardId, element)
        }
        return
      }

      if (mode === 'line-handle') {
        const lineHandleState = lineHandleStateRef.current
        lineHandleStateRef.current = null
        suppressClickRef.current = false
        setMarquee(null)
        marqueeCandidateRef.current = null
        if (!lineHandleState) return
        const element = elements[lineHandleState.id]
        if (!element || !isLineElement(element)) return
        const binding = lineHandleState.candidateBinding ?? null
        const updated =
          lineHandleState.handle === 'start'
            ? { ...element, startBinding: binding ?? undefined }
            : { ...element, endBinding: binding ?? undefined }
        setElements((prev) => ({ ...prev, [updated.id]: updated }))
        sendElementsUpdate([updated])
        if (boardId) {
          void persistElementsUpdate(boardId, [updated])
        }
        updateConnectorHighlight(null)
        return
      }

      if (mode === 'line-bend') {
        const bendState = lineBendStateRef.current
        lineBendStateRef.current = null
        suppressClickRef.current = false
        setMarquee(null)
        marqueeCandidateRef.current = null
        if (!bendState) return
        const element = elements[bendState.id]
        if (!element || !isLineElement(element)) return
        sendElementsUpdate([element])
        if (boardId) {
          void persistElementsUpdate(boardId, [element])
        }
        return
      }

      if (mode === 'line-create') {
        const creationState = lineCreationRef.current
        lineCreationRef.current = null
        suppressClickRef.current = false
        setMarquee(null)
        marqueeCandidateRef.current = null
        if (!creationState) return
        const element = elements[creationState.id]
        const removeDraft = () => {
          setElements((prev) => {
            if (!prev[creationState.id]) return prev
            const next = { ...prev }
            delete next[creationState.id]
            return next
          })
          clearSelection()
        }
        if (!element || !isLineElement(element)) {
          removeDraft()
          return
        }
        const startBinding = creationState.startBinding
        const endBinding = creationState.endBinding
        const nextElement: LineElement = {
          ...element,
          startBinding: startBinding ?? undefined,
          endBinding: endBinding ?? undefined,
        }
        const finalElement = nextElement
        setElements((prev) => ({ ...prev, [finalElement.id]: finalElement }))
        const length = Math.hypot(finalElement.x2 - finalElement.x1, finalElement.y2 - finalElement.y1)
        if (!creationState.hasDragged && length < RECT_MIN_SIZE / 4) {
          removeDraft()
          return
        }
        sendElementsUpdate([finalElement])
        if (boardId) {
          void persistElementCreate(boardId, finalElement)
        }
        updateConnectorHighlight(null)
        return
      }

      const marqueeState = marqueeRef.current
      if (mode === 'marquee' && marqueeState && marqueeState.start && marqueeState.current) {
        const selectionRect = normalizeRect(marqueeState.start, marqueeState.current)
    const measureCtx = getSharedMeasureContext()
    const matchingIds = Object.values(elements)
          .filter((element) =>
            rectsIntersect(
              selectionRect,
              getElementBounds(element, measureCtx, {
                resolveElement: (id) => elements[id],
                measureCtx,
              })
            )
          )
          .map((element) => element.id)

        console.log('[marquee]', { marqueeRect: selectionRect, selectedCount: matchingIds.length, total: Object.keys(elements).length })
        if (matchingIds.length === 0) {
          const sample = Object.values(elements)[0]
          if (sample) {
            const sampleCtx = getSharedMeasureContext()
            console.log(
              '[marquee sample]',
              getElementBounds(sample, sampleCtx, {
                resolveElement: (id) => elements[id],
                measureCtx: sampleCtx,
              })
            )
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
    [
      boardId,
      clearSelection,
      elements,
      handleCanvasClick,
      isCommentEditing,
      persistElementCreate,
      persistElementsUpdate,
      releaseClickSuppression,
      sendElementsUpdate,
      setMarquee,
      setSelection,
    ]
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      finishDrag(event, 'up')
    },
    [finishDrag]
  )

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      finishDrag(event, 'cancel')
    },
    [finishDrag]
  )

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      finishDrag(event, 'cancel')
    },
    [finishDrag]
  )

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (editingStateRef.current || isCommentEditing) return
      const canvas = (event.currentTarget as HTMLCanvasElement | null) ?? canvasRef.current
      if (!canvas) return

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
      const rect = canvas.getBoundingClientRect()
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
    [isCommentEditing, screenToBoard]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const wheelListener = (event: WheelEvent) => {
      handleWheel(event)
    }
    const preventGesture = (event: Event) => {
      event.preventDefault()
    }

    const listenerOptions: AddEventListenerOptions = { passive: false }
    canvas.addEventListener('wheel', wheelListener, listenerOptions)
    const gestureEvents: Array<keyof HTMLElementEventMap> = ['gesturestart', 'gesturechange', 'gestureend']
    gestureEvents.forEach((type) => {
      canvas.addEventListener(type, preventGesture, listenerOptions)
    })

    return () => {
      canvas.removeEventListener('wheel', wheelListener)
      gestureEvents.forEach((type) => {
        canvas.removeEventListener(type, preventGesture)
      })
    }
  }, [handleWheel])

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
      if (editingStateRef.current || isCommentEditing) return
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
        setToolMode((prev) => (prev === 'rect' ? 'select' : 'rect'))
        return
      }
      if (event.key === 'f' || event.key === 'F') {
        setToolMode((prev) => (prev === 'frame' ? 'select' : 'frame'))
        return
      }
      if (event.key === 'e' || event.key === 'E') {
        setToolMode((prev) => (prev === 'ellipse' ? 'select' : 'ellipse'))
        return
      }
      if (event.key === 'o' || event.key === 'O') {
        setToolMode((prev) => (prev === 'roundRect' ? 'select' : 'roundRect'))
        return
      }
      if (event.key === 'd' || event.key === 'D') {
        setToolMode((prev) => (prev === 'diamond' ? 'select' : 'diamond'))
        return
      }
      if (event.key === 'b' || event.key === 'B') {
        setToolMode((prev) => (prev === 'speechBubble' ? 'select' : 'speechBubble'))
        return
      }
      if (event.key === 'y' || event.key === 'Y') {
        setToolMode((prev) => (prev === 'triangle' ? 'select' : 'triangle'))
        return
      }
      if (event.key === 'l' || event.key === 'L') {
        setToolMode((prev) => (prev === 'line' ? 'select' : 'line'))
        return
      }
      if (event.key === 'a' || event.key === 'A') {
        setToolMode((prev) => (prev === 'arrow' ? 'select' : 'arrow'))
        return
      }
      if (event.key === 'k' || event.key === 'K') {
        setToolMode((prev) => (prev === 'elbow' ? 'select' : 'elbow'))
        return
      }
      if (event.key === 'c' || event.key === 'C') {
        setToolMode((prev) => (prev === 'comment' ? 'select' : 'comment'))
        return
      }
      if (event.key === 'Escape') {
        setToolMode('select')
        return
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (editingStateRef.current || isCommentEditing) return
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
  }, [deleteSelectedElements, isCommentEditing])

  useEffect(() => {
    setSelection(new Set())
  }, [boardId, setSelection])

  useEffect(() => {
    if (toolMode !== 'line' && toolMode !== 'arrow') {
      setConnectorHighlight((prev) => (prev ? null : prev))
    }
  }, [toolMode])

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

  const selectedCommentId = useMemo(() => {
    if (selectedIds.size !== 1) return null
    const [candidateId] = Array.from(selectedIds)
    const candidate = elements[candidateId]
    return isCommentElement(candidate) ? candidateId : null
  }, [elements, selectedIds])

  const selectedComment = selectedCommentId ? (elements[selectedCommentId] as CommentElement | undefined) : null

  const selectedCommentScreenPosition = (() => {
    if (!selectedComment) return null
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const boardPosition = getCommentBoardPosition(selectedComment)
    const localX = (boardPosition.x + cameraState.offsetX) * cameraState.zoom
    const localY = (boardPosition.y + cameraState.offsetY) * cameraState.zoom
    return { x: rect.left + localX, y: rect.top + localY }
  })()

  const commitCommentDraft = useCallback(() => {
    if (!selectedCommentId) return
    let updatedElement: CommentElement | null = null
    setElements((prev) => {
      const target = prev[selectedCommentId]
      if (!isCommentElement(target)) return prev
      if (target.text === editingCommentDraft) return prev
      updatedElement = { ...target, text: editingCommentDraft }
      return { ...prev, [target.id]: updatedElement }
    })
    if (updatedElement) {
      sendElementsUpdate([updatedElement])
      if (boardId) {
        void persistElementsUpdate(boardId, [updatedElement])
      }
    }
    setCommentPopoverMode(editingCommentDraft ? 'view' : 'edit')
  }, [boardId, editingCommentDraft, persistElementsUpdate, selectedCommentId, sendElementsUpdate, setElements])

  const cancelCommentEditing = useCallback(() => {
    if (!selectedCommentId) return
    const element = elements[selectedCommentId]
    if (!isCommentElement(element)) return
    setEditingCommentDraft(element.text ?? '')
    setCommentPopoverMode(element.text ? 'view' : 'closed')
  }, [elements, selectedCommentId])

  useEffect(() => {
    const previous = lastSelectedCommentIdRef.current
    if (selectedComment && selectedComment.id !== previous) {
      lastSelectedCommentIdRef.current = selectedComment.id
      setEditingCommentDraft(selectedComment.text ?? '')
      setCommentPopoverMode(selectedComment.text ? 'view' : 'edit')
      return
    }
    if (!selectedComment && previous) {
      lastSelectedCommentIdRef.current = null
      setCommentPopoverMode('closed')
      setEditingCommentDraft('')
    }
  }, [selectedComment])

  useEffect(() => {
    if (!selectedComment) return
    if (commentPopoverMode === 'edit') return
    setEditingCommentDraft(selectedComment.text ?? '')
  }, [commentPopoverMode, selectedComment?.text])

  useEffect(() => {
    if (commentPopoverMode === 'closed') return
    const handlePointerDown = (event: PointerEvent) => {
      if (skipCommentPopoverCloseRef.current) {
        return
      }
      if (commentPopoverRef.current && commentPopoverRef.current.contains(event.target as Node)) {
        return
      }
      setCommentPopoverMode('closed')
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [commentPopoverMode])

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
    const sharedMeasureCtx = getSharedMeasureContext()
    const resolveElement = (id: string) => elements[id]
    const showConnectorAnchors = toolMode === 'line' || toolMode === 'arrow' || toolMode === 'elbow'
    const editingTextId = editingState?.elementType === 'text' ? editingState.id : null
    const editingFrameId = editingState?.elementType === 'frame' ? editingState.id : null
    const renderElement = (element: BoardElement) => {
      if (isFrameElement(element)) {
        drawFrameElement(ctx, element, cameraState, { hideLabel: editingFrameId === element.id })
      } else if (isCommentElement(element)) {
        drawCommentElement(ctx, element, cameraState)
      } else if (isStickyElement(element)) {
        drawSticky(ctx, element, cameraState)
      } else if (isTextElement(element)) {
        if (editingTextId && element.id === editingTextId) return
        drawTextElement(ctx, element, cameraState)
      } else if (isRectangleElement(element)) {
        drawRectangleElement(ctx, element, cameraState)
      } else if (isEllipseElement(element)) {
        drawEllipseElement(ctx, element, cameraState)
      } else if (isDiamondElement(element)) {
        drawDiamondElement(ctx, element, cameraState)
      } else if (isTriangleElement(element)) {
        drawTriangleElement(ctx, element, cameraState)
      } else if (isSpeechBubbleElement(element)) {
        drawSpeechBubbleElement(ctx, element, cameraState)
      } else if (isRoundedRectElement(element)) {
        drawRoundedRectElement(ctx, element, cameraState)
      } else if (isLineElement(element)) {
        drawLineElement(ctx, element, cameraState, { resolveElement, measureCtx: sharedMeasureCtx })
      }
      if (showConnectorAnchors && !isLineElement(element)) {
        drawConnectorAnchors(ctx, element, cameraState, sharedMeasureCtx, connectorHighlight)
      }
    }
    const frameElements = values.filter((element): element is FrameElement => isFrameElement(element))
    const otherElements = values.filter((element) => !isFrameElement(element))
    frameElements.forEach(renderElement)
    otherElements.forEach(renderElement)
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
      drawElementSelection(
        ctx,
        selectionElement,
        cameraState,
        { withHandles },
        resolveElement,
        sharedMeasureCtx
      )
    })
  }, [cameraState, connectorHighlight, editingState, elements, selectedIds, toolMode])

  const editingElement = editingState ? elements[editingState.id] : null
  const editingStickyElement = isStickyElement(editingElement) ? editingElement : null
  const editingRect = editingStickyElement ? getStickyScreenRect(editingStickyElement, cameraState) : null
  const editingInnerSize = editingStickyElement ? getStickyInnerSize(editingStickyElement) : null
  const editingStickyPadding = editingStickyElement ? getStickyPadding(editingStickyElement) : null
  const editingPaddingX = editingStickyPadding ? editingStickyPadding.paddingX * cameraState.zoom : null
  const editingPaddingY = editingStickyPadding ? editingStickyPadding.paddingY * cameraState.zoom : null
  const editingContentWidth = editingInnerSize ? editingInnerSize.width : null
  const editingContentHeight = editingInnerSize ? editingInnerSize.height : null
  const editingStickyFontSizePx =
    editingState?.elementType === 'sticky' && typeof editingState.fontSize === 'number'
      ? editingState.fontSize * cameraState.zoom
      : null
  const editingTextElement = isTextElement(editingElement) ? editingElement : null
  const editingTextWrapWidth = editingTextElement ? resolveTextWrapWidth(editingTextElement.w) : TEXT_DEFAULT_MAX_WIDTH
  const editingTextLayout =
    editingState?.elementType === 'text' && typeof editingState.fontSize === 'number'
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
  const editingTextRect = editingTextBounds && editingTextLayout
    ? {
        x: (editingTextBounds.left + cameraState.offsetX) * cameraState.zoom,
        y: (editingTextBounds.top + cameraState.offsetY) * cameraState.zoom,
        width: (editingTextWrapWidth + TEXT_SAFETY_INSET * 2) * cameraState.zoom,
        height: (editingTextLayout.totalHeight + TEXT_SAFETY_INSET * 2) * cameraState.zoom,
      }
    : null
  const editingTextFontSizePx =
    editingState?.elementType === 'text' && typeof editingState.fontSize === 'number'
      ? editingState.fontSize * cameraState.zoom
      : null
  const editingFrameElement = isFrameElement(editingElement) ? editingElement : null
  const editingFrameLabelRect = editingFrameElement ? getFrameLabelRect(editingFrameElement, cameraState) : null
  const editingFrameFontSizePx =
    editingState?.elementType === 'frame' ? getFrameTitleScreenFontSize(cameraState.zoom) : null

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
    if (!ctx || !current || !editingStickyElement || typeof current.fontSize !== 'number') return
    const inner = getStickyInnerSize(editingStickyElement)
    const bounds = getStickyFontBounds(editingStickyElement)
    const fitted = fitFontSize(ctx, current.text, inner.width, inner.height, bounds.max, bounds.min)
    if (Math.abs(fitted - current.fontSize) > 0.1) {
      updateEditingState((prev) => (prev ? { ...prev, fontSize: fitted } : prev))
    }
  }, [editingStickyElement, editingStickyElement?.size, getMeasureContext, updateEditingState])

  // Compute selection bounds for floating toolbar
  const selectionBoundsScreen = useMemo(() => {
    if (selectedIds.size === 0) return null
    const measureCtx = getSharedMeasureContext()
    const resolveElement = (id: string) => elements[id]
    const boardBounds = getMultiSelectionBounds(selectedIds, elements, measureCtx, {
      resolveElement,
      measureCtx,
    })
    if (!boardBounds) return null
    return boardBoundsToScreen(boardBounds, cameraState)
  }, [selectedIds, elements, cameraState])

  const showFloatingToolbar =
    selectedIds.size > 0 &&
    !editingState &&
    commentPopoverMode === 'closed'

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
        onDoubleClick={handleCanvasDoubleClick}
      />
      <ToolRail
        toolMode={toolMode}
        onToolModeChange={setToolMode}
        isEditing={!!editingState || commentPopoverMode !== 'closed'}
      />
      <ZoomPanel
        zoom={cameraState.zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleZoomReset}
        onFit={handleZoomFit}
      />
      {selectedComment &&
        commentPopoverMode !== 'closed' &&
        selectedCommentScreenPosition &&
        typeof document !== 'undefined' &&
        createPortal(
          <CommentPopover
            anchor={selectedCommentScreenPosition}
            comment={selectedComment}
            draft={editingCommentDraft}
            mode={commentPopoverMode}
            onCancel={cancelCommentEditing}
            onCommit={commitCommentDraft}
            onDraftChange={setEditingCommentDraft}
            onRequestEdit={() => openCommentPopoverForElement(selectedComment, 'edit')}
            popoverRef={commentPopoverRef}
          />,
          document.body
        )}
      <FloatingSelectionToolbar
        selectionBoundsScreen={selectionBoundsScreen}
        isVisible={showFloatingToolbar}
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
              padding:
                editingPaddingX !== null && editingPaddingY !== null
                  ? `${editingPaddingY}px ${editingPaddingX}px`
                  : undefined,
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
      {editingState?.elementType === 'frame' &&
        editingFrameElement &&
        editingFrameLabelRect &&
        editingFrameFontSizePx !== null && (
          <div
            className="canvas-board__text-editor"
            style={{
              left: editingFrameLabelRect.x,
              top: editingFrameLabelRect.y,
              width: editingFrameLabelRect.width,
              height: editingFrameLabelRect.height,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div
              ref={editingContentRef}
              className="canvas-board__text-editor-content"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="false"
              spellCheck={false}
              style={{
                fontSize: `${editingFrameFontSizePx}px`,
                lineHeight: 1.05,
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

type CommentPopoverProps = {
  anchor: { x: number; y: number }
  comment: CommentElement
  draft: string
  mode: 'view' | 'edit'
  onDraftChange: (value: string) => void
  onRequestEdit: () => void
  onCommit: () => void
  onCancel: () => void
  popoverRef: RefObject<HTMLDivElement | null>
}

function CommentPopover({
  anchor,
  comment,
  draft,
  mode,
  onDraftChange,
  onRequestEdit,
  onCommit,
  onCancel,
  popoverRef,
}: CommentPopoverProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (mode !== 'edit') return
    const input = inputRef.current
    if (!input) return
    input.focus({ preventScroll: true })
    input.setSelectionRange(input.value.length, input.value.length)
  }, [comment.id, mode])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onCommit()
    }
  }

  const handleBlur = (event: ReactFocusEvent<HTMLTextAreaElement>) => {
    if (!popoverRef.current) {
      onCommit()
      return
    }
    const related = event.relatedTarget as Node | null
    if (related && popoverRef.current.contains(related)) {
      return
    }
    onCommit()
  }

  const stopPropagation = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const sharedContainerStyle: CSSProperties = {
    position: 'fixed',
    left: anchor.x + 14,
    top: anchor.y - 20,
    minWidth: 200,
    maxWidth: 260,
    background: '#ffffff',
    border: '1px solid rgba(15,23,42,0.18)',
    borderRadius: 8,
    padding: '10px 12px',
    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.18)',
    color: '#0f172a',
    cursor: mode === 'view' ? 'pointer' : 'text',
    zIndex: 30,
  }

  return (
    <div
      ref={popoverRef}
      className="comment-popover"
      style={sharedContainerStyle}
      onPointerDownCapture={stopPropagation}
      onMouseDownCapture={stopPropagation}
      onDoubleClick={mode === 'view' ? onRequestEdit : undefined}
    >
      {mode === 'edit' ? (
        <>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Add a comment..."
            className="comment-popover__input"
            rows={4}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: 90,
              border: '1px solid rgba(15,23,42,0.25)',
              borderRadius: 6,
              padding: '6px 8px',
              resize: 'none',
              fontSize: 13,
              lineHeight: 1.35,
              color: '#0f172a',
              fontFamily: 'inherit',
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(15,23,42,0.55)' }}>
            Enter to save · Shift+Enter for newline
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{comment.text}</div>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onRequestEdit}
              style={{
                border: '1px solid rgba(14,165,233,0.8)',
                background: '#e0f2fe',
                color: '#0f172a',
                fontSize: 12,
                borderRadius: 4,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          </div>
        </>
      )}
    </div>
  )
}
