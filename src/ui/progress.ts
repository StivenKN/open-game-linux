import { Option, Schema } from 'effect'
import { useSyncExternalStore } from 'react'

const DoneSteps = Schema.fromJsonString(Schema.Array(Schema.Int))

// The storage event fires only in other tabs, so this tab's own writes notify through this set.
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

// localStorage throws when the browser blocks storage; the checklist then stays unchecked.
const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, done: ReadonlyArray<number>) => {
  try {
    if (done.length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(done))
  } catch {
    return
  }
  for (const listener of listeners) listener()
}

export const useProgress = (key: string) => {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null)
  const done: ReadonlyArray<number> = Option.getOrElse(Schema.decodeUnknownOption(DoneSteps)(raw), () => [])
  return {
    done,
    toggle: (step: number) => write(key, done.includes(step) ? done.filter((o) => o !== step) : [...done, step]),
    reset: () => write(key, []),
  }
}
