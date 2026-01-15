import { useState, useMemo, useRef, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export type SelectionBoundsScreen = {
  left: number
  top: number
  right: number
  bottom: number
} | null

export type TextAlign = 'left' | 'center' | 'right'

export type SelectionFormatState = {
  bold: boolean | 'mixed'
  italic: boolean | 'mixed'
  align: TextAlign | 'mixed'
  hasTextElements: boolean
}

export type FloatingSelectionToolbarProps = {
  selectionBoundsScreen: SelectionBoundsScreen
  isVisible: boolean
  formatState: SelectionFormatState
  onToggleBold: () => void
  onToggleItalic: () => void
  onCycleAlign: () => void
  onAddComment?: () => void
}

const FONTS = ['Noto Sans', 'Inter', 'Roboto', 'Serif', 'Mono'] as const
const FONT_COLORS = ['#111827', '#374151', '#6B7280', '#DC2626', '#EA580C', '#CA8A04', '#16A34A', '#0EA5E9', '#8B5CF6']
const HIGHLIGHT_COLORS = ['transparent', '#FEF08A', '#BBF7D0', '#BAE6FD', '#E9D5FF', '#FECACA', '#FED7AA']
const BG_COLORS = ['transparent', '#FFFFFF', '#F3F4F6', '#FEF3C7', '#DCFCE7', '#DBEAFE', '#F3E8FF', '#FCE7F3']

const TOOLBAR_HEIGHT = 44
const TOOLBAR_GAP = 28
const VIEWPORT_MARGIN = 12

const buttonBaseStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 32,
  height: 32,
  border: 'none',
  background: 'transparent',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#374151',
  fontSize: 13,
  fontWeight: 500,
  transition: 'background 0.1s',
  padding: '0 6px',
  gap: 4,
}

const activeButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: '#e0f2fe',
  color: '#0ea5e9',
}

const separatorStyle: CSSProperties = {
  width: 1,
  height: 20,
  background: 'rgba(0, 0, 0, 0.1)',
  margin: '0 4px',
  flexShrink: 0,
}

const dropdownStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 4,
  background: '#ffffff',
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)',
  padding: 4,
  zIndex: 30,
  minWidth: 120,
}

const dropdownItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '8px 12px',
  border: 'none',
  background: 'transparent',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  color: '#374151',
  textAlign: 'left',
}

const colorSwatchStyle: CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 4,
  border: '1px solid rgba(0,0,0,0.1)',
  cursor: 'pointer',
}

const colorGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: 4,
  padding: 8,
}

function AlignIcon({ align }: { align: TextAlign | 'mixed' }) {
  if (align === 'left' || align === 'mixed') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="2" y="3" width="12" height="2" rx="0.5" />
        <rect x="2" y="7" width="8" height="2" rx="0.5" />
        <rect x="2" y="11" width="10" height="2" rx="0.5" />
      </svg>
    )
  }
  if (align === 'center') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="2" y="3" width="12" height="2" rx="0.5" />
        <rect x="4" y="7" width="8" height="2" rx="0.5" />
        <rect x="3" y="11" width="10" height="2" rx="0.5" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="3" width="12" height="2" rx="0.5" />
      <rect x="6" y="7" width="8" height="2" rx="0.5" />
      <rect x="4" y="11" width="10" height="2" rx="0.5" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4.5L6 7.5L9 4.5" />
    </svg>
  )
}

type DropdownType = 'font' | 'textStyle' | 'fontColor' | 'highlightColor' | 'bgColor' | null

export function FloatingSelectionToolbar({
  selectionBoundsScreen,
  isVisible,
  formatState,
  onToggleBold,
  onToggleItalic,
  onCycleAlign,
  onAddComment,
}: FloatingSelectionToolbarProps) {
  const [openDropdown, setOpenDropdown] = useState<DropdownType>(null)
  const [selectedFont, setSelectedFont] = useState<typeof FONTS[number]>('Noto Sans')
  const [fontSize, setFontSize] = useState(16)
  const [underline, setUnderline] = useState(false)
  const [strikethrough, setStrikethrough] = useState(false)
  const [bulletPoints, setBulletPoints] = useState(false)
  const [fontColor, setFontColor] = useState('#111827')
  const [highlightColor, setHighlightColor] = useState('transparent')
  const [bgColor, setBgColor] = useState('transparent')
  const [bgOpacity, setBgOpacity] = useState(100)
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openDropdown])

  const position = useMemo(() => {
    if (!selectionBoundsScreen) return null
    const bounds = selectionBoundsScreen
    const toolbarWidth = 680

    const selectionCenterX = (bounds.left + bounds.right) / 2
    let x = selectionCenterX - toolbarWidth / 2

    let y = bounds.top - TOOLBAR_HEIGHT - TOOLBAR_GAP
    const preferBelow = y < VIEWPORT_MARGIN

    if (preferBelow) {
      y = bounds.bottom + TOOLBAR_GAP
    }

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080

    x = Math.max(VIEWPORT_MARGIN, Math.min(x, viewportWidth - toolbarWidth - VIEWPORT_MARGIN))
    y = Math.max(VIEWPORT_MARGIN, Math.min(y, viewportHeight - TOOLBAR_HEIGHT - VIEWPORT_MARGIN))

    return { x, y }
  }, [selectionBoundsScreen])

  if (!isVisible || !selectionBoundsScreen || !position) {
    return null
  }

  if (typeof document === 'undefined') {
    return null
  }

  if (!formatState.hasTextElements) {
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

  const isBoldActive = formatState.bold === true
  const isItalicActive = formatState.italic === true

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>, isActive: boolean) => {
    if (!isActive) {
      e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)'
    }
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>, isActive: boolean) => {
    if (!isActive) {
      e.currentTarget.style.background = 'transparent'
    }
  }

  const toggleDropdown = (dropdown: DropdownType) => {
    setOpenDropdown((prev) => (prev === dropdown ? null : dropdown))
  }

  const handleFontSizeChange = (delta: number) => {
    setFontSize((prev) => Math.max(6, Math.min(240, prev + delta)))
  }

  const handleFontSizeInput = (value: string) => {
    const num = parseInt(value, 10)
    if (!isNaN(num)) {
      setFontSize(Math.max(6, Math.min(240, num)))
    }
  }

  return createPortal(
    <div
      ref={toolbarRef}
      className="floating-selection-toolbar"
      style={containerStyle}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Font Selector */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          style={{ ...buttonBaseStyle, minWidth: 90 }}
          title="Font family"
          onClick={() => toggleDropdown('font')}
          onMouseEnter={(e) => handleMouseEnter(e, false)}
          onMouseLeave={(e) => handleMouseLeave(e, false)}
        >
          <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedFont}
          </span>
          <ChevronDown />
        </button>
        {openDropdown === 'font' && (
          <div style={dropdownStyle}>
            {FONTS.map((font) => (
              <button
                key={font}
                type="button"
                style={{
                  ...dropdownItemStyle,
                  fontFamily: font === 'Mono' ? 'monospace' : font === 'Serif' ? 'serif' : font,
                  background: selectedFont === font ? '#e0f2fe' : 'transparent',
                }}
                onClick={() => {
                  setSelectedFont(font)
                  setOpenDropdown(null)
                }}
                onMouseEnter={(e) => {
                  if (selectedFont !== font) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'
                }}
                onMouseLeave={(e) => {
                  if (selectedFont !== font) e.currentTarget.style.background = 'transparent'
                }}
              >
                {font}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Font Size Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          type="button"
          style={{ ...buttonBaseStyle, width: 24, minWidth: 24, padding: 0 }}
          title="Decrease font size"
          onClick={() => handleFontSizeChange(-1)}
          onMouseEnter={(e) => handleMouseEnter(e, false)}
          onMouseLeave={(e) => handleMouseLeave(e, false)}
        >
          −
        </button>
        <input
          type="text"
          value={fontSize}
          onChange={(e) => handleFontSizeInput(e.target.value)}
          style={{
            width: 36,
            height: 28,
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: 4,
            textAlign: 'center',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          type="button"
          style={{ ...buttonBaseStyle, width: 24, minWidth: 24, padding: 0 }}
          title="Increase font size"
          onClick={() => handleFontSizeChange(1)}
          onMouseEnter={(e) => handleMouseEnter(e, false)}
          onMouseLeave={(e) => handleMouseLeave(e, false)}
        >
          +
        </button>
      </div>

      <div style={separatorStyle} />

      {/* Text Style Dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          style={buttonBaseStyle}
          title="Text styles"
          onClick={() => toggleDropdown('textStyle')}
          onMouseEnter={(e) => handleMouseEnter(e, false)}
          onMouseLeave={(e) => handleMouseLeave(e, false)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <text x="3" y="12" fontFamily="serif" fontSize="13" fontStyle="italic" fontWeight="bold">B</text>
            <rect x="3" y="13.5" width="10" height="1.5" rx="0.5" />
          </svg>
          <ChevronDown />
        </button>
        {openDropdown === 'textStyle' && (
          <div style={{ ...dropdownStyle, minWidth: 140 }}>
            <button
              type="button"
              style={{ ...dropdownItemStyle, background: isBoldActive ? '#e0f2fe' : 'transparent' }}
              onClick={() => {
                onToggleBold()
              }}
            >
              <strong>B</strong>
              <span>Bold</span>
              {isBoldActive && <span style={{ marginLeft: 'auto', color: '#0ea5e9' }}>✓</span>}
            </button>
            <button
              type="button"
              style={{ ...dropdownItemStyle, background: isItalicActive ? '#e0f2fe' : 'transparent' }}
              onClick={() => {
                onToggleItalic()
              }}
            >
              <em>I</em>
              <span>Italic</span>
              {isItalicActive && <span style={{ marginLeft: 'auto', color: '#0ea5e9' }}>✓</span>}
            </button>
            <button
              type="button"
              style={{ ...dropdownItemStyle, background: underline ? '#e0f2fe' : 'transparent' }}
              onClick={() => setUnderline(!underline)}
            >
              <span style={{ textDecoration: 'underline' }}>U</span>
              <span>Underline</span>
              {underline && <span style={{ marginLeft: 'auto', color: '#0ea5e9' }}>✓</span>}
            </button>
            <button
              type="button"
              style={{ ...dropdownItemStyle, background: strikethrough ? '#e0f2fe' : 'transparent' }}
              onClick={() => setStrikethrough(!strikethrough)}
            >
              <span style={{ textDecoration: 'line-through' }}>S</span>
              <span>Strikethrough</span>
              {strikethrough && <span style={{ marginLeft: 'auto', color: '#0ea5e9' }}>✓</span>}
            </button>
          </div>
        )}
      </div>

      <div style={separatorStyle} />

      {/* Alignment (left/center/right buttons) */}
      <div style={{ display: 'flex', gap: 2 }}>
        <button
          type="button"
          style={formatState.align === 'left' ? activeButtonStyle : buttonBaseStyle}
          title="Align left"
          onClick={() => {
            if (formatState.align !== 'left') onCycleAlign()
          }}
          onMouseEnter={(e) => handleMouseEnter(e, formatState.align === 'left')}
          onMouseLeave={(e) => handleMouseLeave(e, formatState.align === 'left')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="3" width="12" height="2" rx="0.5" />
            <rect x="2" y="7" width="8" height="2" rx="0.5" />
            <rect x="2" y="11" width="10" height="2" rx="0.5" />
          </svg>
        </button>
        <button
          type="button"
          style={formatState.align === 'center' ? activeButtonStyle : buttonBaseStyle}
          title="Align center"
          onClick={() => {
            if (formatState.align !== 'center') onCycleAlign()
            if (formatState.align === 'left') onCycleAlign()
          }}
          onMouseEnter={(e) => handleMouseEnter(e, formatState.align === 'center')}
          onMouseLeave={(e) => handleMouseLeave(e, formatState.align === 'center')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="3" width="12" height="2" rx="0.5" />
            <rect x="4" y="7" width="8" height="2" rx="0.5" />
            <rect x="3" y="11" width="10" height="2" rx="0.5" />
          </svg>
        </button>
        <button
          type="button"
          style={formatState.align === 'right' ? activeButtonStyle : buttonBaseStyle}
          title="Align right"
          onClick={() => {
            if (formatState.align !== 'right') onCycleAlign()
            if (formatState.align === 'left') {
              onCycleAlign()
              onCycleAlign()
            }
            if (formatState.align === 'center') onCycleAlign()
          }}
          onMouseEnter={(e) => handleMouseEnter(e, formatState.align === 'right')}
          onMouseLeave={(e) => handleMouseLeave(e, formatState.align === 'right')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="3" width="12" height="2" rx="0.5" />
            <rect x="6" y="7" width="8" height="2" rx="0.5" />
            <rect x="4" y="11" width="10" height="2" rx="0.5" />
          </svg>
        </button>
      </div>

      <div style={separatorStyle} />

      {/* Bullet Points Toggle */}
      <button
        type="button"
        style={bulletPoints ? activeButtonStyle : buttonBaseStyle}
        title="Bullet points"
        onClick={() => setBulletPoints(!bulletPoints)}
        onMouseEnter={(e) => handleMouseEnter(e, bulletPoints)}
        onMouseLeave={(e) => handleMouseLeave(e, bulletPoints)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="4" r="1.5" />
          <rect x="6" y="3" width="8" height="2" rx="0.5" />
          <circle cx="3" cy="8" r="1.5" />
          <rect x="6" y="7" width="8" height="2" rx="0.5" />
          <circle cx="3" cy="12" r="1.5" />
          <rect x="6" y="11" width="8" height="2" rx="0.5" />
        </svg>
      </button>

      <div style={separatorStyle} />

      {/* Attachment Button (placeholder) */}
      <button
        type="button"
        style={buttonBaseStyle}
        title="Attachment"
        onClick={() => console.log('attachment')}
        onMouseEnter={(e) => handleMouseEnter(e, false)}
        onMouseLeave={(e) => handleMouseLeave(e, false)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 8.5l-5.5 5.5a3.5 3.5 0 01-5-5l6-6a2 2 0 013 3l-5.5 5.5a.5.5 0 01-1-1L11.5 5" />
        </svg>
      </button>

      <div style={separatorStyle} />

      {/* Font Color Picker */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          style={buttonBaseStyle}
          title="Font color"
          onClick={() => toggleDropdown('fontColor')}
          onMouseEnter={(e) => handleMouseEnter(e, false)}
          onMouseLeave={(e) => handleMouseLeave(e, false)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.5 2L3 12h2l.75-2.5h4.5L11 12h2L9.5 2h-3zm.75 6L8 5.5 8.75 8h-1.5z" />
          </svg>
          <div style={{ width: 14, height: 3, background: fontColor, borderRadius: 1, marginTop: -2 }} />
        </button>
        {openDropdown === 'fontColor' && (
          <div style={{ ...dropdownStyle, minWidth: 'auto' }}>
            <div style={colorGridStyle}>
              {FONT_COLORS.map((color) => (
                <div
                  key={color}
                  style={{
                    ...colorSwatchStyle,
                    background: color,
                    outline: fontColor === color ? '2px solid #0ea5e9' : 'none',
                    outlineOffset: 1,
                  }}
                  onClick={() => {
                    setFontColor(color)
                    setOpenDropdown(null)
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Highlight Color Picker */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          style={buttonBaseStyle}
          title="Highlight color"
          onClick={() => toggleDropdown('highlightColor')}
          onMouseEnter={(e) => handleMouseEnter(e, false)}
          onMouseLeave={(e) => handleMouseLeave(e, false)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.5 1L4 8.5V12h3.5L15 4.5 11.5 1zM2 14h12v1H2v-1z" />
          </svg>
          <div
            style={{
              width: 14,
              height: 3,
              background: highlightColor === 'transparent' ? 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)' : highlightColor,
              borderRadius: 1,
              marginTop: -2,
            }}
          />
        </button>
        {openDropdown === 'highlightColor' && (
          <div style={{ ...dropdownStyle, minWidth: 'auto' }}>
            <div style={colorGridStyle}>
              {HIGHLIGHT_COLORS.map((color) => (
                <div
                  key={color}
                  style={{
                    ...colorSwatchStyle,
                    background: color === 'transparent' ? 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)' : color,
                    outline: highlightColor === color ? '2px solid #0ea5e9' : 'none',
                    outlineOffset: 1,
                  }}
                  onClick={() => {
                    setHighlightColor(color)
                    setOpenDropdown(null)
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Background Color + Opacity */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          style={buttonBaseStyle}
          title="Background color"
          onClick={() => toggleDropdown('bgColor')}
          onMouseEnter={(e) => handleMouseEnter(e, false)}
          onMouseLeave={(e) => handleMouseLeave(e, false)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="12" height="12" rx="2" fill={bgColor === 'transparent' ? 'none' : bgColor} fillOpacity={bgOpacity / 100} />
          </svg>
        </button>
        {openDropdown === 'bgColor' && (
          <div style={{ ...dropdownStyle, minWidth: 160 }}>
            <div style={colorGridStyle}>
              {BG_COLORS.map((color) => (
                <div
                  key={color}
                  style={{
                    ...colorSwatchStyle,
                    background: color === 'transparent' ? 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)' : color,
                    outline: bgColor === color ? '2px solid #0ea5e9' : 'none',
                    outlineOffset: 1,
                  }}
                  onClick={() => setBgColor(color)}
                />
              ))}
            </div>
            <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Opacity: {bgOpacity}%</div>
              <input
                type="range"
                min="0"
                max="100"
                value={bgOpacity}
                onChange={(e) => setBgOpacity(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={separatorStyle} />

      {/* Add Comment Button */}
      <button
        type="button"
        style={buttonBaseStyle}
        title="Add comment"
        onClick={() => {
          if (onAddComment) onAddComment()
        }}
        onMouseEnter={(e) => handleMouseEnter(e, false)}
        onMouseLeave={(e) => handleMouseLeave(e, false)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3h12a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 3V4a1 1 0 011-1z" />
          <path d="M5 7h6M5 9h3" strokeLinecap="round" />
        </svg>
      </button>
    </div>,
    document.body
  )
}
