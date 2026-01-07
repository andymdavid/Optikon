import { useCallback, useEffect, useRef, useState } from 'react'

export type Vector2D = {
  x: number
  y: number
}

export type CameraState = {
  position: Vector2D
  zoom: number
}

type StickyElement = {
  id: string
  type: 'sticky'
  x: number
  y: number
  text: string
}

type ElementMap = Record<string, StickyElement>

const initialCameraState: CameraState = {
  position: { x: 0, y: 0 },
  zoom: 1,
}

const BOARD_ID = 'dev-board'

function logInbound(message: unknown) {
  console.log('[ws in]', message)
}

function logOutbound(message: unknown) {
  console.log('[ws out]', message)
}

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

function parseStickyElement(raw: unknown): StickyElement | null {
  if (!raw || typeof raw !== 'object') return null
  const element = raw as Partial<StickyElement>
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

function drawSticky(ctx: CanvasRenderingContext2D, element: StickyElement) {
  const width = 140
  const height = 100
  ctx.save()
  ctx.fillStyle = '#fde68a'
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 2
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
  const [cameraState] = useState<CameraState>(initialCameraState)
  const [elements, setElements] = useState<ElementMap>({})

  const upsertSticky = useCallback((element: StickyElement) => {
    setElements((prev) => ({ ...prev, [element.id]: element }))
  }, [])

  const sendElementUpdate = useCallback((element: StickyElement) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !joinedRef.current) return
    const message = {
      type: 'elementUpdate',
      payload: { boardId: BOARD_ID, element },
    }
    logOutbound(message)
    socket.send(JSON.stringify(message))
  }, [])

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!joinedRef.current) return
      const rect = event.currentTarget.getBoundingClientRect()
      const element: StickyElement = {
        id: randomId(),
        type: 'sticky',
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        text: 'New note',
      }
      upsertSticky(element)
      sendElementUpdate(element)
    },
    [sendElementUpdate, upsertSticky]
  )

  useEffect(() => {
    let socket: WebSocket | null = null
    let retryDelay = 250
    let reconnectTimer: number | null = null
    let stopped = false
    let cancelledPendingOpen = false
    let keyListenerAttached = false

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key?.toLowerCase() !== 'e') return
      if (!joinedRef.current) return
      const element: StickyElement = {
        id: randomId(),
        type: 'sticky',
        x: Math.floor(Math.random() * 501),
        y: Math.floor(Math.random() * 501),
        text: 'New note',
      }
      upsertSticky(element)
      sendElementUpdate(element)
    }

    const attachKeyListener = () => {
      if (keyListenerAttached) return
      window.addEventListener('keydown', handleKeyDown)
      keyListenerAttached = true
    }

    const detachKeyListener = () => {
      if (!keyListenerAttached) return
      window.removeEventListener('keydown', handleKeyDown)
      keyListenerAttached = false
    }

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
            boardId: BOARD_ID,
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
            attachKeyListener()
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
        detachKeyListener()
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
      detachKeyListener()
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
  }, [sendElementUpdate, upsertSticky])

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
      drawSticky(ctx, element)
    })
  }, [elements])

  return (
    <section
      aria-label="Canvas board"
      className="canvas-board"
      data-camera-x={cameraState.position.x}
      data-camera-y={cameraState.position.y}
      data-camera-zoom={cameraState.zoom}
    >
      <canvas ref={canvasRef} className="canvas-board__surface" onClick={handleCanvasClick} />
    </section>
  )
}
