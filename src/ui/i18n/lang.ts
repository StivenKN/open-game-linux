// The interface languages, and how a request picks one. Every page lives under /es or /en (`routes/$lang`);
// a request for an unprefixed page path (an old link, the detector's /diagnostico/importar) gets a redirect
// from the start middleware to the same path and query in the visitor's language.
import { Schema } from 'effect'

export const Lang = Schema.Literals(['es', 'en'])
export type Lang = typeof Lang.Type
export const isLang = Schema.is(Lang)

/** The cookie the language switcher sets. It outranks the browser's Accept-Language. */
export const langCookie = 'lang'

const cookieLang = (cookie: string | null) =>
  (cookie ?? '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([name]) => name === langCookie)?.[1]

// `en-GB;q=0.8` ranks `en` at 0.8. Array sort is stable, so equal weights keep the header's order.
const browserLangs = (acceptLanguage: string | null) =>
  (acceptLanguage ?? '')
    .split(',')
    .map((range) => {
      const [tag = '', ...params] = range.trim().toLowerCase().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      return { lang: tag.split('-')[0], weight: q === undefined ? 1 : Number(q.slice(2)) }
    })
    .filter((r) => r.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((r) => r.lang)

/** The visitor's language: the switcher's cookie, else the first of ours their browser asks for, else Spanish. */
export const preferredLang = (headers: Headers): Lang => {
  const chosen = cookieLang(headers.get('cookie'))
  return isLang(chosen) ? chosen : (browserLangs(headers.get('accept-language')).find(isLang) ?? 'es')
}

/** A page path in `lang`. The catalog is `/es`, without the index route's trailing slash. */
export const localizedPath = (lang: Lang, path: string) => (path === '/' ? `/${lang}` : `/${lang}${path}`)

/** The page path without its language: `/en/juegos/12` is `/juegos/12`, and `/en` is `/`. */
export const withoutLang = (pathname: string) => pathname.replace(/^\/(es|en)(?=\/|$)/, '') || '/'

/** A matched route's page path, as its URL reads: no language, and no index route's trailing slash (`/es/guias/` is `/guias`). */
export const pagePath = (matchPathname: string) => withoutLang(matchPathname).replace(/(.)\/$/, '$1')

/**
 * Where a GET for `url` redirects, or null when it stays. A path that already starts with a language stays,
 * and so do better-auth's /api/ and every file (a last segment with a dot): the detector scripts and the
 * images. The Location carries no fragment, so the browser keeps the request's own (`#d=` from the detector).
 */
export const unprefixedRedirect = (url: URL, headers: Headers): string | null => {
  const [, first = ''] = url.pathname.split('/')
  if (isLang(first) || first === 'api' || /\.[^/]*$/.test(url.pathname)) return null
  return localizedPath(preferredLang(headers), url.pathname) + url.search
}

/**
 * The images (badge.svg, og.png) live outside the language prefix, so their words come from `?lang=`:
 * `imageQuery` writes it for a page's language, `imageLang` reads it, Spanish by default.
 */
export const imageQuery = (lang: Lang) => (lang === 'es' ? '' : `?lang=${lang}`)
export const imageLang = (url: URL): Lang => {
  const lang = url.searchParams.get('lang')
  return isLang(lang) ? lang : 'es'
}
