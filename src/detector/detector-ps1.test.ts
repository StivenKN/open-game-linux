import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_LIBRARY_GAMES } from '../domain/library.ts'
import { parsePayload } from '../server/diagnostics/payload.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const ps1 = join(root, 'src/detector/opengame-detect.ps1')
const sh = join(root, 'src/detector/opengame-detect.sh')
const stubs = join(root, 'src/detector/fixtures/stubs.ps1')
const source = readFileSync(ps1, 'utf8')

describe('opengame-detect.ps1 source', () => {
  it('is ASCII only, so Windows PowerShell 5.1 reads it the same without a BOM', () => {
    expect([...source].filter((c) => c > '\x7e' || (c < ' ' && c !== '\n' && c !== '\r'))).toEqual([])
  })

  it('uses no PowerShell 7-only syntax', () => {
    const sevenOnly = [/\?\?/, /\?\./, /\?\[/, /\s\?\s/, /&&/, /\|\|/, /-AsHashtable/i, /-Parallel/i]
    expect(sevenOnly.filter((pattern) => pattern.test(source))).toEqual([])
  })

  it.each(['__OPENGAME_URL__', '__OPENGAME_MAX_JUEGOS__'])('has the one %s placeholder the route replaces', (marker) => {
    expect(source.split(marker).length - 1).toBe(1)
  })
})

const IMAGE = 'mcr.microsoft.com/powershell:latest'
const succeeds = (command: string, args: ReadonlyArray<string>) => spawnSync(command, args, { stdio: 'ignore' }).status === 0
const engine = succeeds('pwsh', ['-NoProfile', '-Command', 'exit 0']) ? 'pwsh' : succeeds('docker', ['image', 'inspect', IMAGE]) ? 'docker' : null

let tmp = ''
const steam = (steamRoot: string) => join(tmp, 'steam', steamRoot)
const handoffLog = () => join(tmp, 'handoff.log')

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'opengame-detector-'))
  cpSync(join(root, 'tests/fixtures/steam'), join(tmp, 'steam'), { recursive: true })
  for (const vdf of [steam('nuevo'), steam('antiguo')].map((r) => join(r, 'steamapps/libraryfolders.vdf'))) {
    writeFileSync(vdf, readFileSync(vdf, 'utf8').replaceAll('__RAIZ__', join(tmp, 'steam')))
  }
  library('mediana', 30)
  library('grande', 2000)
})
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const library = (folder: string, count: number) => {
  const apps = join(tmp, folder, 'steamapps')
  mkdirSync(apps, { recursive: true })
  for (let i = 1; i <= count; i++) {
    writeFileSync(join(apps, `appmanifest_${i}.acf`), `"AppState"\n{\n\t"appid"\t\t"${i}"\n\t"name"\t\t"${gameName(i)}"\n\t"StateFlags"\t\t"4"\n\t"LastPlayed"\t\t"${i}"\n}\n`)
  }
}
const expected = (count: number) => Array.from({ length: count }, (_, k) => ({ app_id: count - k, nombre: gameName(count - k) }))

const powershell = (env: Record<string, string>): string => {
  const variables = { OPENGAME_URL: 'http://ejemplo.test', OPENGAME_MAX_JUEGOS: String(MAX_LIBRARY_GAMES), PROCESSOR_ARCHITECTURE: 'AMD64', OPENGAME_TEST_STEAM: steam('nuevo'), OPENGAME_TEST_HANDOFF_LOG: handoffLog(), ...env }
  const args = ['-NoProfile', '-NonInteractive', '-Command', `. '${stubs}'; Invoke-Expression (Get-Content -Raw -LiteralPath '${ps1}')`]
  if (engine === 'pwsh') return execFileSync('pwsh', args, { encoding: 'utf8', env: { ...process.env, ...variables } }).trim()
  const docker = [
    ...['run', '--rm', '--user', `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`, '-e', 'HOME=/tmp'],
    ...['-v', `${root}:${root}:ro`, '-v', `${tmp}:${tmp}`],
    ...Object.entries(variables).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
  ]
  return execFileSync('docker', [...docker, IMAGE, 'pwsh', ...args], { encoding: 'utf8' }).trim()
}
const bash = (env: Record<string, string>, ...args: Array<string>): string =>
  execFileSync('bash', [sh, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, HOME: join(tmp, 'no-steam'), OPENGAME_MAX_JUEGOS: String(MAX_LIBRARY_GAMES), ...env } }).trim()
const readHandoffLog = (): Array<string> => {
  const lines = readFileSync(handoffLog(), 'utf8').trim().split('\n')
  rmSync(handoffLog())
  return lines
}
const parse = (json: string): unknown => JSON.parse(json)
const fromUrl = (url: string): string => Buffer.from(url.slice(url.indexOf('#d=') + 3), 'base64url').toString('utf8')
const capture = (text: string) => {
  const r = parsePayload(text)
  if (Result.isFailure(r)) throw new Error(`expected a capture, got ${JSON.stringify(r.failure)}`)
  return r.success
}

const newFormatLibrary = [
  { app_id: 9999990, nombre: 'Café "Noir": Édition™' },
  { app_id: 271590, nombre: 'Grand Theft Auto V' },
  { app_id: 227300, nombre: 'Euro Truck Simulator 2' },
  { app_id: 2805730, nombre: 'Proton 9.0' },
  { app_id: 292030, nombre: 'The Witcher 3: Wild Hunt' },
]
const oldFormatLibrary = [
  { app_id: 9999990, nombre: 'Café "Noir": Édition™' },
  { app_id: 1245620, nombre: 'ELDEN RING' },
  { app_id: 227300, nombre: 'Euro Truck Simulator 2' },
  { app_id: 292030, nombre: 'The Witcher 3: Wild Hunt' },
]
const gameName = (i: number) => `Juego de prueba con un nombre bastante largo ${String(i).padStart(4, '0')}`

describe.skipIf(engine === null)(`opengame-detect.ps1 under ${engine ?? `pwsh (skipped: no pwsh on PATH and no docker image ${IMAGE})`}`, { timeout: 60_000 }, () => {
  it('reads a hybrid laptop: the GeForce, its VRAM from the registry, and the Steam games newest first', () => {
    const output = powershell({ OPENGAME_IMPRIMIR: '1' })
    expect(output).toMatch(/^[\x20-\x7e]+$/)
    const captured = capture(output)
    expect(captured).toEqual({
      captured_at: expect.any(Date),
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
      steam_library: newFormatLibrary.filter((j) => j.nombre !== 'Proton 9.0'),
    })
    expect({ ...capture(powershell({ OPENGAME_DRY: '1' })), captured_at: captured.captured_at }).toEqual(captured)
  })

  it('picks the GeForce over a Ryzen iGPU listed first: the adapter with the most VRAM runs the games', () => {
    expect(capture(powershell({ OPENGAME_TEST_MACHINE: 'ryzen', OPENGAME_IMPRIMIR: '1' }))).toMatchObject({
      gpu_model: 'NVIDIA GeForce GTX 1650',
      gpu_pci_id: '10de:1f91',
      vram_mb: 4096,
    })
  })

  it('names the architecture from the OS bitness when the shell has no PROCESSOR_ARCHITECTURE', () => {
    expect(capture(powershell({ OPENGAME_IMPRIMIR: '1', PROCESSOR_ARCHITECTURE: '' })).architecture).toBe('x86_64')
  })

  it('sends nulls for a GPU without driver and a PC without Steam', () => {
    const env = { OPENGAME_TEST_MACHINE: 'basic', PROCESSOR_ARCHITECTURE: 'x86', PROCESSOR_ARCHITEW6432: 'AMD64', OPENGAME_IMPRIMIR: '1' }
    expect(capture(powershell(env))).toEqual({
      captured_at: expect.any(Date),
      operating_system: 'Windows',
      os_version: 'Windows 11 Pro 23H2 (22631)',
      architecture: 'x86_64',
      cpu_model: 'Intel(R) Core(TM) i5-4590 CPU @ 3.30GHz',
      gpu_model: 'NVIDIA GPU [10de:1380]',
      gpu_pci_id: '10de:1380',
      ram_mb: 8078,
      vram_mb: null,
      x86_level: null,
      secure_boot: null,
      tpm: null,
      zram_mb: null,
      swap_mb: null,
      steam_library: null,
    })
  })

  it('opens the import page with the payload in #d=', () => {
    powershell({})
    const [opened, ...rest] = readHandoffLog()
    expect(rest).toEqual([])
    expect(opened).toMatch(/^Start-Process http:\/\/ejemplo\.test\/diagnostico\/importar#d=[A-Za-z0-9_-]+$/)
    expect(parse(fromUrl(opened ?? ''))).toMatchObject({ gpu_pci_id: '10de:1380', biblioteca_steam: newFormatLibrary })
  })

  it('copies a 30-game library, too big for a URL, to the clipboard and opens the paste box', () => {
    powershell({ OPENGAME_STEAM_DIR: join(tmp, 'mediana') })
    const [copied, opened, ...rest] = readHandoffLog()
    expect([opened, rest]).toEqual(['Start-Process http://ejemplo.test/diagnostico?pegar=1', []])
    expect(parse((copied ?? '').replace(/^Set-Clipboard /, ''))).toMatchObject({ biblioteca_steam: expected(30) })
  })

  it('sends at most MAX_LIBRARY_GAMES games, the most recently played', () => {
    const output = powershell({ OPENGAME_STEAM_DIR: join(tmp, 'grande'), OPENGAME_IMPRIMIR: '1' })
    expect(parse(output)).toMatchObject({ biblioteca_steam: expected(2000).slice(0, MAX_LIBRARY_GAMES) })
  })
})

describe.skipIf(engine === null || process.platform !== 'linux')('Steam library: bash and PowerShell detectors agree', { timeout: 60_000 }, () => {
  it.each([
    ['nuevo', newFormatLibrary],
    ['antiguo', oldFormatLibrary],
  ])('reads the same games from the %s libraryfolders.vdf format', (steamRoot, expected) => {
    const fromBash = parse(bash({ OPENGAME_STEAM_DIR: steam(steamRoot) }))
    const fromPowershell = parse(powershell({ OPENGAME_STEAM_DIR: steam(steamRoot), OPENGAME_IMPRIMIR: '1' }))
    expect([fromBash, fromPowershell]).toMatchObject([{ biblioteca_steam: expected }, { biblioteca_steam: expected }])
  })
})

describe.skipIf(process.platform !== 'linux')('opengame-detect.sh with a large Steam library', () => {
  it('prints the JSON, capped at MAX_LIBRARY_GAMES games, instead of a --open URL longer than 100 000 chars', () => {
    const output = bash({ OPENGAME_STEAM_DIR: join(tmp, 'grande'), OPENGAME_DRY: '1', OPENGAME_URL: 'http://ejemplo.test' }, '--open')
    expect(parse(output)).toMatchObject({ sistema: 'Linux', biblioteca_steam: expected(2000).slice(0, MAX_LIBRARY_GAMES) })
  })
})
