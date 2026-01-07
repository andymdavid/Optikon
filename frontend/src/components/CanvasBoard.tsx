import { useRef, useState } from 'react'

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
