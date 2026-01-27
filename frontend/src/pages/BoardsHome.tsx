import {
  Building2,
  Cloud,
  FileText,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  UserPlus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AccountMenu } from '../components/account/AccountMenu'
import { NostrLoginCard } from '../components/account/NostrLoginModal'
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
  workspaceId?: number | null
}

type BoardMember = {
  pubkey: string
  npub: string
  role: 'viewer' | 'commenter' | 'editor'
  createdAt: string
}

type WorkspaceSummary = {
  id: number
  title: string
  isPersonal: boolean
  ownerPubkey: string | null
}

type WorkspaceMember = {
  pubkey: string
  npub: string
  role: string
  createdAt: string
}

const LAST_WORKSPACE_KEY = 'optikon:last-workspace-id'

const normalizeBoard = (board: BoardSummary): BoardSummary => ({
  ...board,
  isPrivate: Boolean(board.isPrivate),
  workspaceId: typeof board.workspaceId === 'number' && Number.isFinite(board.workspaceId) ? board.workspaceId : null,
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
  const [session, setSession] = useState<{ pubkey: string; npub: string } | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false)
  const [workspaceTitleDraft, setWorkspaceTitleDraft] = useState('')
  const [workspaceSaving, setWorkspaceSaving] = useState(false)
  const [workspaceInviteOpen, setWorkspaceInviteOpen] = useState(false)
  const [workspaceInviteTarget, setWorkspaceInviteTarget] = useState('')
  const [workspaceInviteSaving, setWorkspaceInviteSaving] = useState(false)
  const [workspaceInviteError, setWorkspaceInviteError] = useState<string | null>(null)
  const [workspaceInviteSuccess, setWorkspaceInviteSuccess] = useState<string | null>(null)
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])
  const [workspaceMembersLoading, setWorkspaceMembersLoading] = useState(false)
  const [workspaceMembersError, setWorkspaceMembersError] = useState<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
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
  const [detailsMembers, setDetailsMembers] = useState<BoardMember[]>([])
  const [detailsMembersLoading, setDetailsMembersLoading] = useState(false)
  const [detailsMembersError, setDetailsMembersError] = useState<string | null>(null)
  const [inviteNpub, setInviteNpub] = useState('')
  const [inviteRole, setInviteRole] = useState<'viewer' | 'commenter' | 'editor'>('viewer')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [filterBy, setFilterBy] = useState<'all' | 'starred'>('all')
  const [ownedBy, setOwnedBy] = useState<'anyone' | 'me' | 'not-me'>('anyone')
  const [sortBy, setSortBy] = useState<'last-opened' | 'last-modified' | 'last-created' | 'alpha'>('last-opened')
  const [filterOpen, setFilterOpen] = useState(false)
  const [ownedOpen, setOwnedOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const navigate = useNavigate()
  const avatarFetchInFlightRef = useRef<Set<string>>(new Set())
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const workspaceById = useMemo(() => {
    const next = new Map<number, WorkspaceSummary>()
    workspaces.forEach((workspace) => {
      next.set(workspace.id, workspace)
    })
    return next
  }, [workspaces])

  const selectedWorkspace =
    selectedWorkspaceId != null ? workspaceById.get(Number(selectedWorkspaceId)) ?? null : null
  const isSelectedWorkspaceOwner =
    !!session?.pubkey &&
    !!selectedWorkspace?.ownerPubkey &&
    session.pubkey === selectedWorkspace.ownerPubkey

  const filteredBoards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const sessionPubkey = session?.pubkey ?? null
    const toMs = (value?: string | null) => {
      if (!value) return 0
      const parsed = Date.parse(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    let next = boards.slice()
    if (selectedWorkspaceId) {
      const workspaceId = Number(selectedWorkspaceId)
      next = next.filter((board) => board.workspaceId === workspaceId)
    }
    if (filterBy === 'starred') {
      next = next.filter((board) => board.starred === 1)
    }
    if (ownedBy === 'me') {
      next = sessionPubkey ? next.filter((board) => board.ownerPubkey === sessionPubkey) : []
    } else if (ownedBy === 'not-me' && sessionPubkey) {
      next = next.filter((board) => board.ownerPubkey !== sessionPubkey)
    }
    if (query) {
      next = next.filter((board) => board.title.toLowerCase().includes(query))
    }
    next.sort((a, b) => {
      if (sortBy === 'alpha') {
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      }
      if (sortBy === 'last-modified') {
        return toMs(b.updatedAt) - toMs(a.updatedAt)
      }
      if (sortBy === 'last-created') {
        return toMs(b.createdAt) - toMs(a.createdAt)
      }
      return toMs(b.lastAccessedAt) - toMs(a.lastAccessedAt)
    })
    return next
  }, [boards, filterBy, ownedBy, searchQuery, selectedWorkspaceId, session?.pubkey, sortBy])

  const handleRowOpen = (id: number | string, isEditing: boolean) => {
    if (isEditing) return
    navigate(`/b/${id}`)
  }

  const loadBoards = useCallback(
    async (signal?: AbortSignal) => {
      if (!session?.pubkey) {
        setBoards([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const response = await fetch(`${apiBaseUrl}/boards`, {
          signal,
          credentials: 'include',
        })
        if (!response.ok) throw new Error('Failed to load boards')
        const data = (await response.json()) as { boards?: BoardSummary[] }
        setBoards((data.boards ?? []).map(normalizeBoard))
        setError(null)
      } catch (_err) {
        if (signal?.aborted) return
        setError('Unable to load boards.')
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [apiBaseUrl, session?.pubkey]
  )

  const loadWorkspaces = useCallback(
    async (signal?: AbortSignal) => {
      if (!session?.pubkey) {
        setWorkspaces([])
        setSelectedWorkspaceId(null)
        setWorkspacesLoading(false)
        return
      }
      setWorkspacesLoading(true)
      setWorkspacesError(null)
      try {
        const response = await fetch(`${apiBaseUrl}/workspaces`, {
          signal,
          credentials: 'include',
        })
        if (!response.ok) throw new Error('Failed to load workspaces')
        const data = (await response.json()) as { workspaces?: WorkspaceSummary[] }
        setWorkspaces(data.workspaces ?? [])
      } catch (_err) {
        if (signal?.aborted) return
        setWorkspacesError('Unable to load workspaces.')
        setWorkspaces([])
      } finally {
        if (!signal?.aborted) setWorkspacesLoading(false)
      }
    },
    [apiBaseUrl, session?.pubkey]
  )

  const loadWorkspaceMembers = useCallback(async () => {
    if (!session?.pubkey || !selectedWorkspaceId) {
      setWorkspaceMembers([])
      setWorkspaceMembersLoading(false)
      return
    }
    setWorkspaceMembersLoading(true)
    setWorkspaceMembersError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/workspaces/${selectedWorkspaceId}/members`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Unable to load members')
      const data = (await response.json()) as { members?: WorkspaceMember[] }
      setWorkspaceMembers(data.members ?? [])
    } catch (_err) {
      setWorkspaceMembersError('Unable to load members.')
      setWorkspaceMembers([])
    } finally {
      setWorkspaceMembersLoading(false)
    }
  }, [apiBaseUrl, selectedWorkspaceId, session?.pubkey])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const loadSession = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/me`, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) {
          if (!cancelled) setSession(null)
          return
        }
        const data = (await response.json()) as { pubkey: string; npub: string } | null
        if (!cancelled) setSession(data)
      } catch (_err) {
        if (!cancelled) setSession(null)
      } finally {
        if (!cancelled) setSessionLoading(false)
      }
    }
    void loadSession()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [apiBaseUrl])

  useEffect(() => {
    if (sessionLoading) return
    const controller = new AbortController()
    void loadWorkspaces(controller.signal)
    void loadBoards(controller.signal)
    return () => controller.abort()
  }, [loadBoards, loadWorkspaces, sessionLoading])

  useEffect(() => {
    if (!session?.pubkey) {
      setSelectedWorkspaceId(null)
      return
    }
    if (workspaces.length === 0) return
    const workspaceIds = new Set(workspaces.map((workspace) => workspace.id))
    if (selectedWorkspaceId && workspaceIds.has(Number(selectedWorkspaceId))) {
      return
    }
    let nextId: number | null = null
    try {
      const stored = window.localStorage.getItem(LAST_WORKSPACE_KEY)
      if (stored) {
        const parsed = Number(stored)
        if (Number.isFinite(parsed) && workspaceIds.has(parsed)) {
          nextId = parsed
        }
      }
    } catch (_err) {}
    if (nextId == null) {
      const personal = workspaces.find(
        (workspace) => workspace.isPersonal && workspace.ownerPubkey === session.pubkey
      )
      nextId = personal?.id ?? workspaces[0]?.id ?? null
    }
    setSelectedWorkspaceId(nextId != null ? String(nextId) : null)
  }, [selectedWorkspaceId, session?.pubkey, workspaces])

  useEffect(() => {
    if (!selectedWorkspaceId) return
    try {
      window.localStorage.setItem(LAST_WORKSPACE_KEY, selectedWorkspaceId)
    } catch (_err) {}
  }, [selectedWorkspaceId])

  useEffect(() => {
    if (!workspaceInviteOpen) return
    if (!isSelectedWorkspaceOwner) return
    void loadWorkspaceMembers()
  }, [isSelectedWorkspaceOwner, loadWorkspaceMembers, workspaceInviteOpen])

  useEffect(() => {
    if (!session?.pubkey) return
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
  }, [apiBaseUrl, session?.pubkey])

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
    if (!session) {
      setLoginOpen(true)
      return
    }
    if (!selectedWorkspaceId) {
      setError('Select a workspace before creating a board.')
      return
    }
    try {
      const response = await fetch(`${apiBaseUrl}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ workspaceId: Number(selectedWorkspaceId) }),
      })
      if (!response.ok) throw new Error('Failed to create board')
      const data = (await response.json()) as { id?: number | string }
      if (!data?.id) throw new Error('Invalid board response')
      navigate(`/b/${data.id}`)
    } catch (_err) {
      setError('Unable to create board.')
    }
  }

  const openImportPicker = () => {
    if (!session) {
      setLoginOpen(true)
      return
    }
    importInputRef.current?.click()
  }

  const handleImportBoard = async (file: File) => {
    try {
      const content = await file.text()
      const payload = JSON.parse(content) as Record<string, unknown>
      const response = await fetch(`${apiBaseUrl}/boards/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to import board')
      const data = (await response.json()) as { id?: number | string }
      if (!data?.id) throw new Error('Invalid import response')
      navigate(`/b/${data.id}`)
    } catch (_err) {
      setError('Unable to import board.')
    }
  }

  const handleCreateWorkspace = async () => {
    if (!session) {
      setLoginOpen(true)
      return
    }
    if (workspaceSaving) return
    setWorkspaceSaving(true)
    setWorkspacesError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: workspaceTitleDraft }),
      })
      if (!response.ok) throw new Error('Failed to create workspace')
      const created = (await response.json()) as WorkspaceSummary
      setWorkspaces((prev) => [created, ...prev])
      setSelectedWorkspaceId(String(created.id))
      setWorkspaceTitleDraft('')
      setWorkspaceCreateOpen(false)
      void loadBoards()
    } catch (_err) {
      setWorkspacesError('Unable to create workspace.')
    } finally {
      setWorkspaceSaving(false)
    }
  }

  const handleInviteWorkspaceMember = async () => {
    if (!session?.pubkey) return
    if (!selectedWorkspaceId) {
      setWorkspaceInviteError('Select a workspace first.')
      return
    }
    if (!selectedWorkspace) {
      setWorkspaceInviteError('Workspace not found.')
      return
    }
    if (!selectedWorkspace.ownerPubkey || selectedWorkspace.ownerPubkey !== session.pubkey) {
      setWorkspaceInviteError('Only the workspace owner can invite members.')
      return
    }
    if (workspaceInviteSaving) return
    const target = workspaceInviteTarget.trim()
    if (!target) {
      setWorkspaceInviteError('Enter a npub or pubkey to invite.')
      return
    }
    if (!target.startsWith('npub') && !/^([0-9a-f]{64})$/i.test(target)) {
      setWorkspaceInviteError('Enter a valid npub or 64-char hex pubkey.')
      return
    }
    setWorkspaceInviteSaving(true)
    setWorkspaceInviteError(null)
    setWorkspaceInviteSuccess(null)
    try {
      const payload = target.startsWith('npub') ? { npub: target } : { pubkey: target }
      const response = await fetch(`${apiBaseUrl}/workspaces/${selectedWorkspaceId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        let message = 'Unable to invite member.'
        try {
          const data = (await response.json()) as { message?: string }
          if (data?.message) message = data.message
        } catch (_err) {}
        throw new Error(message)
      }
      setWorkspaceInviteTarget('')
      setWorkspaceInviteSuccess('Member added to workspace.')
      void loadWorkspaceMembers()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to invite member.'
      setWorkspaceInviteError(message)
    } finally {
      setWorkspaceInviteSaving(false)
    }
  }

  const handleImportChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void handleImportBoard(file)
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

  const downloadBoardBackup = async (board: BoardSummary) => {
    const resolveFilename = (headerValue: string | null) => {
      if (!headerValue) return null
      const match = /filename="?([^"]+)"?/i.exec(headerValue)
      return match?.[1] ?? null
    }
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${board.id}/export`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to export board')
      const blob = await response.blob()
      const filename =
        resolveFilename(response.headers.get('Content-Disposition')) ??
        `optikon-board-${board.id}.json`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (_err) {
      setError('Unable to download backup.')
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
    if (!session?.pubkey || !board.ownerPubkey || session.pubkey !== board.ownerPubkey) {
      setError('Only the board owner can delete.')
      return
    }
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
      setOpenMenuId(null)
    } catch (_err) {
      setError('Unable to delete board.')
    }
  }

  const openDetails = (board: BoardSummary) => {
    setDetailsBoard(board)
    setDetailsTitle(board.title)
    setDetailsDescription(board.description ?? '')
    setInviteNpub('')
    setInviteRole('viewer')
    setDetailsMembersError(null)
  }

  const reloadMembers = useCallback(async () => {
    if (!detailsBoard || !session?.pubkey || !detailsBoard.ownerPubkey) {
      setDetailsMembers([])
      setDetailsMembersLoading(false)
      return
    }
    if (session.pubkey !== detailsBoard.ownerPubkey) {
      setDetailsMembers([])
      setDetailsMembersLoading(false)
      return
    }
    setDetailsMembersLoading(true)
    setDetailsMembersError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${detailsBoard.id}/members`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Unable to load members')
      const data = (await response.json()) as { members?: BoardMember[] }
      setDetailsMembers(data.members ?? [])
    } catch (_err) {
      setDetailsMembersError('Unable to load members.')
      setDetailsMembers([])
    } finally {
      setDetailsMembersLoading(false)
    }
  }, [apiBaseUrl, detailsBoard, session])

  useEffect(() => {
    void reloadMembers()
  }, [reloadMembers])

  const handleInviteMember = async () => {
    if (!detailsBoard || !session?.pubkey || !detailsBoard.ownerPubkey) return
    if (session.pubkey !== detailsBoard.ownerPubkey) return
    if (inviteSaving) return
    const target = inviteNpub.trim()
    if (!target) {
      setDetailsMembersError('Enter a npub or pubkey to invite.')
      return
    }
    if (!target.startsWith('npub') && !/^([0-9a-f]{64})$/i.test(target)) {
      setDetailsMembersError('Enter a valid npub or 64-char hex pubkey.')
      return
    }
    setInviteSaving(true)
    setDetailsMembersError(null)
    try {
      const payload =
        target.startsWith('npub') ? { npub: target, role: inviteRole } : { pubkey: target, role: inviteRole }
      const response = await fetch(`${apiBaseUrl}/boards/${detailsBoard.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        let message = 'Unable to add member.'
        try {
          const data = (await response.json()) as { message?: string }
          if (data?.message) message = data.message
        } catch (_err) {}
        throw new Error(message)
      }
      setInviteNpub('')
      void reloadMembers()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to add member.'
      setDetailsMembersError(message)
    } finally {
      setInviteSaving(false)
    }
  }

  const handleRemoveMember = async (pubkey: string) => {
    if (!detailsBoard || !session?.pubkey || !detailsBoard.ownerPubkey) return
    if (session.pubkey !== detailsBoard.ownerPubkey) return
    if (removingMember) return
    setRemovingMember(pubkey)
    setDetailsMembersError(null)
    try {
      const response = await fetch(
        `${apiBaseUrl}/boards/${detailsBoard.id}/members/${encodeURIComponent(pubkey)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )
      if (!response.ok) {
        let message = 'Unable to remove member.'
        try {
          const data = (await response.json()) as { message?: string }
          if (data?.message) message = data.message
        } catch (_err) {}
        throw new Error(message)
      }
      void reloadMembers()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to remove member.'
      setDetailsMembersError(message)
    } finally {
      setRemovingMember(null)
    }
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

  const leaveBoard = async (board: BoardSummary) => {
    if (session?.pubkey && board.ownerPubkey && session.pubkey === board.ownerPubkey) {
      setError('Owners cannot leave their own boards.')
      return
    }
    const confirmed = window.confirm('Leave this board? You can be invited back later.')
    if (!confirmed) return
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${board.id}/leave`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        let message = 'Unable to leave board.'
        try {
          const data = (await response.json()) as { message?: string }
          if (data?.message) message = data.message
        } catch (_err) {}
        throw new Error(message)
      }
      setBoards((prev) => prev.filter((item) => String(item.id) !== String(board.id)))
      if (detailsBoard && String(detailsBoard.id) === String(board.id)) {
        setDetailsBoard(null)
      }
      setOpenMenuId(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to leave board.'
      setError(message)
    }
  }

  const handleSessionChange = (nextSession: { pubkey: string; npub: string } | null) => {
    setSession(nextSession)
    if (!nextSession) {
      setWorkspaces([])
      setSelectedWorkspaceId(null)
      setBoards([])
      setLoading(false)
      return
    }
    void loadWorkspaces()
    void loadBoards()
  }

  const workspaceCreateModal = workspaceCreateOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={() => setWorkspaceCreateOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Create workspace</h2>
            <p className="mt-1 text-sm text-slate-500">
              Workspaces group boards and members.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWorkspaceCreateOpen(false)}
            aria-label="Close create workspace dialog"
          >
            <X size={18} className="text-slate-500" />
          </Button>
        </div>
        <div className="mt-5 space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Workspace name
          </label>
          <Input
            placeholder="Design team"
            value={workspaceTitleDraft}
            onChange={(event) => setWorkspaceTitleDraft(event.target.value)}
            disabled={workspaceSaving}
          />
        </div>
        {workspacesError && (
          <p className="mt-3 text-xs text-rose-600">{workspacesError}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setWorkspaceCreateOpen(false)} disabled={workspaceSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreateWorkspace()} disabled={workspaceSaving}>
            Create workspace
          </Button>
        </div>
      </div>
    </div>
  ) : null

  const workspaceInviteModal = workspaceInviteOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={() => setWorkspaceInviteOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Invite to workspace</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add members to {selectedWorkspace ? selectedWorkspace.title : 'this workspace'}.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWorkspaceInviteOpen(false)}
            aria-label="Close invite workspace dialog"
          >
            <X size={18} className="text-slate-500" />
          </Button>
        </div>
        {!selectedWorkspaceId ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Select a workspace before inviting members.
          </div>
        ) : !isSelectedWorkspaceOwner ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Only the workspace owner can invite members.
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Nostr npub or pubkey
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="npub1... or 64-char pubkey"
                value={workspaceInviteTarget}
                onChange={(event) => setWorkspaceInviteTarget(event.target.value)}
                disabled={workspaceInviteSaving}
              />
              <Button onClick={() => void handleInviteWorkspaceMember()} disabled={workspaceInviteSaving}>
                Invite
              </Button>
            </div>
            {workspaceInviteError && (
              <p className="text-xs text-rose-600">{workspaceInviteError}</p>
            )}
            {workspaceInviteSuccess && (
              <p className="text-xs text-emerald-600">{workspaceInviteSuccess}</p>
            )}
            <div className="mt-4 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Members</div>
                <div className="text-xs text-slate-400">{workspaceMembers.length}</div>
              </div>
              <div className="max-h-56 overflow-auto px-3 py-2 text-sm text-slate-700">
                {workspaceMembersLoading ? (
                  <div className="text-xs text-slate-400">Loading members…</div>
                ) : workspaceMembersError ? (
                  <div className="text-xs text-rose-600">{workspaceMembersError}</div>
                ) : workspaceMembers.length === 0 ? (
                  <div className="text-xs text-slate-400">No members yet.</div>
                ) : (
                  workspaceMembers.map((member) => (
                    <div key={member.pubkey} className="flex items-center justify-between gap-3 py-1.5">
                      <div className="truncate font-mono text-xs text-slate-600">{formatNpub(member.npub)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">{member.role}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <Button
            variant="ghost"
            onClick={() => setWorkspaceInviteOpen(false)}
            disabled={workspaceInviteSaving}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  ) : null

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
    const isOwner =
      !!session?.pubkey &&
      !!detailsBoard.ownerPubkey &&
      session.pubkey === detailsBoard.ownerPubkey
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

          {isOwner ? (
            <div className="mt-6 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Members</h3>
                  <p className="mt-1 text-xs text-slate-400">Invite people by npub or pubkey.</p>
                </div>
                <span className="text-xs text-slate-400">{detailsMembers.length} members</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto]">
                <Input
                  placeholder="npub1... or pubkey"
                  value={inviteNpub}
                  onChange={(event) => setInviteNpub(event.target.value)}
                  disabled={inviteSaving}
                />
                <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as BoardMember['role'])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="commenter">Commenter</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => void handleInviteMember()} disabled={inviteSaving}>
                  Invite
                </Button>
              </div>
              {detailsMembersError && (
                <p className="mt-2 text-xs text-rose-500">{detailsMembersError}</p>
              )}
              <div className="mt-4 space-y-2">
                {detailsMembersLoading ? (
                  <div className="text-xs text-slate-400">Loading members...</div>
                ) : detailsMembers.length === 0 ? (
                  <div className="text-xs text-slate-400">No members yet. Owner has full access.</div>
                ) : (
                  detailsMembers.map((member) => (
                    <div
                      key={member.pubkey}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-700">{formatNpub(member.npub)}</span>
                        <span className="text-xs uppercase text-slate-400">{member.role}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRemoveMember(member.pubkey)}
                        disabled={removingMember === member.pubkey}
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              className="text-rose-600 hover:text-rose-600"
              disabled={!isOwner}
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
                  setDetailsBoard(null)
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
      <Select
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filterBy}
        onValueChange={(value) => {
          setFilterBy(value as typeof filterBy)
          setFilterOpen(false)
        }}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All boards" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All boards</SelectItem>
          <SelectItem value="starred">Starred</SelectItem>
        </SelectContent>
      </Select>
      <Select
        open={ownedOpen}
        onOpenChange={setOwnedOpen}
        value={ownedBy}
        onValueChange={(value) => {
          setOwnedBy(value as typeof ownedBy)
          setOwnedOpen(false)
        }}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Owned by anyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="anyone">Owned by anyone</SelectItem>
          <SelectItem value="me">Owned by me</SelectItem>
          <SelectItem value="not-me">Not owned by me</SelectItem>
        </SelectContent>
      </Select>
      <span className="ml-3 text-[13px] text-slate-500">Sort by</span>
      <Select
        open={sortOpen}
        onOpenChange={setSortOpen}
        value={sortBy}
        onValueChange={(value) => {
          setSortBy(value as typeof sortBy)
          setSortOpen(false)
        }}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Last opened" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="last-opened">Last opened</SelectItem>
          <SelectItem value="last-modified">Last modified</SelectItem>
          <SelectItem value="last-created">Last created</SelectItem>
          <SelectItem value="alpha">Alphabetically</SelectItem>
        </SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-3">
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
        <Button
          onClick={() => {
            setWorkspaceInviteTarget('')
            setWorkspaceInviteError(null)
            setWorkspaceInviteSuccess(null)
            setWorkspaceInviteOpen(true)
          }}
        >
          <UserPlus size={16} />
          Invite to workspace
        </Button>
        <CreateBoardMenu />
      </div>
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
                  setDetailsBoard(null)
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
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setOpenMenuId(null)
                  window.setTimeout(() => beginRename(board), 0)
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void duplicateBoard(board)}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openDetails(board)}>Board details</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void togglePrivacy(board)}>
                {board.isPrivate ? 'Make public' : 'Make private'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  void downloadBoardBackup(board)
                }}
              >
                Download backup
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={
                  !!session?.pubkey &&
                  !!board.ownerPubkey &&
                  session.pubkey === board.ownerPubkey
                }
                onSelect={() => void leaveBoard(board)}
              >
                Leave
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void archiveBoard(board)}>Archive</DropdownMenuItem>
              <DropdownMenuItem
                className="text-rose-600 focus:text-rose-600"
                disabled={
                  !session?.pubkey ||
                  !board.ownerPubkey ||
                  session.pubkey !== board.ownerPubkey
                }
                onSelect={() => void deleteBoard(board)}
              >
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

  const CreateBoardMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button onClick={(event) => event.stopPropagation()}>
          <Plus size={16} />
          Create new
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void handleCreateBoard()
          }}
        >
          New board
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            openImportPicker()
          }}
        >
          Import
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <CreateBoardMenu />
    </div>
  )

  if (sessionLoading) {
    return (
      <div className="boards-home mx-auto max-w-[90%] py-16 text-slate-900">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="h-2 w-2 animate-pulse rounded-full bg-slate-400"></div>
          Loading session…
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="splash-shell text-slate-900">
        <div className="splash-card">
          <div className="splash-left">
            <div>
              <a href="/" className="splash-left__logo">Optikon</a>
            </div>
            <div className="splash-left__content">
              <p className="splash-left__eyebrow">Realtime Canvas Boards</p>
              <h1 className="splash-left__title">Welcome back</h1>
              <p className="splash-left__subtitle">
                Sign in with Nostr to open your workspaces. Shared boards still work by link.
              </p>
            </div>
          </div>
          <div className="splash-right">
            <NostrLoginCard
              apiBaseUrl={apiBaseUrl}
              onSuccess={(nextSession) =>
                handleSessionChange({ pubkey: nextSession.pubkey, npub: nextSession.npub })
              }
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="boards-home mx-auto max-w-[90%] py-10 text-slate-900">
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportChange}
      />
      {workspaceCreateModal}
      {workspaceInviteModal}
      {shareModal}
      {detailsModal}
      <header className="mb-8 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="board-title__product" style={{ fontSize: 28, lineHeight: 1 }}>
              Optikon
            </a>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Select
              value={selectedWorkspaceId ?? undefined}
              onValueChange={(value) => setSelectedWorkspaceId(value)}
              disabled={workspacesLoading || workspaces.length === 0}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={workspacesLoading ? 'Loading workspaces…' : 'Select workspace'} />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={String(workspace.id)}>
                    {workspace.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setWorkspaceTitleDraft('')
                setWorkspaceCreateOpen(true)
              }}
            >
              <Building2 size={16} />
              Create workspace
            </Button>
            <AccountMenu
              apiBaseUrl={apiBaseUrl}
              session={session}
              onSessionChange={handleSessionChange}
              loginOpen={loginOpen}
              onLoginOpenChange={setLoginOpen}
            />
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-medium text-slate-800">
            {selectedWorkspace ? `Boards in ${selectedWorkspace.title}` : 'Boards'}
          </h1>
          {workspacesError && <p className="text-xs text-rose-600">{workspacesError}</p>}
        </div>
      </header>
      <BoardsFilters />
      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      {loading ? (
        <BoardsSkeleton />
      ) : filteredBoards.length === 0 ? (
        <BoardsEmpty />
      ) : (
        <BoardsTable />
      )}
    </div>
  )
}
