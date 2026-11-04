import { useEffect, useState } from 'react'

/** useState zapamiętywany w sessionStorage (przetrwa przełączanie zakładek i odświeżenie). */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw ? ({ ...initial, ...JSON.parse(raw) } as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // tryb prywatny / brak miejsca — trudno
    }
  }, [key, value])
  return [value, setValue] as const
}
