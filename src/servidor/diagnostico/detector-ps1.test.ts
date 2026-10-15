import { afterAll, beforeAll, describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsearPayload } from './payload.ts'

const raiz = fileURLToPath(new URL('../../../', import.meta.url))
const ps1 = join(raiz, 'src/detector/opengame-detect.ps1')
const sh = join(raiz, 'src/detector/opengame-detect.sh')
const stubs = join(raiz, 'src/detector/pruebas/stubs.ps1')
const fuente = readFileSync(ps1, 'utf8')

// Windows PowerShell 5.1 cannot be run here, so its compatibility rests on this guard plus the pwsh 7 runs below.
describe('opengame-detect.ps1 source', () => {
  it('is ASCII only, so Windows PowerShell 5.1 reads it the same without a BOM', () => {
    expect([...fuente].filter((c) => c > '\x7e' || (c < ' ' && c !== '\n' && c !== '\r'))).toEqual([])
  })

  it('uses no PowerShell 7-only syntax', () => {
    const solo7 = [/\?\?/, /\?\./, /\?\[/, /\s\?\s/, /&&/, /\|\|/, /-AsHashtable/i, /-Parallel/i]
    expect(solo7.filter((patron) => patron.test(fuente))).toEqual([])
  })

  it('has the one __OPENGAME_URL__ placeholder the route replaces', () => {
    expect(fuente.split('__OPENGAME_URL__').length - 1).toBe(1)
  })
})

const IMAGEN = 'mcr.microsoft.com/powershell:latest'
const funciona = (comando: string, args: ReadonlyArray<string>) => spawnSync(comando, args, { stdio: 'ignore' }).status === 0
const motor = funciona('pwsh', ['-NoProfile', '-Command', 'exit 0']) ? 'pwsh' : funciona('docker', ['image', 'inspect', IMAGEN]) ? 'docker' : null

let tmp = ''
const steam = (raizSteam: string) => join(tmp, 'steam', raizSteam)
const registro = () => join(tmp, 'registro.txt')

// The fixture's libraryfolders.vdf files hold absolute paths, so each run gets a copy with them filled in.
// Docker mounts it (and the repo) at the same path, so bash and pwsh read the very same tree.
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'opengame-detector-'))
  cpSync(join(raiz, 'tests/fixtures/steam'), join(tmp, 'steam'), { recursive: true })
  for (const vdf of [steam('nuevo'), steam('antiguo')].map((r) => join(r, 'steamapps/libraryfolders.vdf'))) {
    writeFileSync(vdf, readFileSync(vdf, 'utf8').replaceAll('__RAIZ__', join(tmp, 'steam')))
  }
  const apps = join(tmp, 'grande/steamapps')
  mkdirSync(apps, { recursive: true })
  for (let i = 1; i <= 2000; i++) {
    writeFileSync(join(apps, `appmanifest_${i}.acf`), `"AppState"\n{\n\t"appid"\t\t"${i}"\n\t"name"\t\t"${nombreGrande(i)}"\n\t"StateFlags"\t\t"4"\n\t"LastPlayed"\t\t"${i}"\n}\n`)
  }
})
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

// Runs the real script the way `irm | iex` does, after the stubs that fake the Windows PC.
const powershell = (env: Record<string, string>): string => {
  const variables = { OPENGAME_URL: 'http://ejemplo.test', PROCESSOR_ARCHITECTURE: 'AMD64', OPENGAME_PRUEBA_STEAM: steam('nuevo'), OPENGAME_PRUEBA_REGISTRO: registro(), ...env }
  const args = ['-NoProfile', '-NonInteractive', '-Command', `. '${stubs}'; Invoke-Expression (Get-Content -Raw -LiteralPath '${ps1}')`]
  if (motor === 'pwsh') return execFileSync('pwsh', args, { encoding: 'utf8', env: { ...process.env, ...variables } }).trim()
  const docker = [
    ...['run', '--rm', '--user', `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`, '-e', 'HOME=/tmp'],
    ...['-v', `${raiz}:${raiz}:ro`, '-v', `${tmp}:${tmp}`],
    ...Object.entries(variables).flatMap(([clave, valor]) => ['-e', `${clave}=${valor}`]),
  ]
  return execFileSync('docker', [...docker, IMAGEN, 'pwsh', ...args], { encoding: 'utf8' }).trim()
}
const bash = (env: Record<string, string>, ...args: Array<string>): string =>
  execFileSync('bash', [sh, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, HOME: join(tmp, 'sin-steam'), ...env } }).trim()
const leerRegistro = (): Array<string> => {
  const lineas = readFileSync(registro(), 'utf8').trim().split('\n')
  rmSync(registro())
  return lineas
}
const leer = (json: string): unknown => JSON.parse(json)
const desdeUrl = (url: string): string => Buffer.from(url.slice(url.indexOf('#d=') + 3), 'base64url').toString('utf8')
const captura = (texto: string) => {
  const r = parsearPayload(texto)
  if (Result.isFailure(r)) throw new Error(`expected a capture, got ${JSON.stringify(r.failure)}`)
  return r.success
}

const bibliotecaNuevo = [
  { app_id: 9999990, nombre: 'Café "Noir": Édition™' },
  { app_id: 271590, nombre: 'Grand Theft Auto V' },
  { app_id: 227300, nombre: 'Euro Truck Simulator 2' },
  { app_id: 2805730, nombre: 'Proton 9.0' },
  { app_id: 292030, nombre: 'The Witcher 3: Wild Hunt' },
]
const bibliotecaAntiguo = [
  { app_id: 9999990, nombre: 'Café "Noir": Édition™' },
  { app_id: 1245620, nombre: 'ELDEN RING' },
  { app_id: 227300, nombre: 'Euro Truck Simulator 2' },
  { app_id: 292030, nombre: 'The Witcher 3: Wild Hunt' },
]
const nombreGrande = (i: number) => `Juego de prueba con un nombre bastante largo ${String(i).padStart(4, '0')}`
const bibliotecaGrande = Array.from({ length: 2000 }, (_, k) => ({ app_id: 2000 - k, nombre: nombreGrande(2000 - k) }))

describe.skipIf(motor === null)(`opengame-detect.ps1 under ${motor ?? `pwsh (skipped: no pwsh on PATH and no docker image ${IMAGEN})`}`, { timeout: 60_000 }, () => {
  it('reads a hybrid laptop: the GeForce, its VRAM from the registry, and the Steam games newest first', () => {
    const salida = powershell({ OPENGAME_IMPRIMIR: '1' })
    expect(salida).toMatch(/^[\x20-\x7e]+$/)
    const leida = captura(salida)
    expect(leida).toEqual({
      capturado_en: expect.any(Date),
      sistema: 'Windows',
      version_sistema: 'Windows 10 Home 22H2 (19045)',
      arquitectura: 'x86_64',
      cpu_modelo: 'Intel(R) Core(TM) i5-4590 CPU @ 3.30GHz',
      gpu_modelo: 'NVIDIA GeForce GTX 750 Ti',
      gpu_pci_id: '10de:1380',
      ram_mb: 8192,
      vram_mb: 2048,
      controlador: null,
      version_controlador: null,
      soporte_vulkan: 'desconocido',
      version_vulkan: null,
      biblioteca_steam: bibliotecaNuevo.filter((j) => j.nombre !== 'Proton 9.0'),
    })
    expect({ ...captura(powershell({ OPENGAME_DRY: '1' })), capturado_en: leida.capturado_en }).toEqual(leida)
  })

  it('sends nulls for a GPU without driver and a PC without Steam', () => {
    const env = { OPENGAME_PRUEBA_EQUIPO: 'basico', PROCESSOR_ARCHITECTURE: 'x86', PROCESSOR_ARCHITEW6432: 'AMD64', OPENGAME_IMPRIMIR: '1' }
    expect(captura(powershell(env))).toEqual({
      capturado_en: expect.any(Date),
      sistema: 'Windows',
      version_sistema: 'Windows 11 Pro 23H2 (22631)',
      arquitectura: 'x86_64',
      cpu_modelo: 'Intel(R) Core(TM) i5-4590 CPU @ 3.30GHz',
      gpu_modelo: 'NVIDIA GPU [10de:1380]',
      gpu_pci_id: '10de:1380',
      ram_mb: 8078,
      vram_mb: null,
      controlador: null,
      version_controlador: null,
      soporte_vulkan: 'desconocido',
      version_vulkan: null,
      biblioteca_steam: null,
    })
  })

  it('opens the import page with the payload in #d=', () => {
    powershell({})
    const [abrir, ...resto] = leerRegistro()
    expect(resto).toEqual([])
    expect(abrir).toMatch(/^Start-Process http:\/\/ejemplo\.test\/diagnostico\/importar#d=[A-Za-z0-9_-]+$/)
    expect(leer(desdeUrl(abrir ?? ''))).toMatchObject({ gpu_pci_id: '10de:1380', biblioteca_steam: bibliotecaNuevo })
  })

  it('copies a library too big for a URL to the clipboard and opens the paste box', () => {
    powershell({ OPENGAME_STEAM_DIR: join(tmp, 'grande') })
    const [copiar, abrir, ...resto] = leerRegistro()
    expect([abrir, resto]).toEqual(['Start-Process http://ejemplo.test/diagnostico?pegar=1', []])
    expect(leer((copiar ?? '').replace(/^Set-Clipboard /, ''))).toMatchObject({ biblioteca_steam: bibliotecaGrande })
  })
})

describe.skipIf(motor === null || process.platform !== 'linux')('Steam library: bash and PowerShell detectors agree', { timeout: 60_000 }, () => {
  it.each([
    ['nuevo', bibliotecaNuevo],
    ['antiguo', bibliotecaAntiguo],
  ])('reads the same games from the %s libraryfolders.vdf format', (raizSteam, esperada) => {
    const deBash = leer(bash({ OPENGAME_STEAM_DIR: steam(raizSteam) }))
    const dePowershell = leer(powershell({ OPENGAME_STEAM_DIR: steam(raizSteam), OPENGAME_IMPRIMIR: '1' }))
    expect([deBash, dePowershell]).toMatchObject([{ biblioteca_steam: esperada }, { biblioteca_steam: esperada }])
  })
})

describe.skipIf(process.platform !== 'linux')('opengame-detect.sh with a large Steam library', () => {
  it('prints the JSON instead of a --open URL longer than 100 000 chars', () => {
    const salida = bash({ OPENGAME_STEAM_DIR: join(tmp, 'grande'), OPENGAME_DRY: '1', OPENGAME_URL: 'http://ejemplo.test' }, '--open')
    expect(leer(salida)).toMatchObject({ sistema: 'Linux', biblioteca_steam: bibliotecaGrande })
  })
})
