export interface CanvasElement {
  id: string
  type: string
  createdAt?: number
}

export interface StickyNoteElement extends CanvasElement {
  type: 'sticky'
  x: number
  y: number
  text: string
  size?: number
  fontSize?: number
}

// TODO(phase-6.2.1): BoardElement only accepts StickyNoteElement today; extend to TextElement
// (and other future CanvasElement implementations) when we add multi-type support.
export type BoardElement = StickyNoteElement
