import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { BoardsHome } from './pages/BoardsHome'
import { CanvasPage } from './pages/CanvasPage'

import './App.css'

const API_BASE_URL = 'http://localhost:3025'

function App() {
  const [session, setSession] = useState<{ pubkey: string; npub: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const loadSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
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
      }
    }
    void loadSession()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  return (
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/" element={<BoardsHome apiBaseUrl={API_BASE_URL} />} />
        <Route
          path="/b/:boardId"
          element={
            <CanvasPage
              apiBaseUrl={API_BASE_URL}
              session={session}
              onSessionChange={setSession}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
