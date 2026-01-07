import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'

import type { BoardElement, StickyNoteElement } from '@shared/boardElements'

export type Vector2D = {
  x: number
  y: number
}

export type CameraState = {
  position: Vector2D
  zoom: number
}

type ElementMap = Record<string, StickyNoteElement>

const initialCameraState: CameraState = {
  position: { x: 0, y: 0 },
  zoom: 1,
}

const BOARD_STORAGE_KEY = 'optikon.devBoardId'
const BOARD_TITLE = 'Dev Board'
const API_BASE_URL = 'http://localhost:3025'
const STICKY_WIDTH = 140
const STICKY_HEIGHT = 100
const DRAG_THROTTLE_MS = 50

function logInbound(message: unknown) {
  console.log('[ws in]', message)
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
  return {
    id: element.id,
    type: 'sticky',
    x: element.x,
    y: element.y,
    text: element.text,
  }
}

function drawSticky(ctx: CanvasRenderingContext2D, element: StickyNoteElement, isSelected: boolean) {
  const width = STICKY_WIDTH
  const height = STICKY_HEIGHT
  ctx.save()
  ctx.fillStyle = '#fde68a'
  ctx.strokeStyle = isSelected ? '#f97316' : '#f59e0b'
  ctx.lineWidth = isSelected ? 3 : 2
  ctx.fillRect(element.x, element.y, width, height)
  ctx.strokeRect(element.x, element.y, width, height)
  ctx.fillStyle = '#111827'
  ctx.font = '14px "Inter", "Segoe UI", sans-serif'
  ctx.textBaseline = 'top'
  const padding = 10
  const maxWidth = width - padding * 2
  ctx.fillText(element.text, element.x + padding, element.y + padding, maxWidth)
  ctx.restore()
}

export function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const joinedRef = useRef(false)
  const createBoardInFlightRef = useRef(false)
  const dragStateRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const elementServerIdsRef = useRef<Record<string, number>>({})
  const suppressClickRef = useRef(false)
  const lastBroadcastRef = useRef(0)
  const [cameraState] = useState<CameraState>(initialCameraState)
  const [elements, setElements] = useState<ElementMap>({})
  const [boardId, setBoardId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const upsertSticky = useCallback((element: StickyNoteElement) => {
    setElements((prev) => ({ ...prev, [element.id]: element }))
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

  const persistElement = useCallback(
    async (board: string, element: StickyNoteElement) => {
      try {
        const response = await fetch(`${API_BASE_URL}/boards/${board}/elements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: element.type, element } satisfies { type: string; element: BoardElement }),
        })
        if (!response.ok) throw new Error('Failed to persist element')
        const data = (await response.json()) as { id?: number }
        if (typeof data?.id === 'number') {
          elementServerIdsRef.current[element.id] = data.id
        }
      } catch (error) {
        console.error('Failed to persist board element', error)
      }
    },
    []
  )

  const persistElementUpdate = useCallback(
    async (board: string, element: StickyNoteElement) => {
      const serverId = elementServerIdsRef.current[element.id]
      if (!serverId) return
      try {
        const response = await fetch(`${API_BASE_URL}/boards/${board}/elements/${serverId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ element } satisfies { element: BoardElement }),
        })
        if (!response.ok) throw new Error('Failed to update element')
      } catch (error) {
        console.error('Failed to update board element', error)
      }
    },
    []
  )

  const handleCanvasClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      if (!joinedRef.current || !boardId) return
      const rect = event.currentTarget.getBoundingClientRect()
      const element: StickyNoteElement = {
        id: randomId(),
        type: 'sticky',
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        text: 'New note',
      }
      upsertSticky(element)
      sendElementUpdate(element)
      void persistElement(boardId, element)
    },
    [boardId, persistElement, sendElementUpdate, upsertSticky]
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
      if (!boardId) return
      const rect = event.currentTarget.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const sticky = hitTestSticky(x, y)
      if (!sticky) {
        dragStateRef.current = null
        setSelectedId(null)
        suppressClickRef.current = false
        return
      }
      event.preventDefault()
      suppressClickRef.current = true
      dragStateRef.current = { id: sticky.id, offsetX: x - sticky.x, offsetY: y - sticky.y }
      setSelectedId(sticky.id)
      if (event.currentTarget.setPointerCapture) {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    },
    [boardId, hitTestSticky]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const dragState = dragStateRef.current
      if (!dragState) return
      const rect = event.currentTarget.getBoundingClientRect()
      const newX = event.clientX - rect.left - dragState.offsetX
      const newY = event.clientY - rect.top - dragState.offsetY
      let updated: StickyNoteElement | null = null
      setElements((prev) => {
        const target = prev[dragState.id]
        if (!target) return prev
        updated = { ...target, x: newX, y: newY }
        return { ...prev, [dragState.id]: updated }
      })
      const now = Date.now()
      if (updated && now - lastBroadcastRef.current >= DRAG_THROTTLE_MS) {
        sendElementUpdate(updated)
        lastBroadcastRef.current = now
      }
    },
    [sendElementUpdate]
  )

  const finishDrag = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const dragState = dragStateRef.current
      if (event.currentTarget.releasePointerCapture) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId)
        } catch (_error) {
          // ignore
        }
      }
      if (!dragState) return
      dragStateRef.current = null
      const finalElement = elements[dragState.id]
      if (finalElement) {
        sendElementUpdate(finalElement)
        if (boardId) {
          void persistElementUpdate(boardId, finalElement)
        }
      }
      setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    },
    [boardId, elements, persistElementUpdate, sendElementUpdate]
  )

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      finishDrag(event)
    },
    [finishDrag]
  )

  const handlePointerLeave = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      finishDrag(event)
    },
    [finishDrag]
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
    setSelectedId(null)
    elementServerIdsRef.current = {}
  }, [boardId])

  useEffect(() => {
    if (!boardId) return
    let cancelled = false

    const loadPersistedElements = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/boards/${boardId}/elements`)
        if (!response.ok) throw new Error('Failed to load elements')
        const data = (await response.json()) as {
          elements?: Array<{ id?: number; element?: BoardElement | null; props_json?: string }>
        }
        const parsed: StickyNoteElement[] = []
        data.elements?.forEach((entry) => {
          let candidate: unknown = entry?.element ?? null
          if (!candidate && entry?.props_json) {
            try {
              candidate = JSON.parse(entry.props_json)
            } catch (error) {
              console.error('Failed to parse persisted element JSON', error)
            }
          }
          const sticky = parseStickyElement(candidate)
          if (sticky) {
            parsed.push(sticky)
            if (typeof entry?.id === 'number') {
              elementServerIdsRef.current[sticky.id] = entry.id
            }
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
  }, [boardId, sendElementUpdate, upsertSticky])

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
      drawSticky(ctx, element, element.id === selectedId)
    })
  }, [elements, selectedId])

  return (
    <section
      aria-label="Canvas board"
      className="canvas-board"
      data-camera-x={cameraState.position.x}
      data-camera-y={cameraState.position.y}
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
        onPointerCancel={handlePointerLeave}
      />
    </section>
  )
}
