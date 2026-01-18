import {
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Star,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
  const [menuId, setMenuId] = useState<string | null>(null)
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

  useEffect(() => {
    if (!menuId) return
    const handleClick = () => setMenuId(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [menuId])

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
    setMenuId(null)
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
      setMenuId(null)
    } catch (_err) {
      setError('Unable to archive board.')
    }
  }

  const BoardsHeader = () => (
    <header className="flex items-center justify-between gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Boards in this team</h1>
        <p className="mt-2 text-sm text-slate-500">Recent activity across your workspace.</p>
      </div>
      <button
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
        type="button"
        onClick={() => void handleCreateBoard()}
      >
        <Plus size={16} />
        New board
      </button>
    </header>
  )

  const BoardsFilters = () => (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <select
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
        aria-label="Filter boards"
      >
        <option>All boards</option>
      </select>
      <select
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
        aria-label="Owner filter"
      >
        <option>Owned by anyone</option>
      </select>
      <select
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
        aria-label="Sort boards"
      >
        <option>Last opened</option>
      </select>
      <div
        className="ml-auto inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-label="View toggle"
      >
        <button
          type="button"
          className="inline-flex items-center gap-2 bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          disabled
        >
          <List size={16} />
          List
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-400"
          disabled
        >
          <LayoutGrid size={16} />
          Grid
        </button>
      </div>
    </div>
  )

  const BoardsTable = () => (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(240px,_1.6fr)_140px_160px_60px_52px] items-center gap-3 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        <div>Name</div>
        <div>Online users</div>
        <div>Owner</div>
        <div></div>
        <div></div>
      </div>
      {boards.map((board) => (
        <BoardRow key={board.id} board={board} />
      ))}
    </div>
  )

  const BoardRow = ({ board }: { board: BoardSummary }) => {
    const isEditing = editingId === String(board.id)
    const isMenuOpen = menuId === String(board.id)
    const ownerLabel = 'You'
    const timestamp = board.lastAccessedAt ?? board.updatedAt
    return (
      <div
        className="grid min-h-[72px] grid-cols-[minmax(240px,_1.6fr)_140px_160px_60px_52px] items-center gap-3 border-t border-slate-100 px-5 py-4 transition hover:bg-slate-50"
        role="button"
        tabIndex={0}
        onClick={() => handleRowOpen(board.id, isEditing)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            handleRowOpen(board.id, isEditing)
          }
        }}
      >
        <div className="flex flex-col gap-1">
          {isEditing ? (
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
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
        <div className="text-sm text-slate-400">—</div>
        <div>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
            {ownerLabel}
          </span>
        </div>
        <button
          type="button"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition ${
            board.starred ? 'text-amber-500' : 'text-slate-400'
          } hover:bg-slate-100 hover:text-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200`}
          onClick={(event) => {
            event.stopPropagation()
            void toggleStar(board)
          }}
          aria-label={board.starred ? 'Unstar board' : 'Star board'}
        >
          <Star className={board.starred ? 'fill-amber-400' : ''} size={18} />
        </button>
        <div className="relative justify-self-end">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setMenuId((prev) => (prev === String(board.id) ? null : String(board.id)))
            }}
          >
            <MoreHorizontal size={18} />
          </button>
          {isMenuOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => beginRename(board)}
              >
                Rename
              </button>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => void duplicateBoard(board)}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                onClick={() => void archiveBoard(board)}
              >
                Archive
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const BoardsSkeleton = () => (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(240px,_1.6fr)_140px_160px_60px_52px] items-center gap-3 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        <div>Name</div>
        <div>Online users</div>
        <div>Owner</div>
        <div></div>
        <div></div>
      </div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="grid min-h-[72px] grid-cols-[minmax(240px,_1.6fr)_140px_160px_60px_52px] items-center gap-3 border-t border-slate-100 px-5 py-4"
        >
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-100"></div>
          <div className="h-3 w-16 animate-pulse rounded-full bg-slate-100"></div>
          <div className="h-3 w-16 animate-pulse rounded-full bg-slate-100"></div>
          <div className="h-6 w-6 animate-pulse justify-self-center rounded-lg bg-slate-100"></div>
          <div className="h-6 w-6 animate-pulse justify-self-end rounded-lg bg-slate-100"></div>
        </div>
      ))}
    </div>
  )

  const BoardsEmpty = () => (
    <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-left shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Create your first board</h2>
      <p className="mt-2 text-sm text-slate-500">Kick off a new canvas and start mapping ideas.</p>
      <button
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
        type="button"
        onClick={() => void handleCreateBoard()}
      >
        <Plus size={16} />
        New board
      </button>
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
