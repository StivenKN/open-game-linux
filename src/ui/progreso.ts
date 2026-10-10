// The profile page's progress checklist: which steps this browser marked done. It lives in
// localStorage only and never reaches the server, so a new revision (new key) starts unchecked.
import { Option, Schema } from 'effect'
import { useSyncExternalStore } from 'react'

const Hechos = Schema.fromJsonString(Schema.Array(Schema.Int))

// The storage event fires only in other tabs, so this tab's own writes notify through this set.
const avisos = new Set<() => void>()

const suscribir = (aviso: () => void) => {
  avisos.add(aviso)
  window.addEventListener('storage', aviso)
  return () => {
    avisos.delete(aviso)
    window.removeEventListener('storage', aviso)
  }
}

// localStorage throws when the browser blocks storage; the checklist then stays unchecked.
const leer = (clave: string) => {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

const escribir = (clave: string, hechos: ReadonlyArray<number>) => {
  try {
    if (hechos.length === 0) localStorage.removeItem(clave)
    else localStorage.setItem(clave, JSON.stringify(hechos))
  } catch {
    return
  }
  for (const aviso of avisos) aviso()
}

/**
 * Steps (by `orden`) marked done under `clave`. The server snapshot is null, so SSR and hydration
 * render every step unchecked and the stored marks appear right after, without a mismatch.
 */
export const useProgreso = (clave: string) => {
  const crudo = useSyncExternalStore(suscribir, () => leer(clave), () => null)
  const hechos: ReadonlyArray<number> = Option.getOrElse(Schema.decodeUnknownOption(Hechos)(crudo), () => [])
  return {
    hechos,
    alternar: (orden: number) => escribir(clave, hechos.includes(orden) ? hechos.filter((o) => o !== orden) : [...hechos, orden]),
    reiniciar: () => escribir(clave, []),
  }
}
