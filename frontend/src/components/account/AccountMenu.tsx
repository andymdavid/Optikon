import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'

import { fetchProfile, formatProfileName, getAvatarFallback } from '../canvas/nostrProfiles'

import { NostrLoginModal } from './NostrLoginModal'

type SessionInfo = {
  pubkey: string
  npub: string
}

const formatNpub = (npub: string) => {
  if (!npub) return 'Unknown'
  const start = npub.slice(0, 8)
  const end = npub.slice(-4)
  return `${start}…${end}`
}

export function AccountMenu({
  apiBaseUrl,
  session,
  onSessionChange,
}: {
  apiBaseUrl: string
  session: SessionInfo | null
  onSessionChange: (session: SessionInfo | null) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const displayName = useMemo(() => {
    if (!session) return 'Sign in'
    return profileName ?? formatNpub(session.npub)
  }, [profileName, session])

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

  useEffect(() => {
    let cancelled = false
    if (!session?.pubkey) {
      setAvatarUrl(null)
      setProfileName(null)
      return () => {
        cancelled = true
      }
    }
    const fallback = getAvatarFallback(session.pubkey)
    setAvatarUrl(fallback)
    setProfileName(null)
    void fetchProfile(session.pubkey).then((profile) => {
      if (cancelled || !profile) return
      if (profile.picture) setAvatarUrl(profile.picture)
      const name = formatProfileName(profile)
      if (name) setProfileName(name)
    })
    return () => {
      cancelled = true
    }
  }, [session?.pubkey])

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

  const handleLogout = async () => {
    await fetch(`${apiBaseUrl}/auth/logout`, { method: 'POST', credentials: 'include' })
    onSessionChange(null)
    setMenuOpen(false)
  }

  const handleLoginSuccess = (nextSession: SessionInfo) => {
    onSessionChange({ pubkey: nextSession.pubkey, npub: nextSession.npub })
    setModalOpen(false)
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
        <NostrLoginModal
          open={modalOpen}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setModalOpen(false)}
          onSuccess={handleLoginSuccess}
        />
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
          <img src={avatarUrl ?? getAvatarFallback(session.pubkey)} alt="" />
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
      <NostrLoginModal
        open={modalOpen}
        apiBaseUrl={apiBaseUrl}
        onClose={() => setModalOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </div>
  )
}
