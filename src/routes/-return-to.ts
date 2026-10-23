import { Schema } from 'effect'
import { ContributionType } from '../domain/review.ts'
import { withoutLang } from '../ui/i18n/lang.ts'

// Where /entrar and /registro send someone after they sign in, as a page path without its language: the
// sign-in page adds its own, so switching language there carries over. The game page is public, but
// "Seguir" sends a guest to sign in and back to it.
export type Destination =
  | '/diagnostico/importar'
  | `/diagnosticos/${number}`
  | `/juegos/${number}`
  | `/juegos/${number}/reportar`
  | `/juegos/${number}/reportar?perfil=${number}`
  | `/reportes/${number}/solucion`
  | `/reportes/${number}/solucion?tipoFallo=${number}`
  | '/revision'
  | `/revision?tipo=${ContributionType}`
  | '/catalogo/nuevo'
  | '/mis-aportes'
  | '/admin/usuarios'
  | '/seguidos'
  | `/catalogo/nuevo?pedido=${number}`
  | '/pedidos'
  | `/pedidos?titulo=${string}`

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
  if (path === '/diagnostico/importar' || path === '/mis-aportes' || path === '/admin/usuarios' || path === '/seguidos') return path
  if (path === '/catalogo/nuevo') {
    const request = id(query('pedido'))
    return request === undefined ? path : `/catalogo/nuevo?pedido=${request}`
  }
  if (path === '/pedidos') {
    const title = query('titulo')?.trim() ?? ''
    return title === '' ? path : `/pedidos?titulo=${encodeURIComponent(title)}`
  }
  if (path === '/revision') {
    const contributionType = query('tipo')
    return isContributionType(contributionType) ? `/revision?tipo=${contributionType}` : path
  }
  const diagnostic = id(/^\/diagnosticos\/([^/]+)$/.exec(path)?.[1])
  if (diagnostic !== undefined) return `/diagnosticos/${diagnostic}`
  const gamePage = id(/^\/juegos\/([^/]+)$/.exec(path)?.[1])
  if (gamePage !== undefined) return `/juegos/${gamePage}`
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
 * validateSearch for /entrar and /registro: `?volver=` keeps only a Destination. The key is always present:
 * router-core spreads the validated search over the raw query, so leaving it out would let the raw,
 * unchecked `volver` through to `useSearch()`.
 */
export const ReturnTo = (search: Record<string, unknown>): { readonly volver?: Destination | undefined } => ({ volver: destination(search.volver) })

/** The `?volver=` that brings someone back to the page at `location`, in whatever language they sign in. */
export const returnHere = (location: { readonly href: string }) => ReturnTo({ volver: withoutLang(location.href) })
