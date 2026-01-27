import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

type SessionInfo = {
  token: string
  pubkey: string
  npub: string
  method: string
  createdAt: number
}

type LoginMethod = 'ephemeral' | 'extension' | 'bunker' | 'secret'

type LoginEvent = {
  id: string
  pubkey: string
  sig: string
  kind: number
  content: string
  created_at: number
  tags: string[][]
}

type NostrLoginModalProps = {
  open: boolean
  apiBaseUrl: string
  onClose: () => void
  onSuccess: (session: SessionInfo) => void
}

type NostrLibs = {
  pure: any
  nip19: any
  nip46: any
}

const LOGIN_KIND = 27235
const APP_TAG = 'other-stuff-to-do'
const AUTO_LOGIN_METHOD_KEY = 'nostr_auto_login_method'
const AUTO_LOGIN_PUBKEY_KEY = 'nostr_auto_login_pubkey'
const EPHEMERAL_SECRET_KEY = 'nostr_ephemeral_secret'

let cachedLibs: NostrLibs | null = null

async function loadNostrLibs(): Promise<NostrLibs> {
  if (cachedLibs) return cachedLibs
  const base = 'https://esm.sh/nostr-tools@2.7.2'
  cachedLibs = {
    pure: await import(/* @vite-ignore */ `${base}/pure`),
    nip19: await import(/* @vite-ignore */ `${base}/nip19`),
    nip46: await import(/* @vite-ignore */ `${base}/nip46`),
  }
  return cachedLibs
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string) {
  if (!hex) return new Uint8Array()
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function decodeNsec(nip19: NostrLibs['nip19'], value: string) {
  try {
    const decoded = nip19.decode(value)
    if (decoded.type !== 'nsec' || !decoded.data) throw new Error('Invalid nsec key.')
    if (decoded.data instanceof Uint8Array) return decoded.data
    if (Array.isArray(decoded.data)) return new Uint8Array(decoded.data)
    throw new Error('Invalid nsec payload.')
  } catch (_err) {
    throw new Error('Invalid nsec key.')
  }
}

function buildUnsignedEvent(method: LoginMethod) {
  return {
    kind: LOGIN_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['app', APP_TAG],
      ['method', method],
    ],
    content: 'Authenticate with Other Stuff To Do',
  }
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey?: () => Promise<string>
      signEvent?: (event: LoginEvent) => Promise<LoginEvent>
    }
  }
}

async function signLoginEvent(method: LoginMethod, supplemental?: string): Promise<LoginEvent> {
  if (method === 'ephemeral') {
    const { pure } = await loadNostrLibs()
    let stored = localStorage.getItem(EPHEMERAL_SECRET_KEY)
    if (!stored) {
      stored = bytesToHex(pure.generateSecretKey())
      localStorage.setItem(EPHEMERAL_SECRET_KEY, stored)
    }
    const secret = hexToBytes(stored)
    return pure.finalizeEvent(buildUnsignedEvent(method), secret) as LoginEvent
  }

  if (method === 'extension') {
    if (!window.nostr?.signEvent || !window.nostr?.getPublicKey) {
      throw new Error('No NIP-07 browser extension found.')
    }
    const event = buildUnsignedEvent(method) as LoginEvent
    event.pubkey = await window.nostr.getPublicKey()
    return window.nostr.signEvent(event)
  }

  if (method === 'bunker') {
    const { pure, nip46 } = await loadNostrLibs()
    const pointer = await nip46.parseBunkerInput(supplemental || '')
    if (!pointer) throw new Error('Unable to parse bunker details.')
    const clientSecret = pure.generateSecretKey()
    const signer = new nip46.BunkerSigner(clientSecret, pointer)
    await signer.connect()
    try {
      return (await signer.signEvent(buildUnsignedEvent(method))) as LoginEvent
    } finally {
      await signer.close()
    }
  }

  if (method === 'secret') {
    const { pure, nip19 } = await loadNostrLibs()
    const secret = decodeNsec(nip19, supplemental || '')
    return pure.finalizeEvent(buildUnsignedEvent(method), secret) as LoginEvent
  }

  throw new Error('Unsupported login method.')
}

async function completeLogin(apiBaseUrl: string, method: LoginMethod, event: LoginEvent) {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ method, event }),
  })
  if (!response.ok) {
    let message = 'Login failed.'
    try {
      const data = await response.json()
      if (data?.message) message = data.message
    } catch (_err) {}
    throw new Error(message)
  }
  return (await response.json()) as SessionInfo
}

export function NostrLoginCard({
  apiBaseUrl,
  onSuccess,
}: {
  apiBaseUrl: string
  onSuccess: (session: SessionInfo) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busyMethod, setBusyMethod] = useState<LoginMethod | null>(null)
  const [bunkerValue, setBunkerValue] = useState('')
  const [secretValue, setSecretValue] = useState('')

  const isBusy = busyMethod !== null

  const runLogin = async (method: LoginMethod, supplemental?: string) => {
    setBusyMethod(method)
    setError(null)
    try {
      const signedEvent = await signLoginEvent(method, supplemental)
      const session = await completeLogin(apiBaseUrl, method, signedEvent)
      if (method === 'ephemeral') {
        localStorage.setItem(AUTO_LOGIN_METHOD_KEY, 'ephemeral')
        localStorage.setItem(AUTO_LOGIN_PUBKEY_KEY, session.pubkey)
      } else {
        localStorage.removeItem(AUTO_LOGIN_METHOD_KEY)
        localStorage.removeItem(AUTO_LOGIN_PUBKEY_KEY)
      }
      onSuccess(session)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.'
      setError(message)
    } finally {
      setBusyMethod(null)
    }
  }

  const handleBunkerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!bunkerValue.trim()) {
      setError('Enter a bunker nostrconnect URI or NIP-05 handle.')
      return
    }
    void runLogin('bunker', bunkerValue.trim())
  }

  const handleSecretSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!secretValue.trim()) {
      setError('Paste an nsec secret key to continue.')
      return
    }
    void runLogin('secret', secretValue.trim())
  }

  return (
    <section className="nostr-login-card">
      <h2>Sign in with Nostr to get started</h2>
      <p className="nostr-login-description">Start with a quick Ephemeral ID or bring your own signer.</p>
      <div className="nostr-login-actions">
        <button
          className="nostr-login-option"
          type="button"
          onClick={() => void runLogin('ephemeral')}
          disabled={isBusy}
        >
          {busyMethod === 'ephemeral' ? 'Signing in…' : 'Sign Up'}
        </button>
      </div>
      <details className="nostr-login-advanced">
        <summary>Advanced options</summary>
        <p>Use a browser extension or connect to a remote bunker.</p>
        <button
          className="nostr-login-option"
          type="button"
          onClick={() => void runLogin('extension')}
          disabled={isBusy}
        >
          {busyMethod === 'extension' ? 'Signing in…' : 'Browser extension'}
        </button>
        <form className="nostr-login-form" onSubmit={handleBunkerSubmit}>
          <input
            className="nostr-login-input"
            name="bunker"
            value={bunkerValue}
            onChange={(event) => setBunkerValue(event.target.value)}
            placeholder="nostrconnect://… or name@example.com"
            autoComplete="off"
          />
          <button className="nostr-login-submit" type="submit" disabled={isBusy}>
            {busyMethod === 'bunker' ? 'Connecting…' : 'Connect bunker'}
          </button>
        </form>
        <form className="nostr-login-form" onSubmit={handleSecretSubmit}>
          <input
            className="nostr-login-input"
            name="secret"
            value={secretValue}
            onChange={(event) => setSecretValue(event.target.value)}
            placeholder="nsec1…"
            autoComplete="off"
          />
          <button className="nostr-login-submit" type="submit" disabled={isBusy}>
            {busyMethod === 'secret' ? 'Signing in…' : 'Sign in with secret'}
          </button>
        </form>
      </details>
      {error && <p className="nostr-login-error">{error}</p>}
    </section>
  )
}

export function NostrLoginModal({ open, apiBaseUrl, onClose, onSuccess }: NostrLoginModalProps) {
  const portalTarget = useMemo(() => (typeof document === 'undefined' ? null : document.body), [])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  if (!open || !portalTarget) return null

  return createPortal(
    <div className="nostr-login-modal" role="dialog" aria-modal="true" onPointerDown={onClose}>
      <div className="nostr-login-modal__panel" onPointerDown={(event) => event.stopPropagation()}>
        <NostrLoginCard apiBaseUrl={apiBaseUrl} onSuccess={onSuccess} />
      </div>
    </div>,
    portalTarget
  )
}
