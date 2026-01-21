import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { AccountMenu } from '../components/account/AccountMenu'
import { CanvasBoard } from '../components/CanvasBoard'

const RECENT_BOARD_KEY = 'optikon.recentBoardId'

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
  const [boardInfo, setBoardInfo] = useState<{ title: string; isPrivate: boolean } | null>(null)

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
        const data = (await response.json()) as { title?: string; isPrivate?: boolean }
        if (!cancelled) {
          setBoardInfo({
            title: data.title ?? 'Board',
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

  return (
    <div className="app-shell">
      <AccountMenu apiBaseUrl={apiBaseUrl} session={session} onSessionChange={onSessionChange} />
      {boardInfo && (
        <div className="board-title">
          <span>{boardInfo.title}</span>
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
        </div>
      )}
      <CanvasBoard session={session} boardId={normalizedBoardId} />
    </div>
  )
}
