import { useEffect } from 'react'

type AuthModalProps = {
  open: boolean
  src: string
  onClose: () => void
}

export function AuthModal({ open, src, onClose }: AuthModalProps) {
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

  if (!open) return null

  return (
    <div className="auth-modal" role="dialog" aria-modal="true" onPointerDown={onClose}>
      <div className="auth-modal__panel" onPointerDown={(event) => event.stopPropagation()}>
        <iframe
          className="auth-modal__frame"
          src={src}
          title="Sign in with Nostr"
          sandbox="allow-forms allow-scripts allow-same-origin"
        />
      </div>
    </div>
  )
}
