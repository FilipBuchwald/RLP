// Formatowanie po polsku.

/** plural(3, 'mecz', 'mecze', 'meczów') → 'mecze' */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  const d = n % 10
  const t = n % 100
  return d >= 2 && d <= 4 && (t < 10 || t >= 20) ? few : many
}

/** '2026-11-03' → 'wt., 3 lis' */
export const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

/** 95 → '1 h 35 min' */
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

export const initial = (name: string) => name.slice(0, 1).toLocaleUpperCase('pl')

export const SEASON = new Date().getFullYear()
