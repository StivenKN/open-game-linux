import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { Result, Schema, Struct } from 'effect'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Diagnostic } from '../../domain/tables.ts'
import { parsePayload } from './payload.ts'

const script = fileURLToPath(new URL('../../detector/opengame-detect.sh', import.meta.url))
const runScript = (...args: Array<string>) =>
  execFileSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, OPENGAME_DRY: '1', OPENGAME_URL: 'http://ejemplo.test' } }).trim()

// Required keys, unlike the parser: an omitted fact would decode to null there and hide the regression.
const facts = ['nivel_x86', 'arranque_seguro', 'tpm', 'zram_mb', 'swap_mb'] as const
const Facts = Diagnostic.mapFields(Struct.pick(facts))

describe.skipIf(process.platform !== 'linux')('opengame-detect.sh', () => {
  it('prints a payload the server parses, and --open carries it in #d=', () => {
    const json = parsePayload(runScript())
    expect(Result.isSuccess(json)).toBe(true)
    const url = runScript('--open')
    expect(url).toMatch(/^http:\/\/ejemplo\.test\/diagnostico\/importar#d=[A-Za-z0-9_-]+$/)
    const fromUrl = parsePayload(url)
    const withoutTime = Result.map((c: { readonly capturado_en: Date }) => ({ ...c, capturado_en: null }))
    expect(withoutTime(fromUrl)).toEqual(withoutTime(json))
  })

  it('sends every machine fact, each in its domain or null, and the parser keeps them', () => {
    const output = runScript()
    const sent = Schema.decodeUnknownSync(Schema.fromJsonString(Facts))(output)
    if (existsSync('/proc/swaps')) expect([typeof sent.zram_mb, typeof sent.swap_mb]).toEqual(['number', 'number'])
    if (!existsSync('/sys/firmware/efi')) expect(sent.secure_boot).toBe('bios')
    expect(Result.map(parsePayload(output), Struct.pick(facts))).toEqual(Result.succeed(sent))
  })
})

type Card = { readonly slot: string; readonly driver: string; readonly pciId: string; readonly vramBytes?: number }
const intel: Card = { slot: '0000:00:02.0', driver: 'i915', pciId: '8086:9A49' }
const nvidia: Card = { slot: '0000:01:00.0', driver: 'nvidia', pciId: '10DE:2520' }
const amd: Card = { slot: '0000:03:00.0', driver: 'amdgpu', pciId: '1002:73FF', vramBytes: 8 * 2 ** 30 }
const nvidiaSmi = '00000000:01:00.0, 6144, NVIDIA GeForce RTX 3060 Laptop GPU'

const vkDevice = (apiVersion: string, vendorID: string, deviceID: string, deviceType: string, driverName: string) =>
  `\tapiVersion         = ${apiVersion}\n\tdriverVersion      = 25.2.8\n\tvendorID           = ${vendorID}\n\tdeviceID           = ${deviceID}\n` +
  `\tdeviceType         = ${deviceType}\n\tdriverName         = ${driverName}\n\tconformanceVersion = 1.3.6.0\n\n`
const vkIntel = vkDevice('1.3.255', '0x8086', '0x9a49', 'PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU', 'Intel open-source Mesa driver')
const vkNvidia = vkDevice('1.3.277', '0x10de', '0x2520', 'PHYSICAL_DEVICE_TYPE_DISCRETE_GPU', 'NVIDIA')
const vkLlvmpipe = vkDevice('1.4.318', '0x10005', '0x0000', 'PHYSICAL_DEVICE_TYPE_CPU', 'llvmpipe')
// Stub bodies for a `vulkaninfo` on PATH: one that prints a `--summary` listing, one that fails.
const vulkaninfo = (...devices: Array<string>) =>
  "cat <<'FIN'\n==========\nVULKANINFO\n==========\n\nVulkan Instance Version: 1.4.318\n\n\nInstance Layers: count = 1\n--------------------------\n" +
  'VK_LAYER_MESA_device_select Linux device selection layer 1.4.303  version 1\n\nDevices:\n========\n' +
  devices.map((d, i) => `GPU${i}:\n${d}`).join('') +
  'FIN'
const failingVulkaninfo = 'echo ERROR_INITIALIZATION_FAILED >&2; exit 1'

type Machine = { readonly cards: ReadonlyArray<Card>; readonly nvidiaSmi?: string; readonly vulkaninfo?: string }

let tmp = ''
let tools = ''
// Every command on PATH except the GPU tools each case stubs, so the real machine's GPU never leaks in.
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'opengame-detect-sh-'))
  tools = join(tmp, 'herramientas')
  mkdirSync(tools)
  const hidden = new Set(['vulkaninfo', 'nvidia-smi', 'lspci'])
  for (const dir of (process.env.PATH ?? '').split(':').filter((d) => d !== '' && existsSync(d))) {
    for (const name of readdirSync(dir)) {
      if (!hidden.has(name) && !existsSync(join(tools, name))) symlinkSync(join(dir, name), join(tools, name))
    }
  }
})
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

// Runs the script on a machine described by fake sysfs cards and stubbed GPU tools, then reads its GPU fields.
const detect = (machine: Machine) => {
  const root = mkdtempSync(join(tmp, 'equipo-'))
  const drm = join(root, 'drm')
  const bin = join(root, 'bin')
  mkdirSync(join(drm, 'card0-eDP-1'), { recursive: true })
  mkdirSync(bin)
  machine.cards.forEach((t, i) => {
    const device = join(drm, `card${i}`, 'device')
    mkdirSync(device, { recursive: true })
    writeFileSync(join(device, 'uevent'), `DRIVER=${t.driver}\nPCI_CLASS=30000\nPCI_ID=${t.pciId}\nPCI_SLOT_NAME=${t.slot}\n`)
    if (t.vramBytes !== undefined) writeFileSync(join(device, 'mem_info_vram_total'), `${t.vramBytes}\n`)
  })
  const stub = (name: string, body: string) => writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  if (machine.nvidiaSmi !== undefined) stub('nvidia-smi', `echo '${machine.nvidiaSmi}'`)
  if (machine.vulkaninfo !== undefined) stub('vulkaninfo', machine.vulkaninfo)
  const output = execFileSync('bash', [script], {
    encoding: 'utf8',
    env: { PATH: `${bin}:${tools}`, HOME: root, OPENGAME_DRM: drm },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const capture = Result.getOrThrow(parsePayload(output))
  if (capture.operating_system !== 'Linux') throw new Error(`the bash detector reported ${capture.operating_system}`)
  const { gpu_pci_id, driver: controlador, vram_mb, gpu_model: gpu_modelo, vulkan_support: soporte_vulkan, vulkan_version: version_vulkan } = capture
  return { gpu_pci_id, controlador, vram_mb, gpu_modelo, soporte_vulkan, version_vulkan }
}

describe.skipIf(process.platform !== 'linux')('opengame-detect.sh GPU', () => {
  it('picks the NVIDIA card on an Intel + NVIDIA laptop, with that card’s Vulkan', () => {
    expect(detect({ cards: [intel, nvidia], nvidiaSmi, vulkaninfo: vulkaninfo(vkIntel, vkNvidia, vkLlvmpipe) })).toEqual({
      gpu_pci_id: '10de:2520',
      controlador: 'nvidia',
      vram_mb: 6144,
      gpu_modelo: 'NVIDIA GeForce RTX 3060 Laptop GPU',
      soporte_vulkan: 'si',
      version_vulkan: '1.3.277',
    })
  })

  it('picks the AMD card by its VRAM and reads the packed apiVersion of older vulkaninfo', () => {
    const vkIntelOld = vkDevice('4206830 (1.3.238)', '0x8086', '0x9a49', 'PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU', 'Intel open-source Mesa driver')
    const vkAmd = vkDevice('4206847 (1.3.255)', '0x1002', '0x73ff', 'PHYSICAL_DEVICE_TYPE_DISCRETE_GPU', 'radv')
    expect(detect({ cards: [intel, amd], vulkaninfo: vulkaninfo(vkIntelOld, vkAmd) })).toEqual({
      gpu_pci_id: '1002:73ff',
      controlador: 'amdgpu',
      vram_mb: 8192,
      gpu_modelo: 'AMD GPU [1002:73ff]',
      soporte_vulkan: 'si',
      version_vulkan: '1.3.255',
    })
  })

  it('picks the NVIDIA card on nouveau, where neither card reports VRAM, by brand as the Windows detector does', () => {
    const nouveau: Card = { ...nvidia, driver: 'nouveau' }
    expect(detect({ cards: [intel, nouveau], vulkaninfo: vulkaninfo(vkIntel, vkNvidia) })).toMatchObject({
      gpu_pci_id: '10de:2520',
      controlador: 'nouveau',
      version_vulkan: '1.3.277',
    })
  })

  it('reads the Intel version when llvmpipe is listed first', () => {
    expect(detect({ cards: [intel], vulkaninfo: vulkaninfo(vkLlvmpipe, vkIntel) })).toEqual({
      gpu_pci_id: '8086:9a49',
      controlador: 'i915',
      vram_mb: null,
      gpu_modelo: 'Intel GPU [8086:9a49]',
      soporte_vulkan: 'si',
      version_vulkan: '1.3.255',
    })
  })

  it('does not count llvmpipe as Vulkan support', () => {
    expect(detect({ cards: [intel], vulkaninfo: vulkaninfo(vkLlvmpipe) })).toMatchObject({ soporte_vulkan: 'no', version_vulkan: null })
  })

  it('reads the first GPU device when no card is on PCI, as on Arm boards', () => {
    const vkV3d = vkDevice('1.2.255', '0x14e4', '0x55701c33', 'PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU', 'V3DV Mesa')
    expect(detect({ cards: [], vulkaninfo: vulkaninfo(vkLlvmpipe, vkV3d) })).toMatchObject({ gpu_pci_id: null, soporte_vulkan: 'si', version_vulkan: '1.2.255' })
  })

  it.each([
    ['is missing', undefined],
    ['fails', failingVulkaninfo],
  ])('leaves Vulkan unknown when vulkaninfo %s', (_, output) => {
    expect(detect({ cards: [intel, nvidia], nvidiaSmi, vulkaninfo: output })).toMatchObject({
      gpu_pci_id: '10de:2520',
      soporte_vulkan: 'desconocido',
      version_vulkan: null,
    })
  })
})
