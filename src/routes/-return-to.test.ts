import { describe, expect, it } from '@effect/vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ReturnTo, returnHere } from './-return-to.ts'

// Every page that sends a guest to sign in through returnHere, as a URL its route id names:
// `/$lang/guias/$guideId_/editar` is `/guias/7/editar`.
const pagesDir = join(import.meta.dirname, '$lang')
const guardedPages = readdirSync(pagesDir, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => readFileSync(join(pagesDir, f), 'utf8'))
  .filter((code) => code.includes('returnHere('))
  .map((code) => /createFileRoute\('\/\$lang([^']*)'\)/.exec(code)?.[1] ?? '')
  .map((id) => id.replace(/\$\w+/g, '7').replace(/_(?=\/|$)/g, '').replace(/(.)\/$/, '$1') || '/')

describe('ReturnTo (?volver= on /entrar and /registro)', () => {
  it.each([
    ['/diagnostico/importar', '/diagnostico/importar'],
    ['/diagnosticos/12', '/diagnosticos/12'],
    ['/juegos/4/reportar', '/juegos/4/reportar'],
    ['/juegos/4/reportar?perfil=2', '/juegos/4/reportar?perfil=2'],
    ['/reportes/10/solucion?tipoFallo=5', '/reportes/10/solucion?tipoFallo=5'],
    ['/revision?tipo=perfil', '/revision?tipo=perfil'],
    ['/catalogo/nuevo', '/catalogo/nuevo'],
    ['/mis-aportes', '/mis-aportes'],
    ['/admin/usuarios', '/admin/usuarios'],
    ['/juegos/4', '/juegos/4'],
    ['/seguidos', '/seguidos'],
    ['/catalogo/nuevo?pedido=3', '/catalogo/nuevo?pedido=3'],
    ['/pedidos', '/pedidos'],
    ['/pedidos?titulo=Hollow%20Knight', '/pedidos?titulo=Hollow%20Knight'],
    ['/juegos/4/perfiles/nuevo?desde=2', '/juegos/4/perfiles/nuevo?desde=2'],
  ])('keeps %s', (input, expected) => {
    expect(ReturnTo({ volver: input })).toEqual({ volver: expected })
  })

  it.each([
    ['/juegos/4/reportar?perfil=2&otro=https://malo.test', '/juegos/4/reportar?perfil=2'],
    ['/juegos/4/reportar?perfil=abc', '/juegos/4/reportar'],
    ['/revision?tipo=todo', '/revision'],
    ['/diagnostico/importar#d=abc', '/diagnostico/importar'],
    ['/admin/usuarios?q=ana', '/admin/usuarios'],
    ['/catalogo/nuevo?pedido=x', '/catalogo/nuevo'],
    ['/pedidos?titulo=%20%20&otro=1', '/pedidos'],
    ['/pedidos?titulo=a%26b', '/pedidos?titulo=a%26b'],
    ['/juegos/4/perfiles/nuevo?desde=x', '/juegos/4/perfiles/nuevo'],
  ])('rebuilds %s from its ids as %s', (input, expected) => {
    expect(ReturnTo({ volver: input })).toEqual({ volver: expected })
  })

  it.each([
    'https://malo.test/juegos/4/reportar',
    '//malo.test/juegos/4/reportar',
    '/\\malo.test/juegos/4/reportar',
    'javascript:alert(1)',
    '/juegos/4/reportar/../../entrar',
    '/juegos/01/reportar',
    '/diagnosticos/99999999999999999999999',
    '/juegos/4/',
    '/',
    42,
    undefined,
  ])('drops %o, even after router-core spreads it over the raw query', (input) => {
    expect({ volver: input, ...ReturnTo({ volver: input }) }.volver).toBeUndefined()
  })
})

describe('returnHere', () => {
  it('brings a guest back to every page that sends them to sign in', () => {
    expect(guardedPages).toContain('/juegos/7/reportar')
    expect(guardedPages.filter((page) => returnHere({ href: `/en${page}` }).volver !== page)).toEqual([])
  })

  it('keeps the page without its language, so sign-in brings it back in its own', () => {
    expect(returnHere({ href: '/en/juegos/4/reportar?perfil=2' })).toEqual({ volver: '/juegos/4/reportar?perfil=2' })
    expect(returnHere({ href: '/es/seguidos' })).toEqual({ volver: '/seguidos' })
  })
})
