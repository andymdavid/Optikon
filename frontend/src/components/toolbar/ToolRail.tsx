import { type CSSProperties } from 'react'
import {
  MousePointer2,
  StickyNote,
  Type,
  Square,
  Circle,
  Diamond,
  Triangle,
  MessageSquare,
  MoveUpRight,
  Frame,
  CircleAlert,
  Paperclip,
} from 'lucide-react'

export type ToolMode =
  | 'select'
  | 'sticky'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'roundRect'
  | 'diamond'
  | 'triangle'
  | 'speechBubble'
  | 'line'
  | 'arrow'
  | 'elbow'
  | 'frame'
  | 'attachment'
  | 'comment'

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
    label: 'Rectangle',
    icon: <Square size={20} strokeWidth={1.5} />,
  },
  {
    mode: 'ellipse',
    label: 'Ellipse',
    icon: <Circle size={20} strokeWidth={1.5} />,
  },
  {
    mode: 'roundRect',
    label: 'Rounded Rectangle',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="14" height="12" rx="4" />
      </svg>
    ),
  },
  {
    mode: 'diamond',
    label: 'Diamond',
    icon: <Diamond size={20} strokeWidth={1.5} />,
  },
  {
    mode: 'triangle',
    label: 'Triangle',
    icon: <Triangle size={20} strokeWidth={1.5} />,
  },
  {
    mode: 'speechBubble',
    label: 'Speech Bubble',
    icon: <MessageSquare size={20} strokeWidth={1.5} />,
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
    mode: 'arrow',
    label: 'Arrow',
    icon: <MoveUpRight size={20} strokeWidth={1.5} />,
  },
  {
    mode: 'elbow',
    label: 'Elbow Connector',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 16V10h12V4" />
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

export function ToolRail({ toolMode, onToolModeChange, isEditing }: ToolRailProps) {
  const handleToolClick = (mode: ToolMode) => {
    // Ignore clicks while editing
    if (isEditing) return

    // Toggle back to select if clicking the active tool
    if (mode === toolMode) {
      onToolModeChange('select')
    } else {
      onToolModeChange(mode)
    }
  }

  return (
    <div className="tool-rail" style={railStyle}>
      {TOOLS.map((tool) => {
        const isActive = toolMode === tool.mode
        return (
          <button
            key={tool.mode}
            type="button"
            title={tool.label}
            style={isActive ? activeButtonStyle : buttonBaseStyle}
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
    </div>
  )
}
