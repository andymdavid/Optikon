import {
  Cloud,
  FileText,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  updatedAt: string
  lastAccessedAt?: string | null
  starred?: number
}

const boardIcons = [
  { icon: Cloud, bg: 'bg-cyan-100', color: 'text-cyan-500' },
  { icon: Pencil, bg: 'bg-purple-100', color: 'text-purple-500' },
  { icon: FileText, bg: 'bg-teal-100', color: 'text-teal-500' },
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = getInitials(name)
  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'
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
  const navigate = useNavigate()

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
        const response = await fetch(`${apiBaseUrl}/boards`, { signal: controller.signal })
        if (!response.ok) throw new Error('Failed to load boards')
        const data = (await response.json()) as { boards?: BoardSummary[] }
        if (!cancelled) {
          setBoards(data.boards ?? [])
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

  const handleCreateBoard = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      })
      if (!response.ok) throw new Error('Failed to duplicate board')
      const data = (await response.json()) as { id?: number | string }
      if (!data?.id) throw new Error('Invalid duplicate response')
      navigate(`/b/${data.id}`)
    } catch (_err) {
      setError('Unable to duplicate board.')
    }
  }

  const archiveBoard = async (board: BoardSummary) => {
    const confirmed = window.confirm('Archive board?')
    if (!confirmed) return
    try {
      const response = await fetch(`${apiBaseUrl}/boards/${board.id}/archive`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to archive board')
      setBoards((prev) => prev.filter((item) => String(item.id) !== String(board.id)))
    } catch (_err) {
      setError('Unable to archive board.')
    }
  }

  const BoardsHeader = () => (
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
  )

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
    const ownerLabel = 'Andy David'
    const timestamp = board.lastAccessedAt ?? board.updatedAt
    const iconConfig = boardIcons[index % boardIcons.length]
    const IconComponent = iconConfig.icon
    return (
      <TableRow
        className="cursor-pointer align-middle transition hover:bg-slate-50"
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
          <div className="flex items-center gap-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconConfig.bg}`}>
              <IconComponent size={20} className={iconConfig.color} />
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
              <span className="text-sm text-slate-500">
                Modified by {ownerLabel}, {formatRelativeDate(timestamp)}
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center -space-x-2">
            <Avatar name="Andy David" size="sm" />
            <Avatar name="Pete Winn" size="sm" />
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Avatar name={ownerLabel} size="sm" />
            <span className="text-sm text-slate-700">{ownerLabel}</span>
          </div>
        </TableCell>
        <TableCell>
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
              size={18}
              className={board.starred ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}
            />
          </Button>
        </TableCell>
        <TableCell>
          <DropdownMenu>
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
              className="w-40"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenuItem onSelect={() => beginRename(board)}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void duplicateBoard(board)}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem
                className="text-rose-600 focus:text-rose-600"
                onSelect={() => void archiveBoard(board)}
              >
                Archive
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
    <div className="mx-auto max-w-6xl px-6 py-10 text-slate-900">
      <BoardsHeader />
      <BoardsFilters />
      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      {loading ? <BoardsSkeleton /> : error ? null : boards.length === 0 ? <BoardsEmpty /> : <BoardsTable />}
    </div>
  )
}
