import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { readFileSync } from 'node:fs'
import { PayloadInvalido } from '../../dominio/fallos.ts'
import { parsearPayload } from './payload.ts'

const outJson = readFileSync(new URL('../../../prototypes/detector/out.json', import.meta.url), 'utf8')
const windowsJson = readFileSync(new URL('../../../prototypes/detector/windows-out.json', import.meta.url), 'utf8')
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
      gpu_pci_id: null,
      biblioteca_steam: null,
    })
  })

  it('reads the PowerShell detector output: no distro, no Linux driver, Vulkan unknown, Steam tools dropped', () => {
    expect(captura(windowsJson)).toEqual({
      capturado_en: new Date('2026-10-15T00:57:49Z'),
      sistema: 'Windows',
      version_sistema: 'Windows 10 Home 22H2 (19045)',
      arquitectura: 'x86_64',
      cpu_modelo: 'Intel(R) Core(TM) i5-4590 CPU @ 3.30GHz',
      gpu_modelo: 'NVIDIA GeForce GTX 750 Ti',
      gpu_pci_id: '10de:1380',
      ram_mb: 8192,
      vram_mb: 2048,
      biblioteca_steam: [
        { app_id: 9999990, nombre: 'Café "Noir": Édition™' },
        { app_id: 271590, nombre: 'Grand Theft Auto V' },
        { app_id: 227300, nombre: 'Euro Truck Simulator 2' },
        { app_id: 292030, nombre: 'The Witcher 3: Wild Hunt' },
      ],
    })
  })

  it('drops the Vulkan and driver keys a Windows payload sends', () => {
    const conVulkan = { ...JSON.parse(windowsJson), soporte_vulkan: 'si', version_vulkan: '1.3.280', controlador: 'nvlddmkm' }
    expect(captura(JSON.stringify(conVulkan))).toEqual(captura(windowsJson))
  })

  it('normalizes the library: tools, bad ids and repeats out, order kept, names trimmed and cut', () => {
    const biblioteca_steam = [
      { app_id: 271590, nombre: '  Grand Theft Auto V ' },
      { app_id: 1493710, nombre: 'Proton Experimental' },
      { app_id: 1628350, nombre: 'Steam Linux Runtime 3.0 (sniper)' },
      { app_id: 228980, nombre: 'Steamworks Common Redistributables' },
      { app_id: 0, nombre: 'Cero' },
      { app_id: -5, nombre: 'Negativo' },
      { app_id: 1.5, nombre: 'Decimal' },
      { app_id: 730, nombre: '   ' },
      { app_id: 271590, nombre: 'GTA V repetido' },
      { app_id: 227300, nombre: 'N'.repeat(130) },
      { app_id: 1245620, nombre: 'ProtonDB Fan Game' },
    ]
    expect(captura(JSON.stringify({ ...prototipo, biblioteca_steam })).biblioteca_steam).toEqual([
      { app_id: 271590, nombre: 'Grand Theft Auto V' },
      { app_id: 227300, nombre: 'N'.repeat(120) },
      { app_id: 1245620, nombre: 'ProtonDB Fan Game' },
    ])
  })

  it('drops control characters and replaces lone surrogates in a name, so jsonb can store it', () => {
    const biblioteca_steam = [{ app_id: 271590, nombre: 'Grand\u0000 Theft\u001f Auto\u007f \udc00V' }]
    expect(captura(JSON.stringify({ ...prototipo, biblioteca_steam })).biblioteca_steam).toEqual([{ app_id: 271590, nombre: 'Grand Theft Auto \ufffdV' }])
  })

  it('keeps the first 1000 games of a larger library and an empty library as empty', () => {
    const biblioteca_steam = Array.from({ length: 1200 }, (_, i) => ({ app_id: i + 1, nombre: `Juego ${i + 1}` }))
    const leida = captura(JSON.stringify({ ...prototipo, biblioteca_steam })).biblioteca_steam
    expect([leida?.length, leida?.[0], leida?.[999]]).toEqual([1000, { app_id: 1, nombre: 'Juego 1' }, { app_id: 1000, nombre: 'Juego 1000' }])
    expect(captura(JSON.stringify({ ...prototipo, biblioteca_steam: [] })).biblioteca_steam).toEqual([])
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
    [' 8086:9A49 ', '8086:9a49', 'Intel GPU [8086:9a49]'],
    ['10de:2504', '10de:2504', 'NVIDIA GPU [10de:2504]'],
    ['1af4:1050', '1af4:1050', 'GPU [1af4:1050]'],
    ['8086', null, 'GPU no detectada'],
    ['10de:2504:00', null, 'GPU no detectada'],
    [42, null, 'GPU no detectada'],
    [null, null, 'GPU no detectada'],
  ])('keeps gpu_pci_id %o as %o (never a failure) and labels a null GPU name from it', (enviado, gpu_pci_id, gpu_modelo) => {
    expect(captura(JSON.stringify({ ...prototipo, gpu_modelo: null, gpu_pci_id: enviado }))).toMatchObject({ gpu_pci_id, gpu_modelo })
  })

  it('accepts the bare base64url fragment and a whole pasted URL with #d=', () => {
    const esperado = captura(outJson)
    expect(captura(base64url(prototipo))).toEqual(esperado)
    expect(captura(`  http://localhost:3000/diagnostico/importar#d=${base64url(prototipo)}\n`)).toEqual(esperado)
  })

  it('names an unnamed CPU (ARM kernels) instead of rejecting the payload', () => {
    expect(captura(JSON.stringify({ ...prototipo, cpu_modelo: null })).cpu_modelo).toBe('CPU no detectada')
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
    [{ sistema: 'Mac' }, 'sistema'],
    [{ biblioteca_steam: [{ app_id: '271590', nombre: 'GTA V' }] }, 'biblioteca_steam.0.app_id'],
    [{ gpu_modelo: 'G'.repeat(161) }, 'gpu_modelo'],
    [{ distribucion: { nombre: 'D'.repeat(81), version: '1' } }, 'distribucion.nombre'],
  ])('a bad field %o is campo_invalido at %s', (cambio, campo) => {
    expect(parsearPayload(JSON.stringify({ ...prototipo, ...cambio }))).toEqual(
      Result.fail(new PayloadInvalido({ motivo: 'campo_invalido', campo })),
    )
  })
})
