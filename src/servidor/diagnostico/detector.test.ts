import { describe, expect, it } from '@effect/vitest'
import { Result, Schema, Struct } from 'effect'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Diagnostico } from '../../dominio/tablas.ts'
import { parsearPayload } from './payload.ts'

const script = fileURLToPath(new URL('../../detector/opengame-detect.sh', import.meta.url))
const ejecutar = (...args: Array<string>) =>
  execFileSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, OPENGAME_DRY: '1', OPENGAME_URL: 'http://ejemplo.test' } }).trim()

// Required keys, unlike the parser: an omitted fact would decode to null there and hide the regression.
const hechos = ['nivel_x86', 'arranque_seguro', 'tpm', 'zram_mb', 'swap_mb'] as const
const Hechos = Diagnostico.mapFields(Struct.pick(hechos))

describe.skipIf(process.platform !== 'linux')('opengame-detect.sh', () => {
  it('prints a payload the server parses, and --open carries it in #d=', () => {
    const json = parsearPayload(ejecutar())
    expect(Result.isSuccess(json)).toBe(true)
    const url = ejecutar('--open')
    expect(url).toMatch(/^http:\/\/ejemplo\.test\/diagnostico\/importar#d=[A-Za-z0-9_-]+$/)
    const desdeUrl = parsearPayload(url)
    const sinHora = Result.map((c: { readonly capturado_en: Date }) => ({ ...c, capturado_en: null }))
    expect(sinHora(desdeUrl)).toEqual(sinHora(json))
  })

  it('sends every machine fact, each in its domain or null, and the parser keeps them', () => {
    const salida = ejecutar()
    const enviados = Schema.decodeUnknownSync(Schema.fromJsonString(Hechos))(salida)
    if (existsSync('/proc/swaps')) expect([typeof enviados.zram_mb, typeof enviados.swap_mb]).toEqual(['number', 'number'])
    if (!existsSync('/sys/firmware/efi')) expect(enviados.arranque_seguro).toBe('bios')
    expect(Result.map(parsearPayload(salida), Struct.pick(hechos))).toEqual(Result.succeed(enviados))
  })
})
