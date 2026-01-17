import { useEffect } from 'react'
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

  useEffect(() => {
    if (!normalizedBoardId) return
    localStorage.setItem(RECENT_BOARD_KEY, normalizedBoardId)
  }, [normalizedBoardId])

  return (
    <div className="app-shell">
      <AccountMenu apiBaseUrl={apiBaseUrl} session={session} onSessionChange={onSessionChange} />
      <CanvasBoard session={session} boardId={normalizedBoardId} />
    </div>
  )
}
