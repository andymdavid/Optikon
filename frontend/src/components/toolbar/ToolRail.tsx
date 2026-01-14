import { type CSSProperties } from 'react'

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
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        <path d="M4 2l12 9-5 1.5L9 18l-1.5-5L4 2z" />
      </svg>
    ),
  },
  {
    mode: 'sticky',
    label: 'Sticky Note',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="14" height="14" rx="1" />
        <path d="M6 7h8M6 10h8M6 13h4" />
      </svg>
    ),
  },
  {
    mode: 'text',
    label: 'Text',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        <path d="M4 4v3h1V5h4v10H7v1h6v-1h-2V5h4v2h1V4H4z" />
      </svg>
    ),
  },
  {
    mode: 'rect',
    label: 'Rectangle',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="14" height="12" rx="1" />
      </svg>
    ),
  },
  {
    mode: 'ellipse',
    label: 'Ellipse',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="10" cy="10" rx="7" ry="5" />
      </svg>
    ),
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
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 2L18 10L10 18L2 10Z" />
      </svg>
    ),
  },
  {
    mode: 'triangle',
    label: 'Triangle',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 3L18 17H2Z" />
      </svg>
    ),
  },
  {
    mode: 'speechBubble',
    label: 'Speech Bubble',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 4h14a1 1 0 011 1v8a1 1 0 01-1 1H8l-3 3v-3H3a1 1 0 01-1-1V5a1 1 0 011-1z" />
      </svg>
    ),
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
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 16L16 4M16 4v6M16 4h-6" />
      </svg>
    ),
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
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="5" width="14" height="12" rx="1" />
        <path d="M3 3h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    mode: 'comment',
    label: 'Comment',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4M10 13v1" strokeLinecap="round" />
      </svg>
    ),
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
