import { describe, expect, it } from '@effect/vitest'
import { ReturnTo } from './-return-to.ts'

describe('ReturnTo (?volver= on /entrar and /registro)', () => {
  it.each([
    ['/diagnostico/importar', '/diagnostico/importar'],
    ['/diagnosticos/12', '/diagnosticos/12'],
    ['/juegos/4/reportar', '/juegos/4/reportar'],
    ['/juegos/4/reportar?perfil=2', '/juegos/4/reportar?perfil=2'],
    ['/reportes/10/solucion?tipoFallo=5', '/reportes/10/solucion?tipoFallo=5'],
    ['/revision?tipo=perfil', '/revision?tipo=perfil'],
    ['/catalogo/nuevo', '/catalogo/nuevo'],
  ])('keeps %s', (input, expected) => {
    expect(ReturnTo({ volver: input })).toEqual({ volver: expected })
  })

  it.each([
    ['/juegos/4/reportar?perfil=2&otro=https://malo.test', '/juegos/4/reportar?perfil=2'],
    ['/juegos/4/reportar?perfil=abc', '/juegos/4/reportar'],
    ['/revision?tipo=todo', '/revision'],
    ['/diagnostico/importar#d=abc', '/diagnostico/importar'],
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
    '/juegos/4',
    '/',
    42,
    undefined,
  ])('drops %o, even after router-core spreads it over the raw query', (input) => {
    expect({ volver: input, ...ReturnTo({ volver: input }) }.volver).toBeUndefined()
  })
})
