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
  const [boardTitle, setBoardTitle] = useState<string | null>(null)

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
        })
        if (!response.ok) {
          if (!cancelled) setBoardTitle(null)
          return
        }
        const data = (await response.json()) as { title?: string }
        if (!cancelled) setBoardTitle(data.title ?? 'Board')
      } catch (_err) {
        if (!cancelled) setBoardTitle(null)
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
      {boardTitle && <div className="board-title">{boardTitle}</div>}
      <CanvasBoard session={session} boardId={normalizedBoardId} />
    </div>
  )
}
