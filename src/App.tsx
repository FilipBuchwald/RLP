import { Header } from './components/Header'
import { Tabs } from './components/Tabs'
import { Game } from './pages/Game'
import { History } from './pages/History'
import { Ranking } from './pages/Ranking'
import { useHashRoute } from './useHashRoute'

const SEASON = new Date().getFullYear()

export default function App() {
  const route = useHashRoute()

  return (
    <>
      <Header season={SEASON} />
      <main>
        {route === 'ranking' && <Ranking />}
        {route === 'gra' && <Game />}
        {route === 'historia' && <History />}
      </main>
      {/* `live` podepniemy w Etapie 4 pod GET /api/sessions/live */}
      <Tabs current={route} live={false} />
    </>
  )
}
