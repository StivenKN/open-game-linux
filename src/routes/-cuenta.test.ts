import { describe, expect, it } from '@effect/vitest'
import { Volver } from './-cuenta.ts'

describe('Volver (?volver= on /entrar and /registro)', () => {
  it('keeps a known destination', () => {
    expect(Volver({ volver: '/diagnostico/importar' })).toEqual({ volver: '/diagnostico/importar' })
  })

  it.each(['https://malo.test/', '//malo.test/diagnostico/importar', '/diagnostico/importar/../../entrar', 42, undefined])('drops %o', (volver) => {
    expect(Volver({ volver })).toEqual({})
  })
})
