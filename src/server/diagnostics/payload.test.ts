import { describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { readFileSync } from 'node:fs'
import { InvalidPayload } from '../../domain/errors.ts'
import { parsePayload } from './payload.ts'

const outJson = readFileSync(new URL('../../../prototypes/detector/out.json', import.meta.url), 'utf8')
const windowsJson = readFileSync(new URL('../../../prototypes/detector/windows-out.json', import.meta.url), 'utf8')
const prototype = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)))(outJson)
const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

const capture = (text: string) => {
  const r = parsePayload(text)
  if (Result.isFailure(r)) throw new Error(`expected a capture, got ${JSON.stringify(r.failure)}`)
  return r.success
}

describe('parsePayload', () => {
  it('reads the prototype out.json, which predates the machine facts, with every fact null', () => {
    expect(capture(outJson)).toEqual({
      captured_at: new Date('2026-10-10T18:43:52Z'),
      operating_system: 'Linux',
      os_version: '7.0.0-30-generic',
      distribution: { name: 'Ubuntu', version: '24.04' },
      architecture: 'x86_64',
      cpu_model: '11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz',
      gpu_model: 'Intel Corporation TigerLake-LP GT2 [Iris Xe Graphics]',
      ram_mb: 15766,
      vram_mb: null,
      driver: 'i915',
      driver_version: 'Mesa 25.2.8-0ubuntu0.24.04.2',
      vulkan_support: 'desconocido',
      vulkan_version: null,
      x86_level: null,
      secure_boot: null,
      tpm: null,
      zram_mb: null,
      swap_mb: null,
      gpu_pci_id: null,
      steam_library: null,
    })
  })

  it('reads the machine facts a current detector sends', () => {
    const facts = { nivel_x86: 'v3', arranque_seguro: 'bios', tpm: 'no_detectado', zram_mb: 8192, swap_mb: 0 }
    expect(capture(JSON.stringify({ ...prototype, ...facts }))).toMatchObject(facts)
  })

  it('reads the PowerShell detector output: no distro, no Linux driver, Vulkan unknown, Steam tools dropped', () => {
    expect(capture(windowsJson)).toEqual({
      captured_at: new Date('2026-10-15T00:57:49Z'),
      operating_system: 'Windows',
      os_version: 'Windows 10 Home 22H2 (19045)',
      architecture: 'x86_64',
      cpu_model: 'Intel(R) Core(TM) i5-4590 CPU @ 3.30GHz',
      gpu_model: 'NVIDIA GeForce GTX 750 Ti',
      gpu_pci_id: '10de:1380',
      ram_mb: 8192,
      vram_mb: 2048,
      x86_level: null,
      secure_boot: null,
      tpm: null,
      zram_mb: null,
      swap_mb: null,
      steam_library: [
        { app_id: 9999990, nombre: 'Café "Noir": Édition™' },
        { app_id: 271590, nombre: 'Grand Theft Auto V' },
        { app_id: 227300, nombre: 'Euro Truck Simulator 2' },
        { app_id: 292030, nombre: 'The Witcher 3: Wild Hunt' },
      ],
    })
  })

  it('drops the Vulkan and driver keys a Windows payload sends', () => {
    const withVulkan = { ...JSON.parse(windowsJson), soporte_vulkan: 'si', version_vulkan: '1.3.280', controlador: 'nvlddmkm' }
    expect(capture(JSON.stringify(withVulkan))).toEqual(capture(windowsJson))
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
    expect(capture(JSON.stringify({ ...prototype, biblioteca_steam })).steam_library).toEqual([
      { app_id: 271590, nombre: 'Grand Theft Auto V' },
      { app_id: 227300, nombre: 'N'.repeat(120) },
      { app_id: 1245620, nombre: 'ProtonDB Fan Game' },
    ])
  })

  it('drops control characters and replaces lone surrogates in a name, so jsonb can store it', () => {
    const biblioteca_steam = [{ app_id: 271590, nombre: 'Grand\u0000 Theft\u001f Auto\u007f \udc00V' }]
    expect(capture(JSON.stringify({ ...prototype, biblioteca_steam })).steam_library).toEqual([{ app_id: 271590, nombre: 'Grand Theft Auto \ufffdV' }])
  })

  it('keeps the first 1000 games of a larger library and an empty library as empty', () => {
    const biblioteca_steam = Array.from({ length: 1200 }, (_, i) => ({ app_id: i + 1, nombre: `Juego ${i + 1}` }))
    const library = capture(JSON.stringify({ ...prototype, biblioteca_steam })).steam_library
    expect([library?.length, library?.[0], library?.[999]]).toEqual([1000, { app_id: 1, nombre: 'Juego 1' }, { app_id: 1000, nombre: 'Juego 1000' }])
    expect(capture(JSON.stringify({ ...prototype, biblioteca_steam: [] })).steam_library).toEqual([])
  })

  it('keeps the Vulkan version when support is si', () => {
    expect(capture(JSON.stringify({ ...prototype, soporte_vulkan: 'si', version_vulkan: '1.3.275' }))).toMatchObject({
      vulkan_support: 'si',
      vulkan_version: '1.3.275',
    })
  })

  it('maps an Arch build-date VERSION_ID and a missing version to rolling', () => {
    const arch = { ...prototype, distribucion: { nombre: 'Arch Linux', version: '20261004.0.606936' } }
    expect(capture(JSON.stringify(arch))).toMatchObject({ distribution: { name: 'Arch Linux', version: 'rolling' } })
    const withoutVersion = { ...prototype, distribucion: { nombre: 'Arch Linux', version: null } }
    expect(capture(JSON.stringify(withoutVersion))).toMatchObject({ distribution: { version: 'rolling' } })
  })

  it.each([
    [' 8086:9A49 ', '8086:9a49', 'Intel GPU [8086:9a49]'],
    ['10de:2504', '10de:2504', 'NVIDIA GPU [10de:2504]'],
    ['1af4:1050', '1af4:1050', 'GPU [1af4:1050]'],
    ['8086', null, 'GPU no detectada'],
    ['10de:2504:00', null, 'GPU no detectada'],
    [42, null, 'GPU no detectada'],
    [null, null, 'GPU no detectada'],
  ])('keeps gpu_pci_id %o as %o (never a failure) and labels a null GPU name from it', (sent, gpu_pci_id, gpu_modelo) => {
    expect(capture(JSON.stringify({ ...prototype, gpu_modelo: null, gpu_pci_id: sent }))).toMatchObject({ gpu_pci_id, gpu_model: gpu_modelo })
  })

  it('accepts the bare base64url fragment and a whole pasted URL with #d=', () => {
    const expected = capture(outJson)
    expect(capture(base64url(prototype))).toEqual(expected)
    expect(capture(`  http://localhost:3000/diagnostico/importar#d=${base64url(prototype)}\n`)).toEqual(expected)
  })

  it('names an unnamed CPU (ARM kernels) instead of rejecting the payload', () => {
    expect(capture(JSON.stringify({ ...prototype, cpu_modelo: null })).cpu_model).toBe('CPU no detectada')
  })

  it('rejects another version_esquema, telling the user to download the detector again', () => {
    expect(parsePayload(JSON.stringify({ ...prototype, version_esquema: 2 }))).toEqual(
      Result.fail(new InvalidPayload({ reason: 'version_esquema', field: 'version_esquema' })),
    )
  })

  it.each(['', 'hola', '{no es json', '#d=@@@', base64url('solo texto'), '[1,2]'])('%o is ilegible', (text) => {
    expect(parsePayload(text)).toEqual(Result.fail(new InvalidPayload({ reason: 'ilegible', field: null })))
  })

  it.each([
    [{ ram_mb: 'mucha' }, 'ram_mb'],
    [{ cpu_modelo: '   ' }, 'cpu_modelo'],
    [{ distribucion: { nombre: '', version: '24.04' } }, 'distribucion.nombre'],
    [{ sistema: 'Mac' }, 'sistema'],
    [{ biblioteca_steam: [{ app_id: '271590', nombre: 'GTA V' }] }, 'biblioteca_steam.0.app_id'],
    [{ gpu_modelo: 'G'.repeat(161) }, 'gpu_modelo'],
    [{ distribucion: { nombre: 'D'.repeat(81), version: '1' } }, 'distribucion.nombre'],
    [{ nivel_x86: 'v5' }, 'nivel_x86'],
    [{ arranque_seguro: 'on' }, 'arranque_seguro'],
    [{ tpm: '2' }, 'tpm'],
    [{ zram_mb: -1 }, 'zram_mb'],
    [{ swap_mb: 1.5 }, 'swap_mb'],
  ])('a bad field %o is campo_invalido at %s', (override, field) => {
    expect(parsePayload(JSON.stringify({ ...prototype, ...override }))).toEqual(
      Result.fail(new InvalidPayload({ reason: 'campo_invalido', field })),
    )
  })
})
