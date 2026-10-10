import { describe, expect, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import { EstadoRevision, bloqueRevisionValido } from './domain.ts'

describe('bloqueRevisionValido', () => {
  it('rejects approval with blank evidence', () => {
    expect(bloqueRevisionValido('aprobado', '   ')).toBe(false)
    expect(bloqueRevisionValido('aprobado', null)).toBe(false)
    expect(bloqueRevisionValido('aprobado', 'log')).toBe(true)
    expect(bloqueRevisionValido('pendiente', null)).toBe(true)
  })

  it.effect('rejects a value outside the estado union', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Schema.decodeUnknownEffect(EstadoRevision)('borrador'))
      expect(error._tag).toBe('SchemaError')
    }),
  )
})
