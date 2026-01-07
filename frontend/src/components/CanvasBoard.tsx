import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type WheelEvent } from 'react'

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
const STICKY_WIDTH = 140
const STICKY_HEIGHT = 100
type Rect = { left: number; top: number; right: number; bottom: number }

const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  left: Math.min(a.x, b.x),
  top: Math.min(a.y, b.y),
  right: Math.max(a.x, b.x),
  bottom: Math.max(a.y, b.y),
})

const getStickyBounds = (element: StickyNoteElement): Rect => ({
  left: element.x,
  top: element.y,
  right: element.x + STICKY_WIDTH,
  bottom: element.y + STICKY_HEIGHT,
})

const rectsIntersect = (a: Rect, b: Rect) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
const DRAG_THROTTLE_MS = 50
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

function logInbound(message: unknown) {
  console.log('[ws in]', message)
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
  return {
    id: element.id,
    type: 'sticky',
    x: element.x,
    y: element.y,
    text: element.text,
  }
}

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function drawSticky(
  ctx: CanvasRenderingContext2D,
  element: StickyNoteElement,
  camera: CameraState,
  isSelected: boolean
) {
  const width = STICKY_WIDTH * camera.zoom
  const height = STICKY_HEIGHT * camera.zoom
  const screenX = (element.x + camera.offsetX) * camera.zoom
  const screenY = (element.y + camera.offsetY) * camera.zoom
  ctx.save()
  ctx.fillStyle = '#fde68a'
  ctx.strokeStyle = isSelected ? '#f97316' : '#f59e0b'
  ctx.lineWidth = isSelected ? 3 : 2
  ctx.fillRect(screenX, screenY, width, height)
  ctx.strokeRect(screenX, screenY, width, height)
  ctx.fillStyle = '#111827'
  ctx.font = '14px "Inter", "Segoe UI", sans-serif'
  ctx.textBaseline = 'top'
  const padding = 10
  const maxWidth = width - padding * 2
  ctx.fillText(element.text, screenX + padding, screenY + padding, maxWidth)
  ctx.restore()
}

export function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const joinedRef = useRef(false)
  const createBoardInFlightRef = useRef(false)
  const dragStateRef = useRef<{ id: string; offsetX: number; offsetY: number; pointerId: number; startPointer: { x: number; y: number }; startPositions: Record<string, { x: number; y: number }> } | null>(null)
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
  const interactionModeRef = useRef<'none' | 'pan' | 'drag' | 'marquee' | 'marqueeCandidate'>('none')
  const marqueeCandidateRef = useRef<
    | null
    | {
        startBoard: { x: number; y: number }
        startScreen: { x: number; y: number }
        shift: boolean
      }
  >(null)
  const releaseClickSuppression = useCallback(() => {
    requestAnimationFrame(() => {
      suppressClickRef.current = false
    })
  }, [])
  const [cameraState, setCameraState] = useState<CameraState>(initialCameraState)
  const [elements, setElements] = useState<ElementMap>({})
  const [boardId, setBoardId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [marquee, setMarquee] = useState<{
    start: { x: number; y: number }
    current: { x: number; y: number }
    screenStart: { x: number; y: number }
    screenCurrent: { x: number; y: number }
    shift: boolean
  } | null>(null)

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

  const handleCanvasClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement> | PointerEvent<HTMLCanvasElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      if (!joinedRef.current || !boardId) return
      const rect = event.currentTarget.getBoundingClientRect()
      const boardPoint = screenToBoard({ x: event.clientX - rect.left, y: event.clientY - rect.top })
      const element: StickyNoteElement = {
        id: randomId(),
        type: 'sticky',
        x: boardPoint.x,
        y: boardPoint.y,
        text: 'New note',
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
        if (
          x >= element.x &&
          x <= element.x + STICKY_WIDTH &&
          y >= element.y &&
          y <= element.y + STICKY_HEIGHT
        ) {
          return element
        }
      }
      return null
    },
    [elements]
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }

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
    [boardId, cameraState.offsetX, cameraState.offsetY, elements, hitTestSticky, screenToBoard, setSelection]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const mode = interactionModeRef.current
      const rect = event.currentTarget.getBoundingClientRect()
      const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }

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
    [cameraState.offsetX, cameraState.offsetY, cameraState.zoom, marquee, screenToBoard, sendElementsUpdate]
  )

  const finishDrag = useCallback(
    (event: PointerEvent<HTMLCanvasElement>, reason: 'up' | 'cancel') => {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }

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

      const marqueeState = marqueeRef.current
      if (mode === 'marquee' && marqueeState) {
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
        updateMarquee(null)
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
    [boardId, elements, handleCanvasClick, clearSelection, persistElementsUpdate, sendElementsUpdate, setSelection]
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
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const canvasPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const boardPoint = screenToBoard(canvasPoint)
      setCameraState((prev) => {
        const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9
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
    const { width, height } = canvas.getBoundingClientRect()
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    Object.values(elements).forEach((element) => {
      drawSticky(ctx, element, cameraState, selectedIds.has(element.id))
    })
  }, [cameraState, elements, selectedIds])

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
      />
      {marquee && (
        <div
          className="marquee-selection"
          style={{
            position: 'absolute',
            border: '1px dashed #38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            pointerEvents: 'none',
            left: Math.min(marquee.screenStart.x, marquee.screenCurrent.x),
            top: Math.min(marquee.screenStart.y, marquee.screenCurrent.y),
            width: Math.abs(marquee.screenCurrent.x - marquee.screenStart.x),
            height: Math.abs(marquee.screenCurrent.y - marquee.screenStart.y),
          }}
        />
      )}
    </section>
  )
}
