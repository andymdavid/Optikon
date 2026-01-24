import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AccountMenu } from '../components/account/AccountMenu'
import { CanvasBoard } from '../components/CanvasBoard'
import { Button } from '../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'

const RECENT_BOARD_KEY = 'optikon.recentBoardId'

type BoardInfo = {
  id: number | string
  title: string
  description?: string | null
  createdAt?: string
  updatedAt?: string
  lastAccessedAt?: string | null
  ownerPubkey?: string | null
  ownerNpub?: string | null
  defaultRole?: 'viewer' | 'commenter' | 'editor'
  isPrivate?: boolean
}

export function CanvasPage({
  apiBaseUrl,
  session,
  onSessionChange,
}: {
  apiBaseUrl: string
  session: { pubkey: string; npub: string } | null
  onSessionChange: (next: { pubkey: string; npub: string } | null) => void
}) {
  const { boardId } = useParams()
  const normalizedBoardId = boardId?.trim() ?? null
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareRole, setShareRole] = useState<'viewer' | 'commenter' | 'editor'>('editor')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsDescription, setDetailsDescription] = useState('')
  const [detailsSaving, setDetailsSaving] = useState(false)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!normalizedBoardId) return
    localStorage.setItem(RECENT_BOARD_KEY, normalizedBoardId)
  }, [normalizedBoardId])

  useEffect(() => {
    if (!normalizedBoardId) return
    let cancelled = false
    const controller = new AbortController()
    const loadBoard = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/boards/${normalizedBoardId}`, {
          signal: controller.signal,
          credentials: 'include',
        })
        if (!response.ok) {
          if (!cancelled) setBoardInfo(null)
          return
        }
        const data = (await response.json()) as BoardInfo
        if (!cancelled) {
          setBoardInfo({
            id: normalizedBoardId,
            title: data.title ?? 'Board',
            description: data.description ?? null,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            lastAccessedAt: data.lastAccessedAt,
            ownerPubkey: data.ownerPubkey ?? null,
            ownerNpub: data.ownerNpub ?? null,
            defaultRole: data.defaultRole ?? 'editor',
            isPrivate: Boolean(data.isPrivate),
          })
        }
      } catch (_err) {
        if (!cancelled) setBoardInfo(null)
      }
    }
    void loadBoard()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [apiBaseUrl, normalizedBoardId])

  useEffect(() => {
    if (!boardInfo) return
    setTitleDraft(boardInfo.title)
    setDetailsDescription(boardInfo.description ?? '')
    setShareRole(boardInfo.defaultRole ?? 'editor')
  }, [boardInfo])

  useEffect(() => {
    if (!editingTitle) return
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [editingTitle])

  const commitTitle = async () => {
    if (!boardInfo) return
    const nextTitle = titleDraft.trim()
    if (!nextTitle) {
      setTitleDraft(boardInfo.title)
      setEditingTitle(false)
      return
    }
    if (nextTitle === boardInfo.title) {
      setEditingTitle(false)
      return
    }
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${boardInfo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: nextTitle }),
      })
      if (!response.ok) throw new Error('Unable to rename board.')
      setBoardInfo((prev) => (prev ? { ...prev, title: nextTitle } : prev))
      setEditingTitle(false)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Unable to rename board.')
    }
  }

  const togglePrivacy = async () => {
    if (!boardInfo) return
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${boardInfo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isPrivate: !boardInfo.isPrivate }),
      })
      if (!response.ok) throw new Error('Unable to update privacy.')
      const data = (await response.json()) as BoardInfo
      setBoardInfo((prev) => (prev ? { ...prev, ...data, isPrivate: Boolean(data.isPrivate) } : prev))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Unable to update privacy.')
    }
  }

  const duplicateBoard = async () => {
    if (!boardInfo) return
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${boardInfo.id}/duplicate`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Unable to duplicate board.')
      const data = (await response.json()) as { id?: number | string }
      if (data?.id) {
        navigate(`/b/${data.id}`)
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Unable to duplicate board.')
    }
  }

  const archiveBoard = async () => {
    if (!boardInfo) return
    const confirmed = window.confirm('Archive board?')
    if (!confirmed) return
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${boardInfo.id}/archive`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Unable to archive board.')
      navigate('/')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Unable to archive board.')
    }
  }

  const deleteBoard = async () => {
    if (!boardInfo) return
    const confirmed = window.confirm('Delete this board? This cannot be undone.')
    if (!confirmed) return
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${boardInfo.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Unable to delete board.')
      navigate('/')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Unable to delete board.')
    }
  }

  const leaveBoard = async () => {
    if (!boardInfo) return
    if (session?.pubkey && boardInfo.ownerPubkey && session.pubkey === boardInfo.ownerPubkey) {
      window.alert('Owners cannot leave their own boards.')
      return
    }
    const confirmed = window.confirm('Leave this board? You can be invited back later.')
    if (!confirmed) return
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${boardInfo.id}/leave`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Unable to leave board.')
      navigate('/')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Unable to leave board.')
    }
  }

  const downloadBoardBackup = async () => {
    if (!boardInfo) return
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${boardInfo.id}/export`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Unable to download backup.')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `optikon-board-${boardInfo.id}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Unable to download backup.')
    }
  }

  const copyBoardLink = async () => {
    if (!boardInfo) return
    const shareUrl = `${window.location.origin}/b/${boardInfo.id}`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        window.prompt('Copy board link:', shareUrl)
      }
    } catch (_err) {
      window.prompt('Copy board link:', shareUrl)
    }
  }

  const openShare = () => setShareOpen(true)
  const closeShare = () => setShareOpen(false)

  const openDetails = () => setDetailsOpen(true)
  const closeDetails = () => setDetailsOpen(false)

  const saveDetails = async () => {
    if (!boardInfo || detailsSaving) return
    setDetailsSaving(true)
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${boardInfo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: titleDraft.trim() || boardInfo.title,
          description: detailsDescription.trim() ? detailsDescription.trim() : null,
        }),
      })
      if (!response.ok) throw new Error('Unable to update board.')
      const data = (await response.json()) as BoardInfo
      setBoardInfo((prev) => (prev ? { ...prev, ...data } : prev))
      setDetailsOpen(false)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Unable to update board.')
    } finally {
      setDetailsSaving(false)
    }
  }

  return (
    <div className="app-shell canvas-shell">
      <AccountMenu apiBaseUrl={apiBaseUrl} session={session} onSessionChange={onSessionChange} />
      {boardInfo && (
        <div className="board-title">
          <button
            type="button"
            className="board-title__product"
            onClick={() => navigate('/')}
          >
            Optikon
          </button>
          <span className="board-title__divider" aria-hidden="true" />
          {editingTitle ? (
            <Input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void commitTitle()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setTitleDraft(boardInfo.title)
                  setEditingTitle(false)
                }
              }}
              className="board-title__input"
            />
          ) : (
            <button
              type="button"
              className="board-title__name"
              onClick={() => setEditingTitle(true)}
            >
              {boardInfo.title}
            </button>
          )}
          {boardInfo.isPrivate && (
            <span className="board-title__lock" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                <path
                  d="M7 10V8a5 5 0 0 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v7A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-7A1.5 1.5 0 0 1 5.5 10H7Zm2 0h6V8a3 3 0 1 0-6 0v2Z"
                  fill="currentColor"
                />
              </svg>
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="board-title__menu">
                <MoreHorizontal size={18} className="text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onSelect={() => {
                  openShare()
                }}
              >
                Share
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void copyBoardLink()
                }}
              >
                Copy board link
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  window.open(`/b/${boardInfo.id}`, '_blank', 'noopener,noreferrer')
                }}
              >
                Open in new tab
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  setEditingTitle(true)
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void duplicateBoard()}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openDetails()}>Board details</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void togglePrivacy()}>
                {boardInfo.isPrivate ? 'Make public' : 'Make private'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void downloadBoardBackup()}>
                Download backup
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={
                  !!session?.pubkey &&
                  !!boardInfo.ownerPubkey &&
                  session.pubkey === boardInfo.ownerPubkey
                }
                onSelect={() => void leaveBoard()}
              >
                Leave
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void archiveBoard()}>Archive</DropdownMenuItem>
              <DropdownMenuItem
                className="text-rose-600 focus:text-rose-600"
                disabled={
                  !session?.pubkey ||
                  !boardInfo.ownerPubkey ||
                  session.pubkey !== boardInfo.ownerPubkey
                }
                onSelect={() => void deleteBoard()}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <CanvasBoard session={session} boardId={normalizedBoardId} />
      {shareOpen && boardInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={closeShare}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Share board</h2>
                <p className="mt-1 text-sm text-slate-500">Share this board with Nostr collaborators.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeShare} aria-label="Close share">
                <span className="text-slate-500">×</span>
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Board link
              </label>
              <div className="flex items-center gap-2">
                <Input readOnly value={`${window.location.origin}/b/${boardInfo.id}`} className="font-mono text-xs" />
                <Button
                  onClick={() => {
                    void copyBoardLink()
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
            <div className="mt-6">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Default access
              </label>
              <Select
                value={shareRole}
                onValueChange={(value) => {
                  const nextRole = value as 'viewer' | 'commenter' | 'editor'
                  setShareRole(nextRole)
                  void fetch(`${apiBaseUrl}/boards/${boardInfo.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ defaultRole: nextRole }),
                  })
                    .then((response) => (response.ok ? response.json() : null))
                    .then((data) => {
                      if (!data) return
                      setBoardInfo((prev) =>
                        prev
                          ? { ...prev, defaultRole: data.defaultRole ?? nextRole }
                          : prev
                      )
                    })
                    .catch(() => {})
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="commenter">Commenter</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-slate-400">
                Anonymous access is always viewer-only. Signed-in users use this default role.
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={closeShare}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      {detailsOpen && boardInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={closeDetails}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Board details</h2>
                <p className="mt-1 text-sm text-slate-500">Edit title and description.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeDetails} aria-label="Close details">
                <span className="text-slate-500">×</span>
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              <Input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
              <textarea
                value={detailsDescription}
                onChange={(event) => setDetailsDescription(event.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={closeDetails}>
                Cancel
              </Button>
              <Button onClick={() => void saveDetails()} disabled={detailsSaving}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
