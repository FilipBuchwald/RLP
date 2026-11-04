import { useLive } from '../queries'
import { Live } from './game/Live'
import { Setup } from './game/Setup'

export function Game() {
  const { data: live, isPending, isError } = useLive()
  if (isPending) return <div className="loading">Wczytuję…</div>
  if (isError && !live)
    return <div className="empty">Brak połączenia z serwerem. Spróbuję ponownie za chwilę.</div>
  return live ? <Live key={live.id} session={live} /> : <Setup />
}
