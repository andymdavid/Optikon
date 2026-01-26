import {
  MousePointer2,
  StickyNote,
  Type,
  Square,
  Circle,
  Diamond,
  Triangle,
  MessageSquare,
  Frame,
  CircleAlert,
  Paperclip,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

export type ToolMode =
  | 'select'
  | 'sticky'
  | 'text'
  | 'rect'
  | 'line'
  | 'frame'
  | 'attachment'
  | 'comment'

export type LineToolKind = 'line' | 'curve' | 'elbow'
export type ShapeToolKind = 'rect' | 'ellipse' | 'roundRect' | 'diamond' | 'triangle' | 'speechBubble'

type ToolDefinition = {
  mode: ToolMode
  label: string
  icon: React.ReactNode
}

const TOOLS: ToolDefinition[] = [
  {
    mode: 'select',
    label: 'Select',
    icon: <MousePointer2 size={20} fill="currentColor" stroke="none" />,
  },
  {
    mode: 'sticky',
    label: 'Sticky Note',
    icon: <StickyNote size={20} strokeWidth={1.5} />,
  },
  {
    mode: 'text',
    label: 'Text',
    icon: <Type size={20} strokeWidth={1.5} />,
  },
  {
    mode: 'rect',
    label: 'Shapes',
    icon: <Square size={20} strokeWidth={1.5} />,
  },
  {
    mode: 'line',
    label: 'Line',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 16L16 4" />
      </svg>
    ),
  },
  {
    mode: 'frame',
    label: 'Frame',
    icon: <Frame size={20} strokeWidth={1.5} />,
  },
  {
    mode: 'attachment',
    label: 'Attachment',
    icon: <Paperclip size={20} strokeWidth={1.5} />,
  },
  {
    mode: 'comment',
    label: 'Comment',
    icon: <CircleAlert size={20} strokeWidth={1.5} />,
  },
]

export type ToolRailProps = {
  toolMode: ToolMode
  onToolModeChange: (mode: ToolMode) => void
  isEditing: boolean
  shapeToolKind: ShapeToolKind
  onShapeToolKindChange: (kind: ShapeToolKind) => void
  lineToolKind: LineToolKind
  onLineToolKindChange: (kind: LineToolKind) => void
  lineArrowEnabled: boolean
  onLineArrowEnabledChange: (next: boolean) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

const railStyle: CSSProperties = {
  position: 'fixed',
  left: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: 6,
  background: '#ffffff',
  borderRadius: 10,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)',
  zIndex: 20,
}

const buttonBaseStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#374151',
  background: 'transparent',
  transition: 'background 0.1s, color 0.1s',
}

const activeButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#e0f2fe',
  color: '#0ea5e9',
}

const lineShelfStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  background: '#ffffff',
  borderRadius: 12,
  padding: '10px 12px',
  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 180,
  zIndex: 25,
}

const lineShelfRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 36px)',
  gap: 6,
}

const shapeShelfRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 36px)',
  gap: 6,
}

const lineShelfLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#6b7280',
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
}

const lineOptionButton: CSSProperties = {
  ...buttonBaseStyle,
  width: 36,
  height: 36,
  borderRadius: 8,
  background: '#f8fafc',
}

const undoRailStyle: CSSProperties = {
  position: 'fixed',
  left: 12,
  background: '#ffffff',
  borderRadius: 10,
  padding: 6,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  zIndex: 20,
}

export function ToolRail({
  toolMode,
  onToolModeChange,
  isEditing,
  shapeToolKind,
  onShapeToolKindChange,
  lineToolKind,
  onLineToolKindChange,
  lineArrowEnabled,
  onLineArrowEnabledChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ToolRailProps) {
  const [lineShelfOpen, setLineShelfOpen] = useState(false)
  const [shapeShelfOpen, setShapeShelfOpen] = useState(false)
  const lineButtonRef = useRef<HTMLButtonElement | null>(null)
  const shapeButtonRef = useRef<HTMLButtonElement | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const [lineShelfOffset, setLineShelfOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [shapeShelfOffset, setShapeShelfOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [undoOffset, setUndoOffset] = useState<{ x: number; y: number }>({ x: 12, y: 0 })
  useEffect(() => {
    if (!lineShelfOpen || !lineButtonRef.current) return
    const buttonRect = lineButtonRef.current.getBoundingClientRect()
    setLineShelfOffset({ x: buttonRect.width + 8, y: lineButtonRef.current.offsetTop })
  }, [lineShelfOpen])
  useEffect(() => {
    if (!shapeShelfOpen || !shapeButtonRef.current) return
    const buttonRect = shapeButtonRef.current.getBoundingClientRect()
    setShapeShelfOffset({ x: buttonRect.width + 8, y: shapeButtonRef.current.offsetTop })
  }, [shapeShelfOpen])
  useEffect(() => {
    const updateUndoPosition = () => {
      if (!railRef.current) return
      const rect = railRef.current.getBoundingClientRect()
      setUndoOffset({ x: rect.left, y: rect.bottom + 12 })
    }
    updateUndoPosition()
    window.addEventListener('resize', updateUndoPosition)
    return () => window.removeEventListener('resize', updateUndoPosition)
  }, [])
  const handleToolClick = (mode: ToolMode) => {
    // Ignore clicks while editing
    if (isEditing) return

    // Toggle back to select if clicking the active tool
    if (mode === toolMode) {
      onToolModeChange('select')
      if (mode === 'rect') setShapeShelfOpen(false)
      if (mode === 'line') setLineShelfOpen(false)
    } else {
      onToolModeChange(mode)
      if (mode === 'rect') {
        setShapeShelfOpen(true)
      } else {
        setShapeShelfOpen(false)
      }
      if (mode === 'line') {
        setLineShelfOpen(true)
      } else {
        setLineShelfOpen(false)
      }
    }
  }

  return (
    <>
      <div ref={railRef} className="tool-rail" style={railStyle}>
      {TOOLS.map((tool) => {
        const isActive = toolMode === tool.mode
        const isLineTool = tool.mode === 'line'
        const isShapeTool = tool.mode === 'rect'
        return (
          <button
            key={tool.mode}
            type="button"
            title={tool.label}
            style={isActive ? activeButtonStyle : buttonBaseStyle}
            ref={isLineTool ? lineButtonRef : isShapeTool ? shapeButtonRef : undefined}
            onClick={() => handleToolClick(tool.mode)}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent'
              }
            }}
          >
            {tool.icon}
          </button>
        )
      })}
      {toolMode === 'rect' && shapeShelfOpen && (
        <div
          style={{
            ...lineShelfStyle,
            transform: `translate(${shapeShelfOffset.x}px, ${shapeShelfOffset.y}px)`,
          }}
        >
          <div style={lineShelfLabel}>Shapes</div>
          <div style={shapeShelfRow}>
            <button
              type="button"
              title="Rectangle"
              style={{
                ...lineOptionButton,
                background: shapeToolKind === 'rect' ? '#e0f2fe' : lineOptionButton.background,
                color: shapeToolKind === 'rect' ? '#0ea5e9' : '#374151',
              }}
              onClick={() => onShapeToolKindChange('rect')}
            >
              <Square size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              title="Ellipse"
              style={{
                ...lineOptionButton,
                background: shapeToolKind === 'ellipse' ? '#e0f2fe' : lineOptionButton.background,
                color: shapeToolKind === 'ellipse' ? '#0ea5e9' : '#374151',
              }}
              onClick={() => onShapeToolKindChange('ellipse')}
            >
              <Circle size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              title="Rounded Rectangle"
              style={{
                ...lineOptionButton,
                background: shapeToolKind === 'roundRect' ? '#e0f2fe' : lineOptionButton.background,
                color: shapeToolKind === 'roundRect' ? '#0ea5e9' : '#374151',
              }}
              onClick={() => onShapeToolKindChange('roundRect')}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="14" height="12" rx="4" />
              </svg>
            </button>
            <button
              type="button"
              title="Diamond"
              style={{
                ...lineOptionButton,
                background: shapeToolKind === 'diamond' ? '#e0f2fe' : lineOptionButton.background,
                color: shapeToolKind === 'diamond' ? '#0ea5e9' : '#374151',
              }}
              onClick={() => onShapeToolKindChange('diamond')}
            >
              <Diamond size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              title="Triangle"
              style={{
                ...lineOptionButton,
                background: shapeToolKind === 'triangle' ? '#e0f2fe' : lineOptionButton.background,
                color: shapeToolKind === 'triangle' ? '#0ea5e9' : '#374151',
              }}
              onClick={() => onShapeToolKindChange('triangle')}
            >
              <Triangle size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              title="Speech Bubble"
              style={{
                ...lineOptionButton,
                background: shapeToolKind === 'speechBubble' ? '#e0f2fe' : lineOptionButton.background,
                color: shapeToolKind === 'speechBubble' ? '#0ea5e9' : '#374151',
              }}
              onClick={() => onShapeToolKindChange('speechBubble')}
            >
              <MessageSquare size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
      {toolMode === 'line' && lineShelfOpen && (
        <div
          style={{
            ...lineShelfStyle,
            transform: `translate(${lineShelfOffset.x}px, ${lineShelfOffset.y}px)`,
          }}
        >
          <div style={lineShelfLabel}>Arrow type</div>
          <div style={lineShelfRow}>
            <button
              type="button"
              title="Straight"
              style={{
                ...lineOptionButton,
                background: lineToolKind === 'line' ? '#e0f2fe' : lineOptionButton.background,
                color: lineToolKind === 'line' ? '#0ea5e9' : '#374151',
              }}
              onClick={() => onLineToolKindChange('line')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 16L16 4" />
              </svg>
            </button>
            <button
              type="button"
              title="Curved"
              style={{
                ...lineOptionButton,
                background: lineToolKind === 'curve' ? '#e0f2fe' : lineOptionButton.background,
                color: lineToolKind === 'curve' ? '#0ea5e9' : '#374151',
              }}
              onClick={() => onLineToolKindChange('curve')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 6C8 16 12 4 17 14" />
              </svg>
            </button>
            <button
              type="button"
              title="Elbow"
              style={{
                ...lineOptionButton,
                background: lineToolKind === 'elbow' ? '#e0f2fe' : lineOptionButton.background,
                color: lineToolKind === 'elbow' ? '#0ea5e9' : '#374151',
              }}
              onClick={() => onLineToolKindChange('elbow')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 16V10h12V4" />
              </svg>
            </button>
          </div>
          <div style={lineShelfLabel}>Arrowheads</div>
          <div style={lineShelfRow}>
            <button
              type="button"
              title="No arrowhead"
              style={{
                ...lineOptionButton,
                background: lineArrowEnabled ? lineOptionButton.background : '#e0f2fe',
                color: lineArrowEnabled ? '#374151' : '#0ea5e9',
              }}
              onClick={() => onLineArrowEnabledChange(false)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 10H16" />
                <path d="M7 7L13 13" />
              </svg>
            </button>
            <button
              type="button"
              title="Arrowhead"
              style={{
                ...lineOptionButton,
                background: lineArrowEnabled ? '#e0f2fe' : lineOptionButton.background,
                color: lineArrowEnabled ? '#0ea5e9' : '#374151',
              }}
              onClick={() => onLineArrowEnabledChange(true)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 10H14" />
                <path d="M11 7L15 10L11 13" />
              </svg>
            </button>
          </div>
        </div>
      )}
      </div>
      <div
        style={{
          ...undoRailStyle,
          left: undoOffset.x,
          top: undoOffset.y,
        }}
      >
        <button
          type="button"
          title="Undo"
          style={{
            ...buttonBaseStyle,
            color: canUndo ? '#374151' : '#9ca3af',
            cursor: canUndo ? 'pointer' : 'not-allowed',
          }}
          onClick={() => {
            if (canUndo) onUndo()
          }}
        >
          <Undo2 size={18} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          title="Redo"
          style={{
            ...buttonBaseStyle,
            color: canRedo ? '#374151' : '#9ca3af',
            cursor: canRedo ? 'pointer' : 'not-allowed',
          }}
          onClick={() => {
            if (canRedo) onRedo()
          }}
        >
          <Redo2 size={18} strokeWidth={1.5} />
        </button>
      </div>
    </>
  )
}
