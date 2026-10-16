import { Schema } from 'effect'
import { ContributionType } from '../domain/review.ts'

export type Destination =
  | '/diagnostico/importar'
  | `/diagnosticos/${number}`
  | `/juegos/${number}/reportar`
  | `/juegos/${number}/reportar?perfil=${number}`
  | `/reportes/${number}/solucion`
  | `/reportes/${number}/solucion?tipoFallo=${number}`
  | '/revision'
  | `/revision?tipo=${ContributionType}`
  | '/catalogo/nuevo'

// Resolving against a fixed origin turns `//host/…`, `/\host/…` and absolute URLs into another origin.
const baseOrigin = 'http://opengame.invalid'
const id = (text: string | null | undefined) => {
  const n = typeof text === 'string' && /^[1-9]\d*$/.test(text) ? Number(text) : Number.NaN
  return Number.isSafeInteger(n) ? n : undefined
}
const isContributionType = Schema.is(ContributionType)
// `new URL` in a try, not `URL.parse`, which browsers before 2024 lack.
const parseUrl = (text: string) => {
  try {
    return new URL(text, baseOrigin)
  } catch {
    return null
  }
}

const destination = (text: unknown): Destination | undefined => {
  const url = typeof text === 'string' ? parseUrl(text) : null
  if (url === null || url.origin !== baseOrigin) return undefined
  const path = url.pathname
  const query = (key: string) => url.searchParams.get(key)
  if (path === '/diagnostico/importar' || path === '/catalogo/nuevo') return path
  if (path === '/revision') {
    const contributionType = query('tipo')
    return isContributionType(contributionType) ? `/revision?tipo=${contributionType}` : path
  }
  const diagnostic = id(/^\/diagnosticos\/([^/]+)$/.exec(path)?.[1])
  if (diagnostic !== undefined) return `/diagnosticos/${diagnostic}`
  const game = id(/^\/juegos\/([^/]+)\/reportar$/.exec(path)?.[1])
  if (game !== undefined) {
    const profile = id(query('perfil'))
    return profile === undefined ? `/juegos/${game}/reportar` : `/juegos/${game}/reportar?perfil=${profile}`
  }
  const report = id(/^\/reportes\/([^/]+)\/solucion$/.exec(path)?.[1])
  if (report !== undefined) {
    const failureType = id(query('tipoFallo'))
    return failureType === undefined ? `/reportes/${report}/solucion` : `/reportes/${report}/solucion?tipoFallo=${failureType}`
  }
  return undefined
}

/**
 * validateSearch for /entrar and /registro: `?volver=` keeps only a Destino. The key is always present:
 * router-core spreads the validated search over the raw query, so leaving it out would let the raw,
 * unchecked `volver` through to `useSearch()`.
 */
export const ReturnTo = (search: Record<string, unknown>): { readonly volver?: Destination | undefined } => ({ volver: destination(search.volver) })

export const returnHere = (location: { readonly href: string }) => ReturnTo({ volver: location.href })
