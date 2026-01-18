import { LayoutGrid, List, MoreHorizontal, Plus, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
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

export function BoardsHome({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const navigate = useNavigate()

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
    <header className="flex flex-wrap items-center justify-between gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Boards in this team</h1>
        <p className="mt-2 text-sm text-slate-500">Recent activity across your workspace.</p>
      </div>
      <Button onClick={() => void handleCreateBoard()}>
        <Plus size={16} />
        New board
      </Button>
    </header>
  )

  const BoardsFilters = () => (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Select defaultValue="all">
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All boards" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All boards</SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="anyone">
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Owned by anyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="anyone">Owned by anyone</SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="last-opened">
        <SelectTrigger className="w-[170px]">
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
        <ToggleGroupItem value="list" aria-label="List view">
          <List size={16} />
          List
        </ToggleGroupItem>
        <ToggleGroupItem value="grid" aria-label="Grid view" disabled>
          <LayoutGrid size={16} />
          Grid
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )

  const BoardsTable = () => (
    <Card className="mt-6 overflow-hidden">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
              <TableHead>Name</TableHead>
              <TableHead>Online users</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="w-[70px]"></TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boards.map((board) => (
              <BoardRow key={board.id} board={board} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )

  const BoardRow = ({ board }: { board: BoardSummary }) => {
    const isEditing = editingId === String(board.id)
    const ownerLabel = 'You'
    const timestamp = board.lastAccessedAt ?? board.updatedAt
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
          <div className="flex flex-col gap-1">
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
              <span className="text-base font-semibold text-slate-900">{board.title}</span>
            )}
            <span className="text-xs text-slate-500">
              Modified by {ownerLabel}, {new Date(timestamp).toLocaleString()}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-sm text-slate-400">—</TableCell>
        <TableCell>
          <Badge>{ownerLabel}</Badge>
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
                variant="outline"
                size="icon"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal size={18} />
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
    <Card className="mt-6 overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50">
        <CardTitle className="text-xs uppercase tracking-[0.18em] text-slate-500">
          Loading boards
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="grid grid-cols-4 gap-4">
            <div className="h-4 w-3/5 animate-pulse rounded-full bg-slate-100"></div>
            <div className="h-4 w-20 animate-pulse rounded-full bg-slate-100"></div>
            <div className="h-4 w-16 animate-pulse rounded-full bg-slate-100"></div>
            <div className="h-4 w-10 animate-pulse rounded-full bg-slate-100"></div>
          </div>
        ))}
      </CardContent>
    </Card>
  )

  const BoardsEmpty = () => (
    <Card className="mt-6 border-dashed">
      <CardHeader>
        <CardTitle>Create your first board</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">Kick off a new canvas and start mapping ideas.</p>
        <Button onClick={() => void handleCreateBoard()}>
          <Plus size={16} />
          New board
        </Button>
      </CardContent>
    </Card>
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
