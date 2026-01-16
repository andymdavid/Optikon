import { Maximize2, Focus } from 'lucide-react'
import { type CSSProperties } from 'react'

export type ZoomPanelProps = {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onFit: () => void
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '4px 6px',
  background: '#ffffff',
  borderRadius: 8,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)',
  zIndex: 20,
}

const buttonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#374151',
  background: 'transparent',
  fontSize: 18,
  fontWeight: 400,
  transition: 'background 0.1s',
}

const zoomDisplayStyle: CSSProperties = {
  minWidth: 48,
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 500,
  color: '#374151',
  userSelect: 'none',
}

const separatorStyle: CSSProperties = {
  width: 1,
  height: 20,
  background: 'rgba(0, 0, 0, 0.1)',
  margin: '0 4px',
}

export function ZoomPanel({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
}: ZoomPanelProps) {
  const zoomPercent = Math.round(zoom * 100)

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)'
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent'
  }

  return (
    <div
      className="zoom-panel"
      style={panelStyle}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title="Fit to content"
        style={buttonStyle}
        onClick={onFit}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Maximize2 size={18} strokeWidth={1.5} />
      </button>
      <div style={separatorStyle} />
      <button
        type="button"
        title="Zoom out"
        style={buttonStyle}
        onClick={onZoomOut}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        −
      </button>
      <div style={zoomDisplayStyle}>{zoomPercent}%</div>
      <button
        type="button"
        title="Zoom in"
        style={buttonStyle}
        onClick={onZoomIn}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        +
      </button>
      <div style={separatorStyle} />
      <button
        type="button"
        title="Reset view"
        style={buttonStyle}
        onClick={onReset}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Focus size={18} strokeWidth={1.5} />
      </button>
    </div>
  )
}
