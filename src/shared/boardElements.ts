export interface CanvasElement {
  id: string
  type: string
  createdAt?: number
}

export interface TextBackground {
  color: string
  opacity: number
}

export interface TextStyle {
  fontWeight?: 400 | 700
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right'
  underline?: boolean
  strikethrough?: boolean
  bullets?: boolean
  color?: string
  highlight?: string | null
  background?: TextBackground | null
  link?: string | null
}

export interface StickyNoteElement extends CanvasElement {
  type: 'sticky'
  x: number
  y: number
  text: string
  size?: number
  fontSize?: number
  fill?: string
  style?: TextStyle
}

export interface TextElement extends CanvasElement {
  type: 'text'
  x: number
  y: number
  text: string
  fontFamily?: string
  fontSize?: number
  w?: number
  scale?: number
  rotation?: number
  style?: TextStyle
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
  text?: string
  fontFamily?: string
  fontSize?: number
  textAutoFit?: boolean
  style?: TextStyle
}

export interface FrameElement extends CanvasElement {
  type: 'frame'
  x: number
  y: number
  w: number
  h: number
  rotation?: number
  title: string
  text?: string
  fontFamily?: string
  fontSize?: number
  textAutoFit?: boolean
  style?: TextStyle
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
  text?: string
  fontFamily?: string
  fontSize?: number
  textAutoFit?: boolean
  style?: TextStyle
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
  text?: string
  fontFamily?: string
  fontSize?: number
  textAutoFit?: boolean
  style?: TextStyle
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
  text?: string
  fontFamily?: string
  fontSize?: number
  textAutoFit?: boolean
  style?: TextStyle
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
  text?: string
  fontFamily?: string
  fontSize?: number
  textAutoFit?: boolean
  style?: TextStyle
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
  text?: string
  fontFamily?: string
  fontSize?: number
  textAutoFit?: boolean
  style?: TextStyle
}

export interface ImageElement extends CanvasElement {
  type: 'image'
  x: number
  y: number
  w: number
  h: number
  url: string
  mimeType?: string
  attachmentId?: string
  rotation?: number
}

export interface CommentElement extends CanvasElement {
  type: 'comment'
  x: number
  y: number
  text: string
  elementId?: string
  authorPubkey?: string
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
  points?: Array<{ x: number; y: number }>
  orthogonal?: boolean
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
  | FrameElement
  | EllipseElement
  | RoundedRectElement
  | DiamondElement
  | TriangleElement
  | SpeechBubbleElement
  | ImageElement
  | LineElement
  | CommentElement
