import { useMemo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export type SelectionBoundsScreen = {
  left: number
  top: number
  right: number
  bottom: number
} | null

export type FloatingSelectionToolbarProps = {
  selectionBoundsScreen: SelectionBoundsScreen
  isVisible: boolean
}

const TOOLBAR_HEIGHT = 44
const TOOLBAR_GAP = 28 // Clear the selection frame padding (18px) + resize handles (6px) + buffer
const VIEWPORT_MARGIN = 12

// Placeholder button styling
const buttonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  border: 'none',
  background: 'transparent',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#374151',
  fontSize: 14,
  fontWeight: 500,
}

const separatorStyle: CSSProperties = {
  width: 1,
  height: 20,
  background: 'rgba(0, 0, 0, 0.1)',
  margin: '0 4px',
}

export function FloatingSelectionToolbar({
  selectionBoundsScreen,
  isVisible,
}: FloatingSelectionToolbarProps) {
  const position = useMemo(() => {
    if (!selectionBoundsScreen) return null

    const bounds = selectionBoundsScreen
    const toolbarWidth = 200 // Approximate width for placeholder buttons

    // Calculate horizontal center of selection
    const selectionCenterX = (bounds.left + bounds.right) / 2
    let x = selectionCenterX - toolbarWidth / 2

    // Prefer above selection, fall back to below if not enough room
    let y = bounds.top - TOOLBAR_HEIGHT - TOOLBAR_GAP
    const preferBelow = y < VIEWPORT_MARGIN

    if (preferBelow) {
      y = bounds.bottom + TOOLBAR_GAP
    }

    // Clamp horizontal position to viewport
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080

    x = Math.max(VIEWPORT_MARGIN, Math.min(x, viewportWidth - toolbarWidth - VIEWPORT_MARGIN))

    // Clamp vertical position to viewport
    y = Math.max(VIEWPORT_MARGIN, Math.min(y, viewportHeight - TOOLBAR_HEIGHT - VIEWPORT_MARGIN))

    return { x, y }
  }, [selectionBoundsScreen])

  if (!isVisible || !selectionBoundsScreen || !position) {
    return null
  }

  if (typeof document === 'undefined') {
    return null
  }

  const containerStyle: CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    height: TOOLBAR_HEIGHT,
    padding: '0 8px',
    background: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)',
    zIndex: 25,
    pointerEvents: 'auto',
  }

  return createPortal(
    <div
      className="floating-selection-toolbar"
      style={containerStyle}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Placeholder buttons - these will be replaced with real actions later */}
      <button
        type="button"
        style={buttonStyle}
        title="Bold"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        style={buttonStyle}
        title="Italic"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <em>I</em>
      </button>
      <div style={separatorStyle} />
      <button
        type="button"
        style={buttonStyle}
        title="Align"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="3" width="12" height="2" rx="0.5" />
          <rect x="4" y="7" width="8" height="2" rx="0.5" />
          <rect x="2" y="11" width="12" height="2" rx="0.5" />
        </svg>
      </button>
      <div style={separatorStyle} />
      <button
        type="button"
        style={{ ...buttonStyle, position: 'relative' }}
        title="Color"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <button
        type="button"
        style={buttonStyle}
        title="More"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
    </div>,
    document.body
  )
}
