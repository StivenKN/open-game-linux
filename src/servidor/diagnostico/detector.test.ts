import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parsearPayload } from './payload.ts'

const script = fileURLToPath(new URL('../../detector/opengame-detect.sh', import.meta.url))
const ejecutar = (...args: Array<string>) =>
  execFileSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, OPENGAME_DRY: '1', OPENGAME_URL: 'http://ejemplo.test' } }).trim()

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
})
