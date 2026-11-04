import { initial } from '../format'
import { usePlayerLookup } from '../queries'

/** Kółko z inicjałem w kolorze gracza. `big` = awatar (podium, profil). */
export function Dot({ id, big }: { id: string; big?: boolean }) {
  const p = usePlayerLookup()(id)
  return (
    <div className={big ? 'avatar' : 'dot'} style={{ background: p.color }}>
      {initial(p.name)}
    </div>
  )
}
