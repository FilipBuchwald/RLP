import { useCallback, useEffect, useState } from 'react'
import { Header } from './components/Header'
import { PlayerSheet } from './components/PlayerSheet'
import { Tabs } from './components/Tabs'
import { PlayerSheetContext, ToastContext } from './context'
import { SEASON } from './format'
import { Game } from './pages/Game'
import { History } from './pages/History'
import { Players } from './pages/Players'
import { Ranking } from './pages/Ranking'
import { useLive } from './queries'
import { useHashRoute } from './useHashRoute'

const TOAST_MS = 3500

export default function App() {
  const route = useHashRoute()
  const { data: live } = useLive()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])

  const closePlayer = useCallback(() => setPlayerId(null), [])

  return (
    <ToastContext.Provider value={setToast}>
      <PlayerSheetContext.Provider value={setPlayerId}>
        <Header season={SEASON} />
        <main>
          {route === 'ranking' && <Ranking />}
          {route === 'gra' && <Game />}
          {route === 'historia' && <History />}
          {route === 'gracze' && <Players />}
        </main>
        <Tabs current={route} live={!!live} />
        {playerId && <PlayerSheet id={playerId} onClose={closePlayer} />}
        {toast && (
          <div className="toast" role="alert" onClick={() => setToast(null)}>
            {toast}
          </div>
        )}
      </PlayerSheetContext.Provider>
    </ToastContext.Provider>
  )
}
