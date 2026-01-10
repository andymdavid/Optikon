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

export interface TextElement extends CanvasElement {
  type: 'text'
  x: number
  y: number
  text: string
  fontSize?: number
  w?: number
  scale?: number
  rotation?: number
}

export interface RectangleElement extends CanvasElement {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  rotation?: number
}

export interface EllipseElement extends CanvasElement {
  type: 'ellipse'
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  rotation?: number
}

export interface RoundedRectElement extends CanvasElement {
  type: 'roundRect'
  x: number
  y: number
  w: number
  h: number
  r?: number
  fill?: string
  stroke?: string
  rotation?: number
}

export type BoardElement =
  | StickyNoteElement
  | TextElement
  | RectangleElement
  | EllipseElement
  | RoundedRectElement
