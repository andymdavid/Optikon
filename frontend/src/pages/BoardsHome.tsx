import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type BoardSummary = {
  id: number | string
  title: string
  updatedAt: string
}

export function BoardsHome({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

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

  return (
    <div className="boards-home">
      <header className="boards-home__header">
        <h1>Boards</h1>
        <button className="boards-home__new" type="button" onClick={() => void handleCreateBoard()}>
          New board
        </button>
      </header>
      {error && <p className="boards-home__error">{error}</p>}
      {loading ? (
        <p className="boards-home__empty">Loading boards...</p>
      ) : boards.length === 0 ? (
        <p className="boards-home__empty">No boards yet.</p>
      ) : (
        <ul className="boards-home__list">
          {boards.map((board) => (
            <li key={board.id}>
              <button type="button" onClick={() => navigate(`/b/${board.id}`)}>
                <span className="boards-home__title">{board.title}</span>
                <span className="boards-home__meta">
                  {new Date(board.updatedAt).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
