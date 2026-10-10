import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { FalloDominio, PerfilNoComparable, TransicionInvalida } from './fallos.ts'

describe('FalloDominio on the wire', () => {
  const ida = Schema.encodeSync(FalloDominio)
  const vuelta = Schema.decodeUnknownSync(FalloDominio)

  it.each([
    new PerfilNoComparable({ discrepancias: [{ de: 'arquitectura', esperado: 'x86_64', observado: 'aarch64' }] }),
    new TransicionInvalida({ de: 'rechazado', a: 'aprobado' }),
  ])('%s encodes to plain data and decodes back to its class', (fallo) => {
    const codificado = ida(fallo)
    expect(JSON.parse(JSON.stringify(codificado))).toEqual(codificado)
    expect(vuelta(codificado)).toEqual(fallo)
    expect(vuelta(codificado)).toBeInstanceOf(fallo.constructor)
  })
})
