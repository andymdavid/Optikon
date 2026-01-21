import {
  Cloud,
  FileText,
  LayoutGrid,
  List,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  fetchProfile,
  formatProfileName,
  getAvatarFallback,
} from '../components/canvas/nostrProfiles'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group'

type BoardSummary = {
  id: number | string
  title: string
  description?: string | null
  createdAt?: string
  updatedAt: string
  lastAccessedAt?: string | null
  starred?: number
  ownerPubkey?: string | null
  ownerNpub?: string | null
  onlineUsers?: Array<{ pubkey: string; npub: string }>
  defaultRole?: 'viewer' | 'commenter' | 'editor'
  isPrivate?: boolean
}

const normalizeBoard = (board: BoardSummary): BoardSummary => ({
  ...board,
  isPrivate: Boolean(board.isPrivate),
})

const boardIcons = [
  { icon: Cloud, bg: 'bg-cyan-50', color: 'text-cyan-400' },
  { icon: Pencil, bg: 'bg-purple-50', color: 'text-purple-400' },
  { icon: FileText, bg: 'bg-teal-50', color: 'text-teal-400' },
]

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  }
}

function formatAbsoluteDate(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatNpub(npub: string | null | undefined) {
  if (!npub) return 'Unknown'
  const start = npub.slice(0, 8)
  const end = npub.slice(-4)
  return `${start}…${end}`
}

function Avatar({
  name,
  imageUrl,
  size = 'md',
}: {
  name: string
  imageUrl?: string | null
  size?: 'sm' | 'md'
}) {
  const initials = getInitials(name)
  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'
  if (imageUrl) {
    return (
      <div
        className={`${sizeClasses} overflow-hidden rounded-full bg-slate-100`}
        aria-label={name}
      >
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      </div>
    )
  }
  return (
    <div
      className={`${sizeClasses} flex items-center justify-center rounded-full bg-slate-100 font-medium text-slate-500`}
    >
      {initials}
    </div>
  )
}

export function BoardsHome({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({})
  const [profileNames, setProfileNames] = useState<Record<string, string>>({})
  const [shareBoard, setShareBoard] = useState<BoardSummary | null>(null)
  const [shareRole, setShareRole] = useState<'viewer' | 'commenter' | 'editor'>('editor')
  const [detailsBoard, setDetailsBoard] = useState<BoardSummary | null>(null)
  const [detailsTitle, setDetailsTitle] = useState('')
  const [detailsDescription, setDetailsDescription] = useState('')
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const navigate = useNavigate()
  const avatarFetchInFlightRef = useRef<Set<string>>(new Set())

  const filteredBoards = useMemo(() => {
    if (!searchQuery.trim()) return boards
    const query = searchQuery.toLowerCase()
    return boards.filter((board) => board.title.toLowerCase().includes(query))
  }, [boards, searchQuery])

  const handleRowOpen = (id: number | string, isEditing: boolean) => {
    if (isEditing) return
    navigate(`/b/${id}`)
  }

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const loadBoards = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/boards`, {
          signal: controller.signal,
          credentials: 'include',
        })
        if (!response.ok) throw new Error('Failed to load boards')
        const data = (await response.json()) as { boards?: BoardSummary[] }
        if (!cancelled) {
          setBoards((data.boards ?? []).map(normalizeBoard))
          setError(null)
        }
      } catch (_err) {
        if (!cancelled) {
          setError('Unable to load boards.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadBoards()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [apiBaseUrl])

  useEffect(() => {
    let cancelled = false
    const pollPresence = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/boards/presence`, {
          credentials: 'include',
        })
        if (!response.ok) return
        const data = (await response.json()) as {
          onlineUsersByBoard?: Record<string, Array<{ pubkey: string; npub: string }>>
        }
        if (cancelled) return
        const onlineUsersByBoard = data.onlineUsersByBoard ?? {}
        setBoards((prev) =>
          prev.map((board) => ({
            ...board,
            onlineUsers: onlineUsersByBoard[String(board.id)] ?? [],
          }))
        )
      } catch (_err) {
        if (cancelled) return
      }
    }
    void pollPresence()
    const intervalId = window.setInterval(() => {
      void pollPresence()
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    let cancelled = false
    const pubkeys = new Set<string>()
    boards.forEach((board) => {
      if (board.ownerPubkey) pubkeys.add(board.ownerPubkey)
      board.onlineUsers?.forEach((user) => {
        if (user?.pubkey) pubkeys.add(user.pubkey)
      })
    })
    if (pubkeys.size === 0) return
    setAvatarUrls((prev) => {
      const next = { ...prev }
      pubkeys.forEach((pubkey) => {
        if (!next[pubkey]) next[pubkey] = getAvatarFallback(pubkey)
      })
      return next
    })
    pubkeys.forEach((pubkey) => {
      if (avatarFetchInFlightRef.current.has(pubkey)) return
      avatarFetchInFlightRef.current.add(pubkey)
      void fetchProfile(pubkey)
        .then((profile) => {
          if (cancelled || !profile) return
          const picture = profile.picture
          if (picture) {
            setAvatarUrls((prev) =>
              prev[pubkey] === picture ? prev : { ...prev, [pubkey]: picture }
            )
          }
          const name = formatProfileName(profile)
          if (name) {
            setProfileNames((prev) => (prev[pubkey] === name ? prev : { ...prev, [pubkey]: name }))
          }
        })
        .finally(() => {
          avatarFetchInFlightRef.current.delete(pubkey)
        })
    })
    return () => {
      cancelled = true
    }
  }, [boards])

  const handleCreateBoard = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error('Failed to create board')
      const data = (await response.json()) as { id?: number | string }
      if (!data?.id) throw new Error('Invalid board response')
      navigate(`/b/${data.id}`)
    } catch (_err) {
      setError('Unable to create board.')
    }
  }

  const beginRename = (board: BoardSummary) => {
    setEditingId(String(board.id))
    setTitleDraft(board.title)
  }

  const cancelRename = () => {
    setEditingId(null)
    setTitleDraft('')
  }

  const commitRename = async () => {
    if (!editingId) return
    const nextTitle = titleDraft.trim()
    if (!nextTitle) {
      setError('Title cannot be empty.')
      return
    }
    setSavingId(editingId)
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: nextTitle }),
      })
      if (!response.ok) throw new Error('Failed to rename board')
      const data = (await response.json()) as BoardSummary
      setBoards((prev) =>
        prev.map((board) =>
          String(board.id) === editingId
            ? {
                ...board,
                title: data.title,
                updatedAt: data.updatedAt,
                lastAccessedAt: data.lastAccessedAt ?? board.lastAccessedAt,
                starred: data.starred ?? board.starred,
              }
            : board
        )
      )
      setError(null)
      cancelRename()
    } catch (_err) {
      setError('Unable to rename board.')
    } finally {
      setSavingId(null)
    }
  }

  const toggleStar = async (board: BoardSummary) => {
    const nextStarred = board.starred ? 0 : 1
    setBoards((prev) =>
      prev.map((item) =>
        String(item.id) === String(board.id) ? { ...item, starred: nextStarred } : item
      )
    )
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${board.id}/star`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ starred: nextStarred === 1 }),
      })
      if (!response.ok) throw new Error('Failed to star board')
    } catch (_err) {
      setBoards((prev) =>
        prev.map((item) =>
          String(item.id) === String(board.id) ? { ...item, starred: board.starred ?? 0 } : item
        )
      )
      setError('Unable to update star.')
    }
  }

  const duplicateBoard = async (board: BoardSummary) => {
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${board.id}/duplicate`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to duplicate board')
      const data = (await response.json()) as { id?: number | string }
      if (!data?.id) throw new Error('Invalid duplicate response')
      navigate(`/b/${data.id}`)
    } catch (_err) {
      setError('Unable to duplicate board.')
    }
  }

  const togglePrivacy = async (board: BoardSummary) => {
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${board.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isPrivate: !board.isPrivate }),
      })
      if (!response.ok) throw new Error('Failed to update privacy')
      const data = (await response.json()) as BoardSummary
      const nextIsPrivate = Boolean(data.isPrivate ?? !board.isPrivate)
      setBoards((prev) =>
        prev.map((item) =>
          String(item.id) === String(board.id)
            ? { ...item, isPrivate: nextIsPrivate }
            : item
        )
      )
      setDetailsBoard((prev) =>
        prev && String(prev.id) === String(board.id)
          ? { ...prev, isPrivate: nextIsPrivate }
          : prev
      )
    } catch (_err) {
      setError('Unable to update privacy.')
    }
  }

  const deleteBoard = async (board: BoardSummary) => {
    const confirmed = window.confirm('Delete this board? This cannot be undone.')
    if (!confirmed) return
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${board.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to delete board')
      setBoards((prev) => prev.filter((item) => String(item.id) !== String(board.id)))
      if (detailsBoard && String(detailsBoard.id) === String(board.id)) {
        setDetailsBoard(null)
      }
    } catch (_err) {
      setError('Unable to delete board.')
    }
  }

  const openDetails = (board: BoardSummary) => {
    setDetailsBoard(board)
    setDetailsTitle(board.title)
    setDetailsDescription(board.description ?? '')
  }

  const copyBoardLink = async (board: BoardSummary) => {
    try {
      const origin = window.location.origin
      await navigator.clipboard.writeText(`${origin}/b/${board.id}`)
    } catch (_err) {
      setError('Unable to copy board link.')
    }
  }

  const archiveBoard = async (board: BoardSummary) => {
    const confirmed = window.confirm('Archive board?')
    if (!confirmed) return
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${board.id}/archive`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to archive board')
      setBoards((prev) => prev.filter((item) => String(item.id) !== String(board.id)))
    } catch (_err) {
      setError('Unable to archive board.')
    }
  }

  const shareModal = shareBoard ? (() => {
    const shareUrl = `${window.location.origin}/b/${shareBoard.id}`
    const close = () => setShareBoard(null)
    const handleCopy = async () => {
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
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        onClick={close}
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
              <p className="mt-1 text-sm text-slate-500">
                Share this board with Nostr collaborators.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={close} aria-label="Close share dialog">
              <X size={18} className="text-slate-500" />
            </Button>
          </div>
          <div className="mt-5 space-y-3">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Board link
            </label>
            <div className="flex items-center gap-2">
              <Input readOnly value={shareUrl} className="font-mono text-xs" />
              <Button onClick={() => void handleCopy()}>Copy</Button>
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
                void fetch(`${apiBaseUrl}/boards/${shareBoard.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ defaultRole: nextRole }),
                })
                  .then((response) => (response.ok ? response.json() : null))
                  .then((data) => {
                    if (!data) return
                    setBoards((prev) =>
                      prev.map((board) =>
                        String(board.id) === String(shareBoard.id)
                          ? { ...board, defaultRole: data.defaultRole ?? nextRole }
                          : board
                      )
                    )
                  })
                  .catch(() => {})
              }}
            >
              <SelectTrigger className="mt-2 w-full">
                <SelectValue placeholder="Viewer" />
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
        </div>
      </div>
    )
  })() : null

  const detailsModal = detailsBoard ? (() => {
    const ownerLabel = formatNpub(detailsBoard.ownerNpub)
    const ownerAvatarUrl = detailsBoard.ownerPubkey
      ? avatarUrls[detailsBoard.ownerPubkey] ?? getAvatarFallback(detailsBoard.ownerPubkey)
      : null
    const createdAt = detailsBoard.createdAt ?? detailsBoard.updatedAt
    const modifiedAt = detailsBoard.updatedAt
    const handleSave = async () => {
      if (detailsSaving) return
      setDetailsSaving(true)
      try {
        const response = await fetch(`${apiBaseUrl}/boards/${detailsBoard.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: detailsTitle.trim(),
            description: detailsDescription.trim() ? detailsDescription.trim() : null,
          }),
        })
        if (!response.ok) {
          let message = 'Unable to update board.'
          try {
            const data = (await response.json()) as { message?: string }
            if (data?.message) message = data.message
          } catch (_err) {}
          throw new Error(message)
        }
        const data = (await response.json()) as BoardSummary
        setBoards((prev) =>
          prev.map((board) =>
            String(board.id) === String(detailsBoard.id)
              ? { ...board, ...data }
              : board
          )
        )
        setDetailsBoard((prev) => (prev ? { ...prev, ...data } : prev))
        setDetailsBoard(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to update board.'
        setError(message)
      } finally {
        setDetailsSaving(false)
      }
    }

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        onClick={() => setDetailsBoard(null)}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Board details</h2>
              <p className="mt-1 text-sm text-slate-500">
                Manage board metadata and sharing defaults.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDetailsBoard(null)}
              aria-label="Close board details"
            >
              <X size={18} className="text-slate-500" />
            </Button>
          </div>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Board name
              </label>
              <Input
                value={detailsTitle}
                onChange={(event) => setDetailsTitle(event.target.value)}
                disabled={detailsSaving}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Board description
              </label>
              <textarea
                value={detailsDescription}
                onChange={(event) => setDetailsDescription(event.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                disabled={detailsSaving}
              />
            </div>
            <div className="grid gap-4 text-sm text-slate-600 md:grid-cols-3">
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Owner</span>
                <div className="flex items-center gap-2">
                  <Avatar name={ownerLabel} imageUrl={ownerAvatarUrl} size="sm" />
                  <span>{ownerLabel}</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Created</span>
                <div>{formatAbsoluteDate(createdAt)}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Last modified</span>
                <div>{formatAbsoluteDate(modifiedAt)}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              className="text-rose-600 hover:text-rose-600"
              onClick={() => void deleteBoard(detailsBoard)}
            >
              Delete
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => void duplicateBoard(detailsBoard)}>
                Duplicate
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShareBoard(detailsBoard)
                  setShareRole(detailsBoard.defaultRole ?? 'editor')
                }}
              >
                Share
              </Button>
              <Button onClick={() => void handleSave()} disabled={detailsSaving}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  })() : null

  const BoardsFilters = () => (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <span className="text-[13px] text-slate-500">Filter by</span>
      <Select defaultValue="all">
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All boards" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All boards</SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="anyone">
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Owned by anyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="anyone">Owned by anyone</SelectItem>
        </SelectContent>
      </Select>
      <span className="ml-3 text-[13px] text-slate-500">Sort by</span>
      <Select defaultValue="last-opened">
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Last opened" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="last-opened">Last opened</SelectItem>
        </SelectContent>
      </Select>
      <ToggleGroup
        type="single"
        value="list"
        className="ml-auto"
        aria-label="View toggle"
      >
        <ToggleGroupItem value="grid" aria-label="Grid view" disabled>
          <LayoutGrid size={18} />
        </ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label="List view">
          <List size={18} />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )

  const BoardsTable = () => (
    <div className="mt-6">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-slate-100">
            <TableHead className="text-xs font-normal text-slate-400">Name</TableHead>
            <TableHead className="text-xs font-normal text-slate-400">Online users</TableHead>
            <TableHead className="text-xs font-normal text-slate-400">Owner</TableHead>
            <TableHead className="w-[70px]"></TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredBoards.map((board, index) => (
            <BoardRow key={board.id} board={board} index={index} />
          ))}
        </TableBody>
      </Table>
      {filteredBoards.length === 0 && searchQuery && (
        <div className="py-12 text-center text-sm text-slate-500">
          No boards matching "{searchQuery}"
        </div>
      )}
    </div>
  )

  const BoardRow = ({ board, index }: { board: BoardSummary; index: number }) => {
    const isEditing = editingId === String(board.id)
    const isMenuOpen = openMenuId === String(board.id)
    const ownerLabel =
      (board.ownerPubkey ? profileNames[board.ownerPubkey] : null) ??
      formatNpub(board.ownerNpub)
    const ownerAvatarUrl = board.ownerPubkey
      ? avatarUrls[board.ownerPubkey] ?? getAvatarFallback(board.ownerPubkey)
      : null
    const timestamp = board.lastAccessedAt ?? board.updatedAt
    const iconConfig = boardIcons[index % boardIcons.length]
    const IconComponent = iconConfig.icon
    const onlineUsers = board.onlineUsers ?? []
    const visibleUsers = onlineUsers.slice(0, 3)
    const overflowCount = onlineUsers.length - visibleUsers.length
    return (
      <TableRow
        className="cursor-pointer align-middle transition-colors hover:bg-slate-100"
        onClick={() => handleRowOpen(board.id, isEditing)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            handleRowOpen(board.id, isEditing)
          }
        }}
        tabIndex={0}
      >
        <TableCell>
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconConfig.bg}`}>
              <IconComponent size={16} strokeWidth={1.5} className={iconConfig.color} />
            </div>
            <div className="flex flex-col gap-0.5">
              {isEditing ? (
                <Input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={() => void commitRename()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void commitRename()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelRename()
                    }
                  }}
                  autoFocus
                  disabled={savingId === String(board.id)}
                />
              ) : (
                <span className="font-medium text-slate-800">{board.title}</span>
              )}
              <span className="text-xs text-slate-400">
                Owned by {ownerLabel}, {formatRelativeDate(timestamp)}
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center -space-x-2">
            {visibleUsers.length > 0 ? (
              visibleUsers.map((user) => {
                const displayName = profileNames[user.pubkey] ?? formatNpub(user.npub)
                return (
                  <Avatar
                    key={user.pubkey}
                    name={displayName}
                    imageUrl={avatarUrls[user.pubkey] ?? getAvatarFallback(user.pubkey)}
                    size="sm"
                  />
                )
              })
            ) : (
              <span className="text-xs text-slate-400">No one online</span>
            )}
            {overflowCount > 0 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-medium text-slate-500">
                +{overflowCount}
              </div>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Avatar name={ownerLabel} imageUrl={ownerAvatarUrl} size="sm" />
            <span className="text-xs text-slate-500">{ownerLabel}</span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={(event) => {
                event.stopPropagation()
                void toggleStar(board)
              }}
              aria-label={board.starred ? 'Unstar board' : 'Star board'}
            >
              <Star
                size={16}
                strokeWidth={board.starred ? 2 : 1.5}
                className={board.starred ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
              />
            </Button>
            {board.isPrivate && (
              <span
                className="inline-flex h-9 w-9 items-center justify-center leading-none text-slate-400"
                aria-label="Private board"
                title="Private board"
              >
                <Lock size={16} />
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <DropdownMenu
            open={isMenuOpen}
            onOpenChange={(nextOpen) => {
              setOpenMenuId(nextOpen ? String(board.id) : null)
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal size={18} className="text-slate-400" />
            </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenuItem
                onSelect={() => {
                  setShareBoard(board)
                  setShareRole(board.defaultRole ?? 'editor')
                }}
              >
                Share
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyBoardLink(board)}>
                Copy board link
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  window.open(`/b/${board.id}`, '_blank', 'noopener,noreferrer')
                }}
              >
                Open in new tab
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => beginRename(board)}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void duplicateBoard(board)}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openDetails(board)}>Board details</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void togglePrivacy(board)}>
                {board.isPrivate ? 'Make public' : 'Make private'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {}}>Download backup</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => {}}>Leave</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void archiveBoard(board)}>Archive</DropdownMenuItem>
              <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onSelect={() => {}}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    )
  }

  const BoardsSkeleton = () => (
    <div className="mt-6 space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 py-4">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-100"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-slate-100"></div>
            <div className="h-3 w-32 animate-pulse rounded bg-slate-100"></div>
          </div>
          <div className="h-4 w-20 animate-pulse rounded bg-slate-100"></div>
          <div className="h-4 w-20 animate-pulse rounded bg-slate-100"></div>
        </div>
      ))}
    </div>
  )

  const BoardsEmpty = () => (
    <div className="mt-12 flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100">
        <FileText size={28} className="text-slate-400" />
      </div>
      <h3 className="mb-2 text-base font-medium text-slate-800">Create your first board</h3>
      <p className="mb-6 max-w-sm text-sm text-slate-500">
        Kick off a new canvas and start mapping ideas.
      </p>
      <Button onClick={() => void handleCreateBoard()}>
        <Plus size={16} />
        Create new
      </Button>
    </div>
  )

  return (
    <div className="mx-auto max-w-[90%] py-10 text-slate-900">
      {shareModal}
      {detailsModal}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-medium text-slate-800">Boards in this team</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              placeholder="Search boards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
          <Button onClick={() => void handleCreateBoard()}>
            <Plus size={16} />
            Create new
          </Button>
        </div>
      </header>
      <BoardsFilters />
      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      {loading ? <BoardsSkeleton /> : boards.length === 0 ? <BoardsEmpty /> : <BoardsTable />}
    </div>
  )
}
