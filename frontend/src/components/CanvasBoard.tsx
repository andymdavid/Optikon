import { useEffect, useRef, useState } from 'react'

export type Vector2D = {
  x: number
  y: number
}

export type CameraState = {
  position: Vector2D
  zoom: number
}

const initialCameraState: CameraState = {
  position: { x: 0, y: 0 },
  zoom: 1,
}

export function CanvasBoard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [cameraState] = useState<CameraState>(initialCameraState)

  useEffect(() => {
    let socket: WebSocket | null = null
    let retryDelay = 250
    let reconnectTimer: number | null = null
    let stopped = false
    let cancelledPendingOpen = false
    let keyListenerAttached = false

    const logIn = (message: unknown) => {
      console.log('[ws in]', message)
    }

    const logOut = (message: unknown) => {
      console.log('[ws out]', message)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key?.toLowerCase() !== 'e') return
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      const payload = {
        type: 'elementUpdate',
        payload: {
          boardId: 'dev-board',
          element: {
            id: Math.random().toString(36).slice(2, 10),
            type: 'test',
            x: Math.floor(Math.random() * 501),
            y: Math.floor(Math.random() * 501),
            ts: Date.now(),
          },
        },
      }
      logOut(payload)
      socket.send(JSON.stringify(payload))
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
            boardId: 'dev-board',
            user: { pubkey: 'anon' },
          },
        }
        logOut(joinPayload)
        currentSocket.send(JSON.stringify(joinPayload))
      })

      currentSocket.addEventListener('message', (event) => {
        try {
          const parsed = JSON.parse(event.data)
          logIn(parsed)
          if (parsed?.type === 'joinAck') {
            attachKeyListener()
          } else if (parsed?.type === 'elementUpdate') {
            console.log('[ws in elementUpdate]', parsed.payload)
          }
        } catch (error) {
          console.error('[ws error] failed to parse message', error)
        }
      })

      currentSocket.addEventListener('close', (event) => {
        console.log('[ws] close', { code: event.code, reason: event.reason })
        detachKeyListener()
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
      if (!socket) return
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
  }, [])

  return (
    <section
      aria-label="Canvas board"
      className="canvas-board"
      data-camera-x={cameraState.position.x}
      data-camera-y={cameraState.position.y}
      data-camera-zoom={cameraState.zoom}
    >
      <canvas ref={canvasRef} className="canvas-board__surface" />
    </section>
  )
}
