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
    <header className="boards-home__header">
      <div>
        <h1>Boards in this team</h1>
        <p className="boards-home__subtitle">Recent activity across your workspace.</p>
      </div>
      <button className="boards-home__new" type="button" onClick={() => void handleCreateBoard()}>
        <Plus size={16} />
        New board
      </button>
    </header>
  )

  const BoardsFilters = () => (
    <div className="boards-home__controls">
      <select className="boards-home__control" aria-label="Filter boards">
        <option>All boards</option>
      </select>
      <select className="boards-home__control" aria-label="Owner filter">
        <option>Owned by anyone</option>
      </select>
      <select className="boards-home__control" aria-label="Sort boards">
        <option>Last opened</option>
      </select>
      <div className="boards-home__view-toggle" aria-label="View toggle">
        <button type="button" className="is-active" disabled>
          <List size={16} />
          List
        </button>
        <button type="button" disabled>
          <LayoutGrid size={16} />
          Grid
        </button>
      </div>
    </div>
  )

  const BoardsTable = () => (
    <div className="boards-home__table">
      <div className="boards-home__row boards-home__row--header">
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
        className="boards-home__row boards-home__row--item"
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
        <div className="boards-home__name">
          {isEditing ? (
            <input
              className="boards-home__rename"
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
            <span className="boards-home__title">{board.title}</span>
          )}
          <span className="boards-home__meta">
            Modified by {ownerLabel}, {new Date(timestamp).toLocaleString()}
          </span>
        </div>
        <div className="boards-home__online">—</div>
        <div className="boards-home__owner">
          <span className="boards-home__owner-chip">{ownerLabel}</span>
        </div>
        <button
          type="button"
          className={`boards-home__star${board.starred ? ' is-active' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            void toggleStar(board)
          }}
          aria-label={board.starred ? 'Unstar board' : 'Star board'}
        >
          <Star size={18} />
        </button>
        <div className="boards-home__menu">
          <button
            type="button"
            className="boards-home__menu-trigger"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setMenuId((prev) => (prev === String(board.id) ? null : String(board.id)))
            }}
          >
            <MoreHorizontal size={18} />
          </button>
          {isMenuOpen && (
            <div className="boards-home__menu-popover" onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => beginRename(board)}>
                Rename
              </button>
              <button type="button" onClick={() => void duplicateBoard(board)}>
                Duplicate
              </button>
              <button type="button" onClick={() => void archiveBoard(board)}>
                Archive
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const BoardsSkeleton = () => (
    <div className="boards-home__table">
      <div className="boards-home__row boards-home__row--header">
        <div>Name</div>
        <div>Online users</div>
        <div>Owner</div>
        <div></div>
        <div></div>
      </div>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="boards-home__row boards-home__row--item">
          <div className="boards-home__skeleton-block"></div>
          <div className="boards-home__skeleton-pill"></div>
          <div className="boards-home__skeleton-pill"></div>
          <div className="boards-home__skeleton-icon"></div>
          <div className="boards-home__skeleton-icon"></div>
        </div>
      ))}
    </div>
  )

  const BoardsEmpty = () => (
    <div className="boards-home__empty-card">
      <h2>Create your first board</h2>
      <p>Kick off a new canvas and start mapping ideas.</p>
      <button className="boards-home__new" type="button" onClick={() => void handleCreateBoard()}>
        <Plus size={16} />
        New board
      </button>
    </div>
  )

  return (
    <div className="boards-home">
      <BoardsHeader />
      <BoardsFilters />
      {error && <p className="boards-home__error">{error}</p>}
      {loading ? <BoardsSkeleton /> : error ? null : boards.length === 0 ? <BoardsEmpty /> : <BoardsTable />}
    </div>
  )
}
