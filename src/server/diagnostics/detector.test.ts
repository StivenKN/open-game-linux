import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Capture } from '../../domain/contributions.ts'
import { Diagnostic } from '../../domain/tables.ts'
import { parsePayload } from './payload.ts'

const script = fileURLToPath(new URL('../../detector/opengame-detect.sh', import.meta.url))
const runScript = (...args: Array<string>) =>
  execFileSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, OPENGAME_DRY: '1', OPENGAME_URL: 'http://ejemplo.test' } }).trim()

// Required keys, unlike the parser: an omitted fact would decode to null there and hide the regression.
const Facts = Schema.Struct({
  nivel_x86: Diagnostic.fields.x86_level,
  arranque_seguro: Diagnostic.fields.secure_boot,
  tpm: Diagnostic.fields.tpm,
  zram_mb: Diagnostic.fields.zram_mb,
  swap_mb: Diagnostic.fields.swap_mb,
})
const factsOf = (c: Capture): typeof Facts.Type => ({ nivel_x86: c.x86_level, arranque_seguro: c.secure_boot, tpm: c.tpm, zram_mb: c.zram_mb, swap_mb: c.swap_mb })

describe.skipIf(process.platform !== 'linux')('opengame-detect.sh', () => {
  it('prints a payload the server parses, and --open carries it in #d=', () => {
    const json = parsePayload(runScript())
    expect(Result.isSuccess(json)).toBe(true)
    const url = runScript('--open')
    expect(url).toMatch(/^http:\/\/ejemplo\.test\/es\/diagnostico\/importar#d=[A-Za-z0-9_-]+$/)
    const fromUrl = parsePayload(url)
    const withoutTime = Result.map((c: { readonly captured_at: Date }) => ({ ...c, captured_at: null }))
    expect(withoutTime(fromUrl)).toEqual(withoutTime(json))
  })

  it('sends every machine fact, each in its domain or null, and the parser keeps them', () => {
    const output = runScript()
    const sent = Schema.decodeUnknownSync(Schema.fromJsonString(Facts))(output)
    if (existsSync('/proc/swaps')) expect([typeof sent.zram_mb, typeof sent.swap_mb]).toEqual(['number', 'number'])
    if (!existsSync('/sys/firmware/efi')) expect(sent.arranque_seguro).toBe('bios')
    expect(Result.map(parsePayload(output), factsOf)).toEqual(Result.succeed(sent))
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

describe.skipIf(process.platform !== 'linux')('opengame-detect.sh Steam Deck', () => {
  // Runs the script with a fake DMI and os-release, then reads the device and the distribution.
  const handheld = (vendor: string, product: string) => {
    const root = mkdtempSync(join(tmp, 'deck-'))
    mkdirSync(join(root, 'dmi'))
    writeFileSync(join(root, 'dmi', 'sys_vendor'), `${vendor}\n`)
    writeFileSync(join(root, 'dmi', 'product_name'), `${product}\n`)
    writeFileSync(join(root, 'os-release'), 'NAME="SteamOS Holo"\nID=steamos\nID_LIKE=arch\nVERSION_ID=3.7.13\nVARIANT_ID=steamdeck\n')
    const output = execFileSync('bash', [script], {
      encoding: 'utf8',
      env: { PATH: tools, HOME: root, OPENGAME_DRM: join(root, 'drm'), OPENGAME_DMI: join(root, 'dmi'), OPENGAME_OS_RELEASE: join(root, 'os-release') },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const c = Result.getOrThrow(parsePayload(output))
    return c.operating_system === 'Linux' ? [c.device, c.distribution.name, c.distribution.version] : null
  }

  it.each([
    ['Valve', 'Jupiter', 'steam_deck_lcd'],
    ['Valve', 'Galileo', 'steam_deck_oled'],
    ['LENOVO', 'Jupiter', null],
  ])('%s %s is %o, and SteamOS is named by its ID', (vendor, product, device) => {
    expect(handheld(vendor, product)).toEqual([device, 'SteamOS', '3.7'])
  })
})

describe.skipIf(process.platform !== 'linux')('opengame-detect.sh in the language of the page that gave the command', () => {
  // No display, so --open cannot start a browser and says so. `/opengame-detect.sh?lang=en` fills in `en` as OPENGAME_LANG does.
  const run = (lang: string | undefined, ...args: Array<string>) =>
    spawnSync('bash', [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, HOME: tmp, OPENGAME_URL: 'http://ejemplo.test', DISPLAY: '', WAYLAND_DISPLAY: '', ...(lang === undefined ? {} : { OPENGAME_LANG: lang }) },
    })

  it.each([
    {
      lang: undefined,
      page: 'es',
      printed: 'Copia el JSON de arriba y pégalo en http://ejemplo.test/es/diagnostico',
      noBrowser: 'No pudimos abrir el navegador. Abre esta dirección:',
      usage: 'Uso: --game <appid>, el número del juego en Steam (por ejemplo --game 1245620)',
    },
    {
      lang: 'en',
      page: 'en',
      printed: 'Copy the JSON above and paste it at http://ejemplo.test/en/diagnostico',
      noBrowser: "We couldn't open your browser. Open this address:",
      usage: "Usage: --game <appid>, the game's number on Steam (for example --game 1245620)",
    },
  ])('with OPENGAME_LANG=$lang, tells the person what to do and opens the pages in $page', ({ lang, page, printed, noBrowser, usage }) => {
    expect(run(lang).stderr).toBe(`${printed}\n`)
    const opened = run(lang, '--open')
    expect(opened.stderr).toBe(`${noBrowser}\n`)
    expect(opened.stdout).toMatch(new RegExp(`^http://ejemplo\\.test/${page}/diagnostico/importar#d=[A-Za-z0-9_-]+\n$`))
    expect(run(lang, '--game', 'gta').stderr).toBe(`${usage}\n`)
  })
})
