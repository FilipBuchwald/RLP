import { EnvStatus } from '../components/EnvStatus'

export function Ranking() {
  return (
    <>
      <h2>Klasyfikacja</h2>
      <div className="empty">Brak rozegranych wieczorów.</div>
      <EnvStatus />
    </>
  )
}
