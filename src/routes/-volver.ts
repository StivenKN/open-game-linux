// `?volver=` on /entrar and /registro. A page that needs an account sends a guest to sign in with its
// own address; after signing in or up they land back on it. The leading '-' keeps the router from
// treating this file as a route.
import { Schema } from 'effect'
import { TipoAporte } from '../dominio/revision.ts'

/**
 * Where /entrar and /registro send someone back to: the pages that need an account, rebuilt from their
 * ids, so a return address can only name one of our own pages.
 */
export type Destino =
  | '/diagnostico/importar'
  | `/diagnosticos/${number}`
  | `/juegos/${number}/reportar`
  | `/juegos/${number}/reportar?perfil=${number}`
  | `/reportes/${number}/solucion`
  | `/reportes/${number}/solucion?tipoFallo=${number}`
  | '/revision'
  | `/revision?tipo=${TipoAporte}`
  | '/catalogo/nuevo'

// Resolving against a fixed origin turns `//host/…`, `/\host/…` and absolute URLs into another origin.
const origen = 'http://opengame.invalid'
const id = (texto: string | null | undefined) => {
  const n = typeof texto === 'string' && /^[1-9]\d*$/.test(texto) ? Number(texto) : Number.NaN
  return Number.isSafeInteger(n) ? n : undefined
}
const esTipoAporte = Schema.is(TipoAporte)
// `new URL` in a try, not `URL.parse`, which browsers before 2024 lack.
const leerUrl = (texto: string) => {
  try {
    return new URL(texto, origen)
  } catch {
    return null
  }
}

/** Parses an untrusted return address into a Destino, keeping only the query key that page reads. */
const destino = (texto: unknown): Destino | undefined => {
  const url = typeof texto === 'string' ? leerUrl(texto) : null
  if (url === null || url.origin !== origen) return undefined
  const ruta = url.pathname
  const consulta = (clave: string) => url.searchParams.get(clave)
  if (ruta === '/diagnostico/importar' || ruta === '/catalogo/nuevo') return ruta
  if (ruta === '/revision') {
    const tipo = consulta('tipo')
    return esTipoAporte(tipo) ? `/revision?tipo=${tipo}` : ruta
  }
  const diagnostico = id(/^\/diagnosticos\/([^/]+)$/.exec(ruta)?.[1])
  if (diagnostico !== undefined) return `/diagnosticos/${diagnostico}`
  const juego = id(/^\/juegos\/([^/]+)\/reportar$/.exec(ruta)?.[1])
  if (juego !== undefined) {
    const perfil = id(consulta('perfil'))
    return perfil === undefined ? `/juegos/${juego}/reportar` : `/juegos/${juego}/reportar?perfil=${perfil}`
  }
  const reporte = id(/^\/reportes\/([^/]+)\/solucion$/.exec(ruta)?.[1])
  if (reporte !== undefined) {
    const tipoFallo = id(consulta('tipoFallo'))
    return tipoFallo === undefined ? `/reportes/${reporte}/solucion` : `/reportes/${reporte}/solucion?tipoFallo=${tipoFallo}`
  }
  return undefined
}

/**
 * validateSearch for /entrar and /registro: `?volver=` keeps only a Destino. The key is always present:
 * router-core spreads the validated search over the raw query, so leaving it out would let the raw,
 * unchecked `volver` through to `useSearch()`.
 */
export const Volver = (search: Record<string, unknown>): { readonly volver?: Destino | undefined } => ({ volver: destino(search.volver) })

/** The /entrar search a page guard sends, so the guest comes back to this page after signing in. */
export const volverAqui = (location: { readonly href: string }) => Volver({ volver: location.href })
