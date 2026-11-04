/** Paleta kolorów graczy (jak w prototypie). Nowy gracz dostaje najrzadziej używany. */
export const PLAYER_COLORS = [
  '#c8f53c',
  '#4f8cff',
  '#ff9f5a',
  '#ff7ab6',
  '#5ee0c8',
  '#b78cff',
  '#f5c542',
  '#7ad3ff',
  '#ff7a7a',
  '#9be36b',
  '#e0a6ff',
  '#ffd27a',
] as const

export function pickColor(used: readonly string[]): string {
  const count = (c: string) => used.filter((u) => u.toLowerCase() === c).length
  return PLAYER_COLORS.reduce((best, c) => (count(c) < count(best) ? c : best))
}
