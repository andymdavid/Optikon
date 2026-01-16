import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'

import { AuthModal } from './AuthModal'

type SessionInfo = {
  pubkey: string
  npub: string
  method: string
}

const API_BASE_URL = 'http://localhost:3025'

const avatarUrlFor = (session: SessionInfo) =>
  `https://robohash.org/${encodeURIComponent(session.pubkey || session.npub || 'nostr')}.png?set=set3`

const formatNpub = (npub: string) => {
  if (!npub) return 'Unknown'
  const start = npub.slice(0, 8)
  const end = npub.slice(-4)
  return `${start}…${end}`
}

export function AccountMenu() {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const displayName = useMemo(() => {
    if (!session) return 'Sign in'
    return formatNpub(session.npub)
  }, [session])

  const fetchSession = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/session`, { credentials: 'include' })
      if (!response.ok) {
        setSession(null)
        return false
      }
      const data = (await response.json()) as SessionInfo
      setSession(data)
      return true
    } catch (_err) {
      setSession(null)
      return false
    }
  }, [])

  useEffect(() => {
    void fetchSession()
  }, [fetchSession])

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!containerRef.current || !target) return
      if (containerRef.current.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [menuOpen])

  const stopPropagation = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const handleCopy = async (value: string) => {
    if (!value) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        window.prompt('Copy to clipboard:', value)
      }
    } catch (_err) {
      window.prompt('Copy to clipboard:', value)
    }
  }

  useEffect(() => {
    if (!modalOpen) return
    let cancelled = false
    const poll = async () => {
      const ok = await fetchSession()
      if (!cancelled && ok) {
        setModalOpen(false)
      }
    }
    void poll()
    const interval = window.setInterval(() => {
      void poll()
    }, 1000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [fetchSession, modalOpen])

  const handleLogout = async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
    setSession(null)
    setMenuOpen(false)
  }

  if (!session) {
    return (
      <div
        className="account-menu"
        ref={containerRef}
        onPointerDown={stopPropagation}
        onMouseDown={stopPropagation}
        onClick={stopPropagation}
      >
        <button className="account-menu__signin" type="button" onClick={() => setModalOpen(true)}>
          Sign in
        </button>
        <AuthModal open={modalOpen} src={`${API_BASE_URL}/`} onClose={() => setModalOpen(false)} />
      </div>
    )
  }

  return (
    <div
      className="account-menu"
      ref={containerRef}
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onClick={stopPropagation}
    >
      <button
        className="account-menu__trigger"
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <span className="account-menu__avatar">
          <img src={avatarUrlFor(session)} alt="" />
        </span>
        <span className="account-menu__name">{displayName}</span>
      </button>
      {menuOpen && (
        <div className="account-menu__dropdown" role="menu">
          <button className="account-menu__item" type="button" onClick={() => void handleCopy(session.npub)}>
            Copy npub
          </button>
          <button className="account-menu__item" type="button" onClick={() => void handleCopy(session.pubkey)}>
            Copy pubkey
          </button>
          <button className="account-menu__item" type="button" disabled>
            Account
          </button>
          <div className="account-menu__divider" />
          <button
            className="account-menu__item account-menu__item--danger"
            type="button"
            onClick={() => void handleLogout()}
          >
            Logout
          </button>
        </div>
      )}
      <AuthModal open={modalOpen} src={`${API_BASE_URL}/`} onClose={() => setModalOpen(false)} />
    </div>
  )
}
