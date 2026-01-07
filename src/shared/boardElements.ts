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
}

export type BoardElement = StickyNoteElement
