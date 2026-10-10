import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { readFileSync } from 'node:fs'
import { PayloadInvalido } from '../../dominio/fallos.ts'
import { etiquetaPci, parsearPayload } from './payload.ts'

const outJson = readFileSync(new URL('../../../prototypes/detector/out.json', import.meta.url), 'utf8')
const prototipo = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)))(outJson)
const base64url = (valor: unknown) => Buffer.from(JSON.stringify(valor)).toString('base64url')

const captura = (texto: string) => {
  const r = parsearPayload(texto)
  if (Result.isFailure(r)) throw new Error(`expected a capture, got ${JSON.stringify(r.failure)}`)
  return r.success
}

describe('parsearPayload', () => {
  it('reads the prototype out.json and drops the Vulkan version an ICD reported', () => {
    expect(captura(outJson)).toEqual({
      capturado_en: new Date('2026-10-10T18:43:52Z'),
      sistema: 'Linux',
      version_sistema: '7.0.0-30-generic',
      distribucion: { nombre: 'Ubuntu', version: '24.04' },
      arquitectura: 'x86_64',
      cpu_modelo: '11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz',
      gpu_modelo: 'Intel Corporation TigerLake-LP GT2 [Iris Xe Graphics]',
      ram_mb: 15766,
      vram_mb: null,
      controlador: 'i915',
      version_controlador: 'Mesa 25.2.8-0ubuntu0.24.04.2',
      soporte_vulkan: 'desconocido',
      version_vulkan: null,
    })
  })

  it('keeps the Vulkan version when support is si', () => {
    expect(captura(JSON.stringify({ ...prototipo, soporte_vulkan: 'si', version_vulkan: '1.3.275' }))).toMatchObject({
      soporte_vulkan: 'si',
      version_vulkan: '1.3.275',
    })
  })

  it('maps an Arch build-date VERSION_ID and a missing version to rolling', () => {
    const arch = { ...prototipo, distribucion: { nombre: 'Arch Linux', version: '20261004.0.606936' } }
    expect(captura(JSON.stringify(arch))).toMatchObject({ distribucion: { nombre: 'Arch Linux', version: 'rolling' } })
    const sinVersion = { ...prototipo, distribucion: { nombre: 'Arch Linux', version: null } }
    expect(captura(JSON.stringify(sinVersion))).toMatchObject({ distribucion: { version: 'rolling' } })
  })

  it.each([
    ['8086:9A49', 'Intel GPU [8086:9a49]'],
    ['10de:2504', 'NVIDIA GPU [10de:2504]'],
    [null, 'GPU no detectada'],
  ])('labels a null GPU name from gpu_pci_id %s', (gpu_pci_id, etiqueta) => {
    expect(captura(JSON.stringify({ ...prototipo, gpu_modelo: null, gpu_pci_id })).gpu_modelo).toBe(etiqueta)
  })

  it('accepts the bare base64url fragment and a whole pasted URL with #d=', () => {
    const esperado = captura(outJson)
    expect(captura(base64url(prototipo))).toEqual(esperado)
    expect(captura(`  http://localhost:3000/diagnostico/importar#d=${base64url(prototipo)}\n`)).toEqual(esperado)
  })

  it('rejects another version_esquema, telling the user to download the detector again', () => {
    expect(parsearPayload(JSON.stringify({ ...prototipo, version_esquema: 2 }))).toEqual(
      Result.fail(new PayloadInvalido({ motivo: 'version_esquema', campo: 'version_esquema' })),
    )
  })

  it.each(['', 'hola', '{no es json', '#d=@@@', base64url('solo texto'), '[1,2]'])('%o is ilegible', (texto) => {
    expect(parsearPayload(texto)).toEqual(Result.fail(new PayloadInvalido({ motivo: 'ilegible', campo: null })))
  })

  it.each([
    [{ ram_mb: 'mucha' }, 'ram_mb'],
    [{ cpu_modelo: '   ' }, 'cpu_modelo'],
    [{ distribucion: { nombre: '', version: '24.04' } }, 'distribucion.nombre'],
    [{ sistema: 'Windows' }, 'sistema'],
  ])('a bad field %o is campo_invalido at %s', (cambio, campo) => {
    expect(parsearPayload(JSON.stringify({ ...prototipo, ...cambio }))).toEqual(
      Result.fail(new PayloadInvalido({ motivo: 'campo_invalido', campo })),
    )
  })
})

describe('etiquetaPci', () => {
  it.each([
    ['1002:73df', 'AMD GPU [1002:73df]'],
    ['1af4:1050', 'GPU [1af4:1050]'],
    ['8086', null],
    ['', null],
    [null, null],
  ])('%o -> %o', (pci, etiqueta) => {
    expect(etiquetaPci(pci)).toBe(etiqueta)
  })
})
