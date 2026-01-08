import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from 'react'

import type { BoardElement, StickyNoteElement } from '@shared/boardElements'

export type CameraState = {
  offsetX: number
  offsetY: number
  zoom: number
}

type ElementMap = Record<string, StickyNoteElement>

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
type Rect = { left: number; top: number; right: number; bottom: number }

const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  left: Math.min(a.x, b.x),
  top: Math.min(a.y, b.y),
  right: Math.max(a.x, b.x),
  bottom: Math.max(a.y, b.y),
})

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

const rectsIntersect = (a: Rect, b: Rect) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
const DRAG_THROTTLE_MS = 50
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

function logInbound(message: unknown) {
  console.log('[ws in]', message)
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
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
  return {
    id: element.id,
    type: 'sticky',
    x: element.x,
    y: element.y,
    text: element.text,
    size,
  }
}

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function wrapStickyText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
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
        lines.push(current)
        current = word
      }
    })
    if (current) lines.push(current)
  })
  return lines.length === 0 ? [''] : lines
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

function drawSticky(ctx: CanvasRenderingContext2D, element: StickyNoteElement, camera: CameraState) {
  const stickyRect = getStickyScreenRect(element, camera)
  const width = stickyRect.size
  const height = stickyRect.size
  const screenX = stickyRect.x
  const screenY = stickyRect.y
  const radius = STICKY_CORNER_RADIUS * camera.zoom
  const paddingX = 16 * camera.zoom
  const paddingY = 14 * camera.zoom
  const fontSize = Math.max(12, 16 * camera.zoom)
  const lineHeight = fontSize * 1.3
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
  ctx.font = `${fontSize}px "Inter", "Segoe UI", sans-serif`
  ctx.textBaseline = 'top'
  const maxWidth = width - paddingX * 2
  const lines = wrapStickyText(ctx, element.text, maxWidth)
  lines.slice(0, 7).forEach((line, index) => {
    const textY = screenY + paddingY + index * lineHeight
    ctx.fillText(line, screenX + paddingX, textY, maxWidth)
  })
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
  const interactionModeRef = useRef<'none' | 'pan' | 'drag' | 'marquee' | 'marqueeCandidate' | 'resize'>('none')
  const marqueeCandidateRef = useRef<
    | null
    | {
        startBoard: { x: number; y: number }
        startScreen: { x: number; y: number }
        shift: boolean
      }
  >(null)
  const editingStateRef = useRef<EditingState | null>(null)
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null)
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

  const upsertSticky = useCallback((element: StickyNoteElement) => {
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
    (element: StickyNoteElement) => {
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
    (updated: StickyNoteElement[]) => {
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
    async (board: string, elementsToPersist: StickyNoteElement[]) => {
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

  const beginEditingSticky = useCallback(
    (element: StickyNoteElement) => {
      suppressClickRef.current = true
      releaseClickSuppression()
      setSelection(new Set([element.id]))
      updateEditingState({ id: element.id, text: element.text, originalText: element.text })
    },
    [releaseClickSuppression, setSelection, updateEditingState]
  )

  const commitEditing = useCallback(() => {
    const current = editingStateRef.current
    if (!current) return
    updateEditingState(null)
    let updatedElement: StickyNoteElement | null = null
    setElements((prev) => {
      const target = prev[current.id]
      if (!target) return prev
      if (target.text === current.text) return prev
      updatedElement = { ...target, text: current.text }
      return { ...prev, [current.id]: updatedElement }
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
      const element: StickyNoteElement = {
        id: randomId(),
        type: 'sticky',
        x: boardPoint.x,
        y: boardPoint.y,
        text: 'New note',
        size: STICKY_SIZE,
      }
      upsertSticky(element)
      sendElementUpdate(element)
      setSelection(new Set([element.id]))
      void (async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/boards/${boardId}/elements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: element.type, element } satisfies { type: string; element: BoardElement }),
          })
          if (!response.ok) throw new Error('Failed to persist element')
        } catch (error) {
          console.error('Failed to persist board element', error)
        }
      })()
    },
    [boardId, screenToBoard, sendElementUpdate, setSelection, upsertSticky]
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

  const hitTestSticky = useCallback(
    (x: number, y: number): StickyNoteElement | null => {
      const values = Object.values(elements)
      for (let i = values.length - 1; i >= 0; i -= 1) {
        const element = values[i]
        const size = getStickySize(element)
        if (
          x >= element.x &&
          x <= element.x + size &&
          y >= element.y &&
          y <= element.y + size
        ) {
          return element
        }
      }
      return null
    },
    [elements]
  )

  const handleCanvasDoubleClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (editingStateRef.current || !boardId) return
      const rect = event.currentTarget.getBoundingClientRect()
      const boardPoint = screenToBoard({ x: event.clientX - rect.left, y: event.clientY - rect.top })
      const sticky = hitTestSticky(boardPoint.x, boardPoint.y)
      if (!sticky) return
      event.preventDefault()
      beginEditingSticky(sticky)
    },
    [beginEditingSticky, boardId, hitTestSticky, screenToBoard]
  )

  const hitTestResizeHandle = useCallback(
    (point: { x: number; y: number }): { element: StickyNoteElement; handle: 'nw' | 'ne' | 'sw' | 'se' } | null => {
      const selected = selectedIdsRef.current
      if (selected.size !== 1) return null
      const [id] = Array.from(selected)
      const element = elements[id]
      if (!element) return null
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
      const boardPoint = screenToBoard(canvasPoint)
      const sticky = hitTestSticky(boardPoint.x, boardPoint.y)
      if (!sticky) {
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
        if (nextSelection.has(sticky.id)) nextSelection.delete(sticky.id)
        else nextSelection.add(sticky.id)
        if (nextSelection.size === 0) nextSelection.add(sticky.id)
      } else if (currentSelection.has(sticky.id)) {
        nextSelection = new Set(currentSelection)
      } else {
        nextSelection = new Set([sticky.id])
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
    [boardId, cameraState.offsetX, cameraState.offsetY, elements, hitTestResizeHandle, hitTestSticky, screenToBoard, setMarquee, setSelection]
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
      const updatedElements: StickyNoteElement[] = []
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
        const finalElements: StickyNoteElement[] = []
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

      const marqueeState = marqueeRef.current
      if (mode === 'marquee' && marqueeState && marqueeState.start && marqueeState.current) {
        const selectionRect = normalizeRect(marqueeState.start, marqueeState.current)
        const matchingIds = Object.values(elements)
          .filter((element) => rectsIntersect(selectionRect, getStickyBounds(element)))
          .map((element) => element.id)

        console.log('[marquee]', { marqueeRect: selectionRect, selectedCount: matchingIds.length, total: Object.keys(elements).length })
        if (matchingIds.length === 0) {
          const sample = Object.values(elements)[0]
          if (sample) console.log('[marquee sample]', getStickyBounds(sample))
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
    [boardId, elements, handleCanvasClick, clearSelection, persistElementsUpdate, releaseClickSuppression, sendElementsUpdate, setMarquee, setSelection]
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
    if (!boardId) return
    let cancelled = false

    const loadPersistedElements = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/boards/${boardId}/elements`)
        if (!response.ok) throw new Error('Failed to load elements')
        const data = (await response.json()) as {
          elements?: Array<{ id?: string; element?: BoardElement | null }>
        }
        const parsed: StickyNoteElement[] = []
        data.elements?.forEach((entry) => {
          const sticky = parseStickyElement(entry?.element)
          if (sticky) {
            parsed.push(sticky)
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
            const incoming = parseStickyElement((parsed.payload as { element?: unknown })?.element)
            if (incoming) upsertSticky(incoming)
          } else if (parsed?.type === 'elementsUpdate') {
            const payload = parsed.payload as { elements?: BoardElement[] }
            const updated = payload?.elements?.map((el) => parseStickyElement(el))?.filter(Boolean) as StickyNoteElement[]
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
  }, [boardId, removeElements, sendElementUpdate, upsertSticky])

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
    values.forEach((element) => {
      drawSticky(ctx, element, cameraState)
    })
    const selectedArray = Array.from(selectedIds)
    selectedArray.forEach((id) => {
      const element = elements[id]
      if (!element) return
      const withHandles = selectedArray.length === 1 && selectedArray[0] === id
      drawStickySelection(ctx, element, cameraState, { withHandles })
    })
  }, [cameraState, elements, selectedIds])

  const editingElement = editingState ? elements[editingState.id] : null
  const editingRect = editingElement ? getStickyScreenRect(editingElement, cameraState) : null
  const editingFontSize = editingElement ? Math.max(12, 16 * cameraState.zoom) : null
  const editingPaddingX = 16 * cameraState.zoom
  const editingPaddingY = 14 * cameraState.zoom

  useEffect(() => {
    if (!editingState) return
    const textarea = editingTextareaRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(editingState.text.length, editingState.text.length)
  }, [editingState])

  useEffect(() => {
    if (editingState && !editingElement) {
      updateEditingState(null)
    }
  }, [editingElement, editingState, updateEditingState])

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
      {editingState && editingElement && editingRect && editingFontSize && (
        <textarea
          ref={editingTextareaRef}
          className="canvas-board__sticky-editor"
          autoFocus
          value={editingState.text}
          onChange={(event) => {
            const nextValue = event.target.value
            updateEditingState((prev) => (prev ? { ...prev, text: nextValue } : prev))
          }}
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
          style={{
            position: 'absolute',
            left: editingRect.x,
            top: editingRect.y,
            width: editingRect.size,
            height: editingRect.size,
            fontSize: `${editingFontSize}px`,
            padding: `${editingPaddingY}px ${editingPaddingX}px`,
          }}
        />
      )}
    </section>
  )
}
