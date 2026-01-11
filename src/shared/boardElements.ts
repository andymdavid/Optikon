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

export interface DiamondElement extends CanvasElement {
  type: 'diamond'
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  rotation?: number
}

export interface TriangleElement extends CanvasElement {
  type: 'triangle'
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  rotation?: number
}

export interface SpeechBubbleTail {
  side: 'bottom' | 'top' | 'left' | 'right'
  offset: number
  size: number
}

export interface SpeechBubbleElement extends CanvasElement {
  type: 'speechBubble'
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  rotation?: number
  tail?: SpeechBubbleTail
}

export type ConnectorAnchor = 'top' | 'right' | 'bottom' | 'left' | 'center'

export interface LineEndpointBinding {
  elementId: string
  anchor: ConnectorAnchor
}

export interface LineElement extends CanvasElement {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke?: string
  strokeWidth?: number
  startArrow?: boolean
  endArrow?: boolean
  startBinding?: LineEndpointBinding
  endBinding?: LineEndpointBinding
}

export type BoardElement =
  | StickyNoteElement
  | TextElement
  | RectangleElement
  | EllipseElement
  | RoundedRectElement
  | DiamondElement
  | TriangleElement
  | SpeechBubbleElement
  | LineElement
