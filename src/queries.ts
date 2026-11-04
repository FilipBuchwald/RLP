// Dane z API przez TanStack Query: cache, odpytywanie turnieju na żywo, odświeżanie po zapisach.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { PlayerDto } from '../shared/dto'
import { api } from './api'

export const LIVE_POLL_MS = 5000

export const keys = {
  me: ['me'] as const,
  players: ['players'] as const,
  live: ['live'] as const,
  ranking: (season: number) => ['ranking', season] as const,
  history: (season: number) => ['history', season] as const,
  playerStats: (id: string, season: number) => ['playerStats', id, season] as const,
}

/** Bieżący turniej — odpytywany co 5 s, żeby wszystkie telefony widziały to samo. */
export const useLive = () =>
  useQuery({ queryKey: keys.live, queryFn: api.live, refetchInterval: LIVE_POLL_MS })

/** Czy ten telefon może zapisywać (Access / kod grupy / lokalnie). */
export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.me, staleTime: 60_000 })
export const useCanWrite = () => useMe().data?.canWrite ?? false

export const usePlayers = () => useQuery({ queryKey: keys.players, queryFn: api.players })

export const useRanking = (season: number) =>
  useQuery({ queryKey: keys.ranking(season), queryFn: () => api.ranking(season) })

export const useHistory = (season: number) =>
  useQuery({ queryKey: keys.history(season), queryFn: () => api.history(season) })

export const usePlayerStats = (id: string | null, season: number) =>
  useQuery({
    queryKey: keys.playerStats(id ?? '', season),
    queryFn: () => api.playerStats(id!, season),
    enabled: id != null,
  })

const UNKNOWN: PlayerDto = { id: '?', name: '?', color: '#888888', isGuest: false }

/** Szybki dostęp do gracza po id (imię, kolor). */
export function usePlayerLookup() {
  const { data } = usePlayers()
  const map = useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data])
  return useCallback((id: string) => map.get(id) ?? { ...UNKNOWN, id }, [map])
}

/** Po zakończeniu / odrzuceniu turnieju albo zmianie gracza odśwież wszystko, co od tego zależy. */
export function useInvalidateAll() {
  const qc = useQueryClient()
  return useCallback(() => qc.invalidateQueries(), [qc])
}
