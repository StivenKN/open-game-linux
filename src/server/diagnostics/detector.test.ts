import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { Result, Schema, Struct } from 'effect'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Diagnostico } from '../../domain/tables.ts'
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

type Tarjeta = { readonly slot: string; readonly driver: string; readonly pciId: string; readonly vramBytes?: number }
const intel: Tarjeta = { slot: '0000:00:02.0', driver: 'i915', pciId: '8086:9A49' }
const nvidia: Tarjeta = { slot: '0000:01:00.0', driver: 'nvidia', pciId: '10DE:2520' }
const amd: Tarjeta = { slot: '0000:03:00.0', driver: 'amdgpu', pciId: '1002:73FF', vramBytes: 8 * 2 ** 30 }
const nvidiaSmi = '00000000:01:00.0, 6144, NVIDIA GeForce RTX 3060 Laptop GPU'

const dispositivo = (apiVersion: string, vendorID: string, deviceID: string, deviceType: string, driverName: string) =>
  `\tapiVersion         = ${apiVersion}\n\tdriverVersion      = 25.2.8\n\tvendorID           = ${vendorID}\n\tdeviceID           = ${deviceID}\n` +
  `\tdeviceType         = ${deviceType}\n\tdriverName         = ${driverName}\n\tconformanceVersion = 1.3.6.0\n\n`
const vkIntel = dispositivo('1.3.255', '0x8086', '0x9a49', 'PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU', 'Intel open-source Mesa driver')
const vkNvidia = dispositivo('1.3.277', '0x10de', '0x2520', 'PHYSICAL_DEVICE_TYPE_DISCRETE_GPU', 'NVIDIA')
const vkLlvmpipe = dispositivo('1.4.318', '0x10005', '0x0000', 'PHYSICAL_DEVICE_TYPE_CPU', 'llvmpipe')
// Stub bodies for a `vulkaninfo` on PATH: one that prints a `--summary` listing, one that fails.
const vulkaninfo = (...dispositivos: Array<string>) =>
  "cat <<'FIN'\n==========\nVULKANINFO\n==========\n\nVulkan Instance Version: 1.4.318\n\n\nInstance Layers: count = 1\n--------------------------\n" +
  'VK_LAYER_MESA_device_select Linux device selection layer 1.4.303  version 1\n\nDevices:\n========\n' +
  dispositivos.map((d, i) => `GPU${i}:\n${d}`).join('') +
  'FIN'
const vulkaninfoFalla = 'echo ERROR_INITIALIZATION_FAILED >&2; exit 1'

type Equipo = { readonly tarjetas: ReadonlyArray<Tarjeta>; readonly nvidiaSmi?: string; readonly vulkaninfo?: string }

let tmp = ''
let herramientas = ''
// Every command on PATH except the GPU tools each case stubs, so the real machine's GPU never leaks in.
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'opengame-detect-sh-'))
  herramientas = join(tmp, 'herramientas')
  mkdirSync(herramientas)
  const ocultas = new Set(['vulkaninfo', 'nvidia-smi', 'lspci'])
  for (const dir of (process.env.PATH ?? '').split(':').filter((d) => d !== '' && existsSync(d))) {
    for (const nombre of readdirSync(dir)) {
      if (!ocultas.has(nombre) && !existsSync(join(herramientas, nombre))) symlinkSync(join(dir, nombre), join(herramientas, nombre))
    }
  }
})
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

// Runs the script on a machine described by fake sysfs cards and stubbed GPU tools, then reads its GPU fields.
const detectar = (equipo: Equipo) => {
  const raiz = mkdtempSync(join(tmp, 'equipo-'))
  const drm = join(raiz, 'drm')
  const bin = join(raiz, 'bin')
  mkdirSync(join(drm, 'card0-eDP-1'), { recursive: true })
  mkdirSync(bin)
  equipo.tarjetas.forEach((t, i) => {
    const device = join(drm, `card${i}`, 'device')
    mkdirSync(device, { recursive: true })
    writeFileSync(join(device, 'uevent'), `DRIVER=${t.driver}\nPCI_CLASS=30000\nPCI_ID=${t.pciId}\nPCI_SLOT_NAME=${t.slot}\n`)
    if (t.vramBytes !== undefined) writeFileSync(join(device, 'mem_info_vram_total'), `${t.vramBytes}\n`)
  })
  const stub = (nombre: string, cuerpo: string) => writeFileSync(join(bin, nombre), `#!/bin/sh\n${cuerpo}\n`, { mode: 0o755 })
  if (equipo.nvidiaSmi !== undefined) stub('nvidia-smi', `echo '${equipo.nvidiaSmi}'`)
  if (equipo.vulkaninfo !== undefined) stub('vulkaninfo', equipo.vulkaninfo)
  const salida = execFileSync('bash', [script], {
    encoding: 'utf8',
    env: { PATH: `${bin}:${herramientas}`, HOME: raiz, OPENGAME_DRM: drm },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const captura = Result.getOrThrow(parsearPayload(salida))
  if (captura.sistema !== 'Linux') throw new Error(`the bash detector reported ${captura.sistema}`)
  const { gpu_pci_id, controlador, vram_mb, gpu_modelo, soporte_vulkan, version_vulkan } = captura
  return { gpu_pci_id, controlador, vram_mb, gpu_modelo, soporte_vulkan, version_vulkan }
}

describe.skipIf(process.platform !== 'linux')('opengame-detect.sh GPU', () => {
  it('picks the NVIDIA card on an Intel + NVIDIA laptop, with that card’s Vulkan', () => {
    expect(detectar({ tarjetas: [intel, nvidia], nvidiaSmi, vulkaninfo: vulkaninfo(vkIntel, vkNvidia, vkLlvmpipe) })).toEqual({
      gpu_pci_id: '10de:2520',
      controlador: 'nvidia',
      vram_mb: 6144,
      gpu_modelo: 'NVIDIA GeForce RTX 3060 Laptop GPU',
      soporte_vulkan: 'si',
      version_vulkan: '1.3.277',
    })
  })

  it('picks the AMD card by its VRAM and reads the packed apiVersion of older vulkaninfo', () => {
    const vkIntelViejo = dispositivo('4206830 (1.3.238)', '0x8086', '0x9a49', 'PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU', 'Intel open-source Mesa driver')
    const vkAmd = dispositivo('4206847 (1.3.255)', '0x1002', '0x73ff', 'PHYSICAL_DEVICE_TYPE_DISCRETE_GPU', 'radv')
    expect(detectar({ tarjetas: [intel, amd], vulkaninfo: vulkaninfo(vkIntelViejo, vkAmd) })).toEqual({
      gpu_pci_id: '1002:73ff',
      controlador: 'amdgpu',
      vram_mb: 8192,
      gpu_modelo: 'AMD GPU [1002:73ff]',
      soporte_vulkan: 'si',
      version_vulkan: '1.3.255',
    })
  })

  it('picks the NVIDIA card on nouveau, where neither card reports VRAM, by brand as the Windows detector does', () => {
    const nouveau: Tarjeta = { ...nvidia, driver: 'nouveau' }
    expect(detectar({ tarjetas: [intel, nouveau], vulkaninfo: vulkaninfo(vkIntel, vkNvidia) })).toMatchObject({
      gpu_pci_id: '10de:2520',
      controlador: 'nouveau',
      version_vulkan: '1.3.277',
    })
  })

  it('reads the Intel version when llvmpipe is listed first', () => {
    expect(detectar({ tarjetas: [intel], vulkaninfo: vulkaninfo(vkLlvmpipe, vkIntel) })).toEqual({
      gpu_pci_id: '8086:9a49',
      controlador: 'i915',
      vram_mb: null,
      gpu_modelo: 'Intel GPU [8086:9a49]',
      soporte_vulkan: 'si',
      version_vulkan: '1.3.255',
    })
  })

  it('does not count llvmpipe as Vulkan support', () => {
    expect(detectar({ tarjetas: [intel], vulkaninfo: vulkaninfo(vkLlvmpipe) })).toMatchObject({ soporte_vulkan: 'no', version_vulkan: null })
  })

  it('reads the first GPU device when no card is on PCI, as on Arm boards', () => {
    const vkV3d = dispositivo('1.2.255', '0x14e4', '0x55701c33', 'PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU', 'V3DV Mesa')
    expect(detectar({ tarjetas: [], vulkaninfo: vulkaninfo(vkLlvmpipe, vkV3d) })).toMatchObject({ gpu_pci_id: null, soporte_vulkan: 'si', version_vulkan: '1.2.255' })
  })

  it.each([
    ['is missing', undefined],
    ['fails', vulkaninfoFalla],
  ])('leaves Vulkan unknown when vulkaninfo %s', (_, salida) => {
    expect(detectar({ tarjetas: [intel, nvidia], nvidiaSmi, vulkaninfo: salida })).toMatchObject({
      gpu_pci_id: '10de:2520',
      soporte_vulkan: 'desconocido',
      version_vulkan: null,
    })
  })
})
