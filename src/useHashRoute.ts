import { useSyncExternalStore } from 'react'

export const ROUTES = ['ranking', 'gra', 'historia', 'gracze'] as const
export type Route = (typeof ROUTES)[number]

function read(): Route {
  const h = window.location.hash.slice(1)
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : 'ranking'
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/** Prosty routing po #hash (#ranking / #gra / #historia / #gracze), jak w prototypie. */
export function useHashRoute(): Route {
  return useSyncExternalStore(subscribe, read)
}
