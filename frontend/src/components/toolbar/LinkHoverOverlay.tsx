import { ExternalLink } from 'lucide-react'
import { type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export type LinkHoverOverlayProps = {
  link: string
  position: { x: number; y: number }
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  background: '#ffffff',
  borderRadius: 6,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)',
  zIndex: 35,
  maxWidth: 300,
  cursor: 'pointer',
  textDecoration: 'none',
  color: '#0EA5E9',
  fontSize: 13,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  transition: 'background 0.1s',
}

export function LinkHoverOverlay({
  link,
  position,
  onMouseEnter,
  onMouseLeave,
}: LinkHoverOverlayProps) {
  if (typeof document === 'undefined') {
    return null
  }

  // Truncate long URLs for display
  const displayUrl = link.length > 40 ? link.slice(0, 37) + '...' : link

  return createPortal(
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        ...overlayStyle,
        left: position.x,
        top: position.y,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#F0F9FF'
        onMouseEnter()
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#ffffff'
        onMouseLeave()
      }}
      onClick={(e) => {
        e.stopPropagation()
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
    >
      <ExternalLink size={14} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {displayUrl}
      </span>
    </a>,
    document.body
  )
}
