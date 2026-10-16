import { describe, expect, it } from '@effect/vitest'
import { Schema } from 'effect'
import { DomainError, IncomparableProfile, InvalidTransition } from './errors.ts'

describe('DomainError on the wire', () => {
  const encode = Schema.encodeSync(DomainError)
  const decode = Schema.decodeUnknownSync(DomainError)

  it.each([
    new IncomparableProfile({ mismatches: [{ aspect: 'arquitectura', expected: 'x86_64', actual: 'aarch64' }] }),
    new InvalidTransition({ from: 'rechazado', to: 'aprobado' }),
  ])('%s encodes to plain data and decodes back to its class', (error) => {
    const encoded = encode(error)
    expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded)
    expect(decode(encoded)).toEqual(error)
    expect(decode(encoded)).toBeInstanceOf(error.constructor)
  })
})
