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

    const logIn = (message: unknown) => {
      console.log('[ws in]', message)
    }

    const logOut = (message: unknown) => {
      console.log('[ws out]', message)
    }

    const connect = () => {
      socket = new WebSocket('ws://localhost:3025/ws')

      socket.addEventListener('open', () => {
        retryDelay = 250
        const joinPayload = {
          type: 'joinBoard',
          payload: {
            boardId: 'dev-board',
            user: { pubkey: 'anon' },
          },
        }
        logOut(joinPayload)
        socket?.send(JSON.stringify(joinPayload))
      })

      socket.addEventListener('message', (event) => {
        logIn(event.data)
      })

      socket.addEventListener('close', () => {
        if (stopped) return
        const delay = retryDelay
        retryDelay = Math.min(retryDelay * 2, 5000)
        reconnectTimer = window.setTimeout(connect, delay)
      })

      socket.addEventListener('error', (event) => {
        console.error('[ws error]', event)
      })
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      socket?.close()
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
