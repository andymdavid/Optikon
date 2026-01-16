import { Link2, X, ExternalLink } from 'lucide-react'
import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export type LinkInsertPopoverProps = {
  isOpen: boolean
  anchorPosition: { x: number; y: number } | null
  currentLink: string | null
  onApply: (url: string | null) => void
  onCancel: () => void
}

const popoverStyle: CSSProperties = {
  position: 'fixed',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  background: '#ffffff',
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)',
  zIndex: 30,
  minWidth: 320,
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const titleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
  color: '#111827',
  margin: 0,
}

const closeButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  border: 'none',
  background: 'transparent',
  borderRadius: 4,
  cursor: 'pointer',
  color: '#6B7280',
}

const inputContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: '#374151',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}

const buttonBaseStyle: CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
}

const cancelButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#F3F4F6',
  color: '#374151',
}

const applyButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#0EA5E9',
  color: '#ffffff',
}

const removeLinkButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#FEE2E2',
  color: '#DC2626',
  marginRight: 'auto',
}

export function LinkInsertPopover({
  isOpen,
  anchorPosition,
  currentLink,
  onApply,
  onCancel,
}: LinkInsertPopoverProps) {
  const [url, setUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Initialize URL from current link when opening
  useEffect(() => {
    if (isOpen) {
      setUrl(currentLink ?? '')
      // Focus input after a brief delay
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
  }, [isOpen, currentLink])

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onCancel])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen || !anchorPosition) {
    return null
  }

  if (typeof document === 'undefined') {
    return null
  }

  const handleApply = () => {
    const trimmedUrl = url.trim()
    if (trimmedUrl) {
      // Add https:// if no protocol specified
      const finalUrl = trimmedUrl.match(/^https?:\/\//) ? trimmedUrl : `https://${trimmedUrl}`
      onApply(finalUrl)
    } else {
      onApply(null)
    }
  }

  const handleRemoveLink = () => {
    onApply(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleApply()
    }
  }

  // Position the popover below the anchor point, centered horizontally
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
  const popoverWidth = 320
  let left = anchorPosition.x - popoverWidth / 2
  left = Math.max(12, Math.min(left, viewportWidth - popoverWidth - 12))

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        ...popoverStyle,
        left,
        top: anchorPosition.y + 8,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
    >
      <div style={headerStyle}>
        <h3 style={titleStyle}>
          <Link2 size={16} />
          {currentLink ? 'Edit Link' : 'Insert Link'}
        </h3>
        <button
          type="button"
          style={closeButtonStyle}
          onClick={onCancel}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={inputContainerStyle}>
        <label style={labelStyle}>URL</label>
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com"
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#0EA5E9'
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(14, 165, 233, 0.1)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#D1D5DB'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />
      </div>

      {url.trim() && (
        <a
          href={url.trim().match(/^https?:\/\//) ? url.trim() : `https://${url.trim()}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#0EA5E9',
            textDecoration: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
          Preview link
        </a>
      )}

      <div style={buttonRowStyle}>
        {currentLink && (
          <button
            type="button"
            style={removeLinkButtonStyle}
            onClick={handleRemoveLink}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#FECACA'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FEE2E2'
            }}
          >
            Remove Link
          </button>
        )}
        <button
          type="button"
          style={cancelButtonStyle}
          onClick={onCancel}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#E5E7EB'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#F3F4F6'
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          style={applyButtonStyle}
          onClick={handleApply}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#0284C7'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#0EA5E9'
          }}
        >
          {currentLink ? 'Update' : 'Apply'}
        </button>
      </div>
    </div>,
    document.body
  )
}
