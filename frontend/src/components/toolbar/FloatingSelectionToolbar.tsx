import {
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  Link2,
  Highlighter,
  MessageSquare,
  ALargeSmall,
  Baseline,
} from 'lucide-react'
import { useState, useMemo, useRef, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export type SelectionBoundsScreen = {
  left: number
  top: number
  right: number
  bottom: number
} | null

export type TextAlign = 'left' | 'center' | 'right'

export type TextBackground = {
  color: string
  opacity: number
}

export type SelectionFormatState = {
  bold: boolean | 'mixed'
  italic: boolean | 'mixed'
  underline: boolean | 'mixed'
  strikethrough: boolean | 'mixed'
  align: TextAlign | 'mixed'
  bullets: boolean | 'mixed'
  fontFamily: string | 'mixed'
  fontSize: number | 'mixed'
  color: string | 'mixed'
  highlight: string | null | 'mixed'
  background: TextBackground | null | 'mixed'
  stickyFill: string | null | 'mixed'
  shapeFill: string | null | 'mixed'
  frameFill: string | null | 'mixed'
  link: string | null | 'mixed'
  hasTextElements: boolean
  hasStickyElements: boolean
  hasShapeElements: boolean
  hasFrameElements: boolean
}

export type FloatingSelectionToolbarProps = {
  selectionBoundsScreen: SelectionBoundsScreen
  isVisible: boolean
  formatState: SelectionFormatState
  onToggleBold: () => void
  onToggleItalic: () => void
  onToggleUnderline: () => void
  onToggleStrikethrough: () => void
  onSetAlign: (align: TextAlign) => void
  onToggleBullets: () => void
  onSetFontFamily: (family: string) => void
  onSetFontSize: (size: number) => void
  onSetColor: (color: string) => void
  onSetHighlight: (color: string | null) => void
  onSetBackground: (bg: TextBackground | null) => void
  onSetStickyFill: (color: string | null) => void
  onSetShapeFill: (color: string | null) => void
  onSetFrameFill: (color: string | null) => void
  onInsertLink?: () => void
  onAddComment?: () => void
}

export const FONT_FAMILIES = ['Inter', 'Noto Sans', 'Roboto', 'Georgia', 'Courier New'] as const
export const FONT_COLORS = ['#111827', '#374151', '#6B7280', '#DC2626', '#EA580C', '#CA8A04', '#16A34A', '#0EA5E9', '#8B5CF6']
export const HIGHLIGHT_COLORS = ['transparent', '#FEF08A', '#BBF7D0', '#BAE6FD', '#E9D5FF', '#FECACA', '#FED7AA']
export const BG_COLORS = ['transparent', '#FFFFFF', '#F3F4F6', '#FEF3C7', '#DCFCE7', '#DBEAFE', '#F3E8FF', '#FCE7F3']
export const STICKY_COLORS = ['default', '#F9FF4A', '#FF7AF1', '#6BFFB0', '#63F3FF', '#FFA94D', '#FFD166']

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

function ChevronDownIcon() {
  return <ChevronDown size={12} strokeWidth={1.5} />
}

type DropdownType = 'font' | 'textStyle' | 'fontColor' | 'highlightColor' | 'bgColor' | 'stickyFill' | 'shapeFill' | 'frameFill' | null

export function FloatingSelectionToolbar({
  selectionBoundsScreen,
  isVisible,
  formatState,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onToggleStrikethrough,
  onSetAlign,
  onToggleBullets,
  onSetFontFamily,
  onSetFontSize,
  onSetColor,
  onSetHighlight,
  onSetBackground,
  onSetStickyFill,
  onSetShapeFill,
  onSetFrameFill,
  onInsertLink,
  onAddComment,
}: FloatingSelectionToolbarProps) {
  const [openDropdown, setOpenDropdown] = useState<DropdownType>(null)
  const [fontSizeInput, setFontSizeInput] = useState('')
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Sync font size input with formatState
  useEffect(() => {
    if (typeof formatState.fontSize === 'number') {
      setFontSizeInput(String(formatState.fontSize))
    } else {
      setFontSizeInput('')
    }
  }, [formatState.fontSize])

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
  const isUnderlineActive = formatState.underline === true
  const isStrikethroughActive = formatState.strikethrough === true
  const isBulletsActive = formatState.bullets === true

  const currentFontFamily = typeof formatState.fontFamily === 'string' ? formatState.fontFamily : 'Inter'
  const currentFontSize = typeof formatState.fontSize === 'number' ? formatState.fontSize : 48
  const currentColor = typeof formatState.color === 'string' ? formatState.color : '#111827'
  const currentHighlight = formatState.highlight !== 'mixed' ? formatState.highlight : null
  const currentBackground = formatState.background !== 'mixed' ? formatState.background : null
  const currentStickyFill = formatState.stickyFill !== 'mixed' ? formatState.stickyFill : null
  const currentShapeFill = formatState.shapeFill !== 'mixed' ? formatState.shapeFill : null
  const currentFrameFill = formatState.frameFill !== 'mixed' ? formatState.frameFill : null

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
    const newSize = Math.max(6, Math.min(240, currentFontSize + delta))
    onSetFontSize(newSize)
  }

  const handleFontSizeInputChange = (value: string) => {
    setFontSizeInput(value)
  }

  const handleFontSizeInputBlur = () => {
    const num = parseInt(fontSizeInput, 10)
    if (!isNaN(num)) {
      const clampedSize = Math.max(6, Math.min(240, num))
      onSetFontSize(clampedSize)
    } else {
      // Reset to current value
      setFontSizeInput(String(currentFontSize))
    }
  }

  const handleFontSizeInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFontSizeInputBlur()
    }
  }

  // Get display name for font family in dropdown button
  const getFontDisplayName = (family: string): string => {
    if (family === 'Courier New') return 'Mono'
    if (family === 'Georgia') return 'Serif'
    return family
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
            {formatState.fontFamily === 'mixed' ? 'Mixed' : getFontDisplayName(currentFontFamily)}
          </span>
          <ChevronDownIcon />
        </button>
        {openDropdown === 'font' && (
          <div style={dropdownStyle}>
            {FONT_FAMILIES.map((font) => (
              <button
                key={font}
                type="button"
                style={{
                  ...dropdownItemStyle,
                  fontFamily: font,
                  background: currentFontFamily === font ? '#e0f2fe' : 'transparent',
                }}
                onClick={() => {
                  onSetFontFamily(font)
                  setOpenDropdown(null)
                }}
                onMouseEnter={(e) => {
                  if (currentFontFamily !== font) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'
                }}
                onMouseLeave={(e) => {
                  if (currentFontFamily !== font) e.currentTarget.style.background = 'transparent'
                }}
              >
                {getFontDisplayName(font)}
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
          value={fontSizeInput}
          onChange={(e) => handleFontSizeInputChange(e.target.value)}
          onBlur={handleFontSizeInputBlur}
          onKeyDown={handleFontSizeInputKeyDown}
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
          <ALargeSmall size={16} strokeWidth={1.5} />
          <ChevronDownIcon />
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
              style={{ ...dropdownItemStyle, background: isUnderlineActive ? '#e0f2fe' : 'transparent' }}
              onClick={() => onToggleUnderline()}
            >
              <span style={{ textDecoration: 'underline' }}>U</span>
              <span>Underline</span>
              {isUnderlineActive && <span style={{ marginLeft: 'auto', color: '#0ea5e9' }}>✓</span>}
            </button>
            <button
              type="button"
              style={{ ...dropdownItemStyle, background: isStrikethroughActive ? '#e0f2fe' : 'transparent' }}
              onClick={() => onToggleStrikethrough()}
            >
              <span style={{ textDecoration: 'line-through' }}>S</span>
              <span>Strikethrough</span>
              {isStrikethroughActive && <span style={{ marginLeft: 'auto', color: '#0ea5e9' }}>✓</span>}
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
          onClick={() => onSetAlign('left')}
          onMouseEnter={(e) => handleMouseEnter(e, formatState.align === 'left')}
          onMouseLeave={(e) => handleMouseLeave(e, formatState.align === 'left')}
        >
          <AlignLeft size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          style={formatState.align === 'center' ? activeButtonStyle : buttonBaseStyle}
          title="Align center"
          onClick={() => onSetAlign('center')}
          onMouseEnter={(e) => handleMouseEnter(e, formatState.align === 'center')}
          onMouseLeave={(e) => handleMouseLeave(e, formatState.align === 'center')}
        >
          <AlignCenter size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          style={formatState.align === 'right' ? activeButtonStyle : buttonBaseStyle}
          title="Align right"
          onClick={() => onSetAlign('right')}
          onMouseEnter={(e) => handleMouseEnter(e, formatState.align === 'right')}
          onMouseLeave={(e) => handleMouseLeave(e, formatState.align === 'right')}
        >
          <AlignRight size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div style={separatorStyle} />

      {/* Bullet Points Toggle */}
      <button
        type="button"
        style={isBulletsActive ? activeButtonStyle : buttonBaseStyle}
        title="Bullet points"
        onClick={() => onToggleBullets()}
        onMouseEnter={(e) => handleMouseEnter(e, isBulletsActive)}
        onMouseLeave={(e) => handleMouseLeave(e, isBulletsActive)}
      >
        <List size={16} strokeWidth={1.5} />
      </button>

      <div style={separatorStyle} />

      {/* Insert Link Button */}
      <button
        type="button"
        style={buttonBaseStyle}
        title="Insert link"
        onClick={() => {
          if (onInsertLink) onInsertLink()
        }}
        onMouseEnter={(e) => handleMouseEnter(e, false)}
        onMouseLeave={(e) => handleMouseLeave(e, false)}
      >
        <Link2 size={16} strokeWidth={1.5} />
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
          <Baseline size={16} strokeWidth={1.5} />
          <div style={{ width: 14, height: 3, background: currentColor, borderRadius: 1, marginTop: -2 }} />
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
                    outline: currentColor === color ? '2px solid #0ea5e9' : 'none',
                    outlineOffset: 1,
                  }}
                  onClick={() => {
                    onSetColor(color)
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
          <Highlighter size={16} strokeWidth={1.5} />
          <div
            style={{
              width: 14,
              height: 3,
              background: !currentHighlight || currentHighlight === 'transparent' ? 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)' : currentHighlight,
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
                    outline: (currentHighlight ?? 'transparent') === color ? '2px solid #0ea5e9' : 'none',
                    outlineOffset: 1,
                  }}
                  onClick={() => {
                    onSetHighlight(color === 'transparent' ? null : color)
                    setOpenDropdown(null)
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Background Color + Opacity */}
      {(!formatState.hasStickyElements || formatState.hasShapeElements) && (
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            style={buttonBaseStyle}
            title="Text background"
            onClick={() => toggleDropdown('bgColor')}
            onMouseEnter={(e) => handleMouseEnter(e, false)}
            onMouseLeave={(e) => handleMouseLeave(e, false)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect
                x="2"
                y="2"
                width="12"
                height="12"
                rx="2"
                fill={!currentBackground || currentBackground.color === 'transparent' ? 'none' : currentBackground.color}
                fillOpacity={currentBackground ? currentBackground.opacity / 100 : 1}
              />
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
                      outline: (currentBackground?.color ?? 'transparent') === color ? '2px solid #0ea5e9' : 'none',
                      outlineOffset: 1,
                    }}
                    onClick={() => {
                      if (color === 'transparent') {
                        onSetBackground(null)
                      } else {
                        onSetBackground({ color, opacity: currentBackground?.opacity ?? 100 })
                      }
                    }}
                  />
                ))}
              </div>
              <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Opacity: {currentBackground?.opacity ?? 100}%</div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={currentBackground?.opacity ?? 100}
                  onChange={(e) => {
                    const opacity = Number(e.target.value)
                    if (currentBackground) {
                      onSetBackground({ ...currentBackground, opacity })
                    } else {
                      onSetBackground({ color: '#FFFFFF', opacity })
                    }
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {formatState.hasStickyElements && (
        <>
          <div style={separatorStyle} />
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              style={buttonBaseStyle}
              title="Background colour"
              onClick={() => toggleDropdown('stickyFill')}
              onMouseEnter={(e) => handleMouseEnter(e, false)}
              onMouseLeave={(e) => handleMouseLeave(e, false)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect
                  x="2"
                  y="2"
                  width="12"
                  height="12"
                  rx="2"
                  fill={currentStickyFill ?? '#ffffff'}
                />
              </svg>
            </button>
            {openDropdown === 'stickyFill' && (
              <div style={{ ...dropdownStyle, minWidth: 'auto' }}>
                <div style={colorGridStyle}>
                  {STICKY_COLORS.map((color) => {
                    const isDefault = color === 'default'
                    const swatchColor = isDefault ? '#fff7a6' : color
                    const selected = (currentStickyFill ?? 'default') === color
                    return (
                      <div
                        key={color}
                        style={{
                          ...colorSwatchStyle,
                          background: swatchColor,
                          outline: selected ? '2px solid #0ea5e9' : 'none',
                          outlineOffset: 1,
                        }}
                        onClick={() => {
                          if (isDefault) {
                            onSetStickyFill(null)
                          } else {
                            onSetStickyFill(color)
                          }
                          setOpenDropdown(null)
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {formatState.hasShapeElements && (
        <>
          <div style={separatorStyle} />
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              style={buttonBaseStyle}
              title="Background colour"
              onClick={() => toggleDropdown('shapeFill')}
              onMouseEnter={(e) => handleMouseEnter(e, false)}
              onMouseLeave={(e) => handleMouseLeave(e, false)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect
                  x="2"
                  y="2"
                  width="12"
                  height="12"
                  rx="2"
                  fill={currentShapeFill ?? 'none'}
                />
              </svg>
            </button>
            {openDropdown === 'shapeFill' && (
              <div style={{ ...dropdownStyle, minWidth: 'auto' }}>
                <div style={colorGridStyle}>
                  {BG_COLORS.map((color) => (
                    <div
                      key={color}
                      style={{
                        ...colorSwatchStyle,
                        background: color === 'transparent' ? 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)' : color,
                        outline: (currentShapeFill ?? 'transparent') === color ? '2px solid #0ea5e9' : 'none',
                        outlineOffset: 1,
                      }}
                      onClick={() => {
                        if (color === 'transparent') {
                          onSetShapeFill(null)
                        } else {
                          onSetShapeFill(color)
                        }
                        setOpenDropdown(null)
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {formatState.hasFrameElements && (
        <>
          <div style={separatorStyle} />
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              style={buttonBaseStyle}
              title="Background colour"
              onClick={() => toggleDropdown('frameFill')}
              onMouseEnter={(e) => handleMouseEnter(e, false)}
              onMouseLeave={(e) => handleMouseLeave(e, false)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect
                  x="2"
                  y="2"
                  width="12"
                  height="12"
                  rx="2"
                  fill={currentFrameFill ?? '#ffffff'}
                />
              </svg>
            </button>
            {openDropdown === 'frameFill' && (
              <div style={{ ...dropdownStyle, minWidth: 'auto' }}>
                <div style={colorGridStyle}>
                  {BG_COLORS.map((color) => (
                    <div
                      key={color}
                      style={{
                        ...colorSwatchStyle,
                        background: color === 'transparent' ? 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px)' : color,
                        outline: (currentFrameFill ?? '#ffffff') === color ? '2px solid #0ea5e9' : 'none',
                        outlineOffset: 1,
                      }}
                      onClick={() => {
                        if (color === 'transparent') {
                          onSetFrameFill(null)
                        } else {
                          onSetFrameFill(color)
                        }
                        setOpenDropdown(null)
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

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
        <MessageSquare size={16} strokeWidth={1.5} />
      </button>
    </div>,
    document.body
  )
}
