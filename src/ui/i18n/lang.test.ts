import { describe, expect, it } from '@effect/vitest'
import { localizedPath, pagePath, preferredLang, unprefixedRedirect, withoutLang } from './lang.ts'

const headers = (cookie?: string, acceptLanguage?: string) => {
  const h = new Headers()
  if (cookie !== undefined) h.set('cookie', cookie)
  if (acceptLanguage !== undefined) h.set('accept-language', acceptLanguage)
  return h
}

describe('preferredLang', () => {
  it.each([
    [headers(), 'es'],
    [headers(undefined, 'en-US,en;q=0.9'), 'en'],
    [headers(undefined, 'es-CO,es;q=0.9,en;q=0.8'), 'es'],
    [headers(undefined, 'fr-FR,fr;q=0.9,en;q=0.5'), 'en'],
    [headers(undefined, 'de, fr;q=0.8'), 'es'],
    [headers(undefined, 'es;q=0.5, en-GB;q=0.8'), 'en'],
    [headers(undefined, 'en;q=0, es'), 'es'],
    [headers('theme=dark; lang=en', 'es-CO'), 'en'],
    [headers('lang=es', 'en-US'), 'es'],
    [headers('lang=fr', 'en-US'), 'en'],
  ])('%#: picks %s', (h, expected) => {
    expect(preferredLang(h)).toBe(expected)
  })
})

describe('unprefixedRedirect', () => {
  const target = (path: string, h = headers()) => unprefixedRedirect(new URL(path, 'http://opengame.test'), h)

  it('sends a page path to the same path and query under the visitor language', () => {
    expect(target('/')).toBe('/es')
    expect(target('/juegos/12?x=1')).toBe('/es/juegos/12?x=1')
    expect(target('/diagnostico/importar', headers(undefined, 'en-US'))).toBe('/en/diagnostico/importar')
    expect(target('/entrar?volver=%2Fjuegos%2F4', headers('lang=en'))).toBe('/en/entrar?volver=%2Fjuegos%2F4')
  })

  it('never carries a fragment, so the browser keeps the one it asked for (#d= from the detector)', () => {
    expect(target('/diagnostico/importar#d=abc')).toBe('/es/diagnostico/importar')
  })

  it.each(['/es', '/en', '/es/juegos/12', '/en/?q=hades', '/api/auth/get-session', '/opengame-detect.sh', '/opengame-detect.ps1', '/juegos/12/badge.svg', '/og.png', '/assets/main-abc.js'])(
    'leaves %s alone',
    (path) => {
      expect(target(path)).toBeNull()
    },
  )
})

describe('page paths', () => {
  it('adds and strips the language', () => {
    expect(localizedPath('en', '/')).toBe('/en')
    expect(localizedPath('en', '/juegos/12')).toBe('/en/juegos/12')
    expect(withoutLang('/en')).toBe('/')
    expect(withoutLang('/es/juegos/12')).toBe('/juegos/12')
    expect(withoutLang('/estado')).toBe('/estado')
  })

  it('reads a matched index route as its URL, without the trailing slash', () => {
    expect(pagePath('/es/')).toBe('/')
    expect(pagePath('/en/diagnostico/')).toBe('/diagnostico')
    expect(pagePath('/es/juegos/12')).toBe('/juegos/12')
  })
})
