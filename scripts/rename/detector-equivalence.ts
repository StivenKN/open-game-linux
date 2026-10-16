import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_LIBRARY_GAMES } from '../../src/domain/library.ts'

// Runs the detector scripts of a base ref and of the working tree on the same fake machines and fails on any byte
// difference in stdout, stderr, exit code, or what they hand to xdg-open, Start-Process and Set-Clipboard.
//   node scripts/rename/detector-equivalence.ts <base-ref>
// PowerShell runs under pwsh, or under docker with the image detector-ps1.test.ts uses.
const base = process.argv[2]
if (base === undefined) throw new Error('usage: node scripts/rename/detector-equivalence.ts <base-ref>')

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const FROZEN_NOW = '2026-10-15T12:00:00Z'
const SERVED_URL = 'http://parity.test'
const IMAGE = 'mcr.microsoft.com/powershell:latest'

type Script = 'sh' | 'ps1'
const scriptPath = (script: Script) => `src/detector/opengame-detect.${script}`
const sides = {
  base: (script: Script) => execFileSync('git', ['show', `${base}:${scriptPath(script)}`], { cwd: root, encoding: 'utf8' }),
  head: (script: Script) => readFileSync(join(root, scriptPath(script)), 'utf8'),
}
type Side = keyof typeof sides

const serve = (source: string) => source.replaceAll('__OPENGAME_URL__', SERVED_URL).replaceAll('__OPENGAME_MAX_JUEGOS__', String(MAX_LIBRARY_GAMES))
const freezePowershellClock = (source: string) => {
  if (source.split('[DateTime]::UtcNow').length !== 2) throw new Error('expected one [DateTime]::UtcNow in the PowerShell detector')
  return source.replace('[DateTime]::UtcNow', '[DateTime]::new(2026, 10, 15, 12, 0, 0, [DateTimeKind]::Utc)')
}

const work = mkdtempSync(join(tmpdir(), 'opengame-detector-equivalence-'))
const run = join(work, 'run')
const handoff = join(run, 'handoff.log')
mkdirSync(run)

const steam = join(work, 'steam')
cpSync(join(root, 'tests/fixtures/steam'), steam, { recursive: true })
for (const format of ['nuevo', 'antiguo']) {
  const vdf = join(steam, format, 'steamapps/libraryfolders.vdf')
  writeFileSync(vdf, readFileSync(vdf, 'utf8').replaceAll('__RAIZ__', steam))
}
const library = (name: string, games: number) => {
  const apps = join(steam, name, 'steamapps')
  mkdirSync(apps, { recursive: true })
  for (let i = 1; i <= games; i++) {
    writeFileSync(join(apps, `appmanifest_${i}.acf`), `"AppState"\n{\n\t"appid"\t\t"${i}"\n\t"name"\t\t"Game ${i} \\"quoted\\" \\\\ back"\n\t"StateFlags"\t\t"${i % 7 === 0 ? 1026 : 4}"\n\t"LastPlayed"\t\t"${i % 3}"\n}\n`)
  }
}
library('vacia', 0)
library('mediana', 30)
library('grande', 2000)

const home = (name: string, links: Readonly<Record<string, string>> = {}) => {
  const dir = join(work, 'home', name)
  mkdirSync(dir, { recursive: true })
  for (const [at, target] of Object.entries(links)) {
    mkdirSync(join(dir, at, '..'), { recursive: true })
    symlinkSync(target, join(dir, at))
  }
  return dir
}
const emptyHome = home('empty')

// Every host command except the hidden ones, so the real GPU tools never leak into a fake machine.
const toolsWithout = (name: string, hidden: ReadonlyArray<string>) => {
  const dir = join(work, 'tools', name)
  mkdirSync(dir, { recursive: true })
  for (const from of (process.env.PATH ?? '').split(':').filter((d) => d !== '' && existsSync(d))) {
    for (const tool of readdirSync(from)) {
      if (!hidden.includes(tool) && !existsSync(join(dir, tool))) symlinkSync(join(from, tool), join(dir, tool))
    }
  }
  return dir
}
const gpuTools = ['vulkaninfo', 'nvidia-smi', 'lspci', 'xdg-open', 'date']
const tools = toolsWithout('gpu-hidden', gpuTools)
const fewTools = toolsWithout('few', [...gpuTools, 'lscpu', 'dpkg-query', 'rpm', 'pacman', 'realpath'])

const stubs = (name: string, bodies: Readonly<Record<string, string>>) => {
  const dir = join(work, 'stubs', name)
  mkdirSync(dir, { recursive: true })
  const all = { date: `[ "$*" = '-u +%Y-%m-%dT%H:%M:%SZ' ] && echo ${FROZEN_NOW} && exit 0\nexit 64`, ...bodies }
  for (const [tool, body] of Object.entries(all)) writeFileSync(join(dir, tool), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return dir
}

type Card = { readonly slot: string; readonly driver: string; readonly pciId: string; readonly vramBytes?: number }
const intel: Card = { slot: '0000:00:02.0', driver: 'i915', pciId: '8086:9A49' }
const nvidia: Card = { slot: '0000:01:00.0', driver: 'nvidia', pciId: '10DE:2520' }
const amd: Card = { slot: '0000:03:00.0', driver: 'amdgpu', pciId: '1002:73FF', vramBytes: 8 * 2 ** 30 }
const unknown: Card = { slot: '0000:05:00.0', driver: 'virtio-pci', pciId: '1AF4:1050' }
const drm = (name: string, cards: ReadonlyArray<Card>) => {
  const dir = join(work, 'drm', name)
  mkdirSync(join(dir, 'card0-eDP-1'), { recursive: true })
  cards.forEach((card, i) => {
    const device = join(dir, `card${i}`, 'device')
    mkdirSync(device, { recursive: true })
    writeFileSync(join(device, 'uevent'), `DRIVER=${card.driver}\nPCI_CLASS=30000\nPCI_ID=${card.pciId}\nPCI_SLOT_NAME=${card.slot}\n`)
    if (card.vramBytes !== undefined) writeFileSync(join(device, 'mem_info_vram_total'), `${card.vramBytes}\n`)
  })
  return dir
}
const vkDevice = (api: string, vendor: string, device: string, type: string) =>
  `GPUX:\n\tapiVersion         = ${api}\n\tvendorID           = ${vendor}\n\tdeviceID           = ${device}\n\tdeviceType         = ${type}\n\n`
const vulkaninfo = (...devices: ReadonlyArray<string>) =>
  `cat <<'END'\nDevices:\n========\n${devices.map((d, i) => d.replace('GPUX', `GPU${i}`)).join('')}END`
const vkIntel = vkDevice('1.3.255', '0x8086', '0x9a49', 'PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU')
const vkNvidia = vkDevice('1.3.277', '0x10de', '0x2520', 'PHYSICAL_DEVICE_TYPE_DISCRETE_GPU')
const vkAmdOld = vkDevice('4206847 (1.3.255)', '0x1002', '0x73ff', 'PHYSICAL_DEVICE_TYPE_DISCRETE_GPU')
const vkLlvmpipe = vkDevice('1.4.318', '0x10005', '0x0000', 'PHYSICAL_DEVICE_TYPE_CPU')
const handoffStub = `printf '%s\\n' "xdg-open $*" >> '${handoff}'`

const plain = stubs('plain', {})
const hybrid = stubs('hybrid', { 'nvidia-smi': "echo '00000000:01:00.0, 6144, NVIDIA GeForce RTX 3060 Laptop GPU'", vulkaninfo: vulkaninfo(vkIntel, vkNvidia, vkLlvmpipe) })
const naSmi = stubs('na-smi', { 'nvidia-smi': "echo '00000000:01:00.0, [N/A], NVIDIA GeForce GT 710'", vulkaninfo: 'echo ERROR_INITIALIZATION_FAILED >&2; exit 1' })
const amdTools = stubs('amd', { vulkaninfo: vulkaninfo(vkIntel, vkAmdOld), lspci: `echo '03:00.0 "VGA" "Advanced Micro Devices, Inc. [AMD/ATI]" "Navi 23 \\"XT\\""'` })
const cpuOnlyVulkan = stubs('cpu-vulkan', { vulkaninfo: vulkaninfo(vkLlvmpipe) })
const desktop = stubs('desktop', { 'xdg-open': handoffStub })
// Debian and Ubuntu default to mawk and Alpine to busybox awk, while many hosts run gawk.
const otherAwks = [
  { name: 'mawk', run: 'mawk' },
  { name: 'busybox awk', run: 'busybox awk' },
].filter((awk) => spawnSync('sh', ['-c', `command -v ${awk.run.split(' ')[0]}`], { stdio: 'ignore' }).status === 0)

type ShCase = {
  readonly name: string
  readonly served?: boolean
  readonly args?: ReadonlyArray<string>
  readonly path?: ReadonlyArray<string>
  readonly tools?: string
  readonly env?: Readonly<Record<string, string>>
}
const drms = {
  hybrid: drm('hybrid', [intel, nvidia]),
  amd: drm('amd', [intel, amd]),
  nouveau: drm('nouveau', [intel, { ...nvidia, driver: 'nouveau' }]),
  nvidiaOnly: drm('nvidia-only', [nvidia]),
  unknown: drm('unknown', [unknown]),
  unknownThenIntel: drm('unknown-then-intel', [unknown, intel]),
  none: drm('none', []),
}
const shCases: ReadonlyArray<ShCase> = [
  { name: 'this machine, raw script' },
  { name: 'this machine, served script', served: true },
  { name: 'this machine with its own GPU tools', served: true, tools: process.env.PATH ?? '' },
  { name: 'served --open dry run', served: true, args: ['--open'], env: { OPENGAME_DRY: '1' } },
  { name: 'raw --open dry run', args: ['--open'], env: { OPENGAME_DRY: '1' } },
  { name: '--open with no display', served: true, args: ['--open'] },
  { name: '--open with a display and xdg-open', served: true, args: ['--open'], path: [desktop], env: { DISPLAY: ':0' } },
  { name: '--open on wayland', served: true, args: ['--open'], path: [desktop], env: { WAYLAND_DISPLAY: 'wayland-0' } },
  { name: 'an unknown argument', served: true, args: ['--bogus'] },
  { name: 'OPENGAME_URL overrides the app address', args: ['--open'], env: { OPENGAME_URL: 'https://other.example', OPENGAME_DRY: '1' } },
  { name: 'hybrid laptop with nvidia-smi and vulkaninfo', path: [hybrid], env: { OPENGAME_DRM: drms.hybrid } },
  { name: 'Intel + AMD, old vulkaninfo, lspci names', path: [amdTools], env: { OPENGAME_DRM: drms.amd } },
  { name: 'nouveau', path: [hybrid], env: { OPENGAME_DRM: drms.nouveau } },
  { name: 'nvidia-smi prints [N/A], vulkaninfo fails', path: [naSmi], env: { OPENGAME_DRM: drms.nvidiaOnly } },
  { name: 'unknown vendor, CPU-only Vulkan', path: [cpuOnlyVulkan], env: { OPENGAME_DRM: drms.unknown } },
  { name: 'unknown vendor loses to Intel', env: { OPENGAME_DRM: drms.unknownThenIntel } },
  { name: 'no DRM cards', env: { OPENGAME_DRM: drms.none } },
  { name: 'missing DRM directory', env: { OPENGAME_DRM: join(work, 'drm', 'absent') } },
  { name: 'missing tools', tools: fewTools, env: { OPENGAME_DRM: drms.amd, OPENGAME_STEAM_DIR: join(steam, 'nuevo') } },
  { name: 'no Steam anywhere', served: true },
  { name: 'Steam, libraryfolders.vdf with two libraries', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'nuevo') } },
  { name: 'Steam, pre-2021 libraryfolders.vdf', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'antiguo') } },
  { name: 'Steam root without libraryfolders.vdf', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'biblioteca2') } },
  { name: 'Steam root with no games', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'vacia') } },
  { name: 'OPENGAME_STEAM_DIR without steamapps', served: true, env: { OPENGAME_STEAM_DIR: join(work, 'home') } },
  {
    name: 'native, Flatpak and Snap roots sharing libraries',
    served: true,
    env: {
      HOME: home('many-roots', {
        '.steam/steam': join(steam, 'nuevo'),
        '.local/share/Steam': join(steam, 'nuevo'),
        '.var/app/com.valvesoftware.Steam/.local/share/Steam': join(steam, 'antiguo'),
        'snap/steam/common/.local/share/Steam': join(steam, 'mediana'),
      }),
      OPENGAME_STEAM_DIR: join(steam, 'biblioteca2'),
    },
  },
  { name: '2000 games, served cap', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'grande') } },
  { name: '2000 games, raw placeholder means no cap', env: { OPENGAME_STEAM_DIR: join(steam, 'grande') } },
  { name: 'OPENGAME_MAX_JUEGOS=5', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'grande'), OPENGAME_MAX_JUEGOS: '5' } },
  { name: 'OPENGAME_MAX_JUEGOS=0', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'mediana'), OPENGAME_MAX_JUEGOS: '0' } },
  { name: 'OPENGAME_MAX_JUEGOS not a number', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'mediana'), OPENGAME_MAX_JUEGOS: '12abc' } },
  { name: 'OPENGAME_MAX_JUEGOS empty', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'mediana'), OPENGAME_MAX_JUEGOS: '' } },
  { name: '2000 games --open dry run is too long for a URL', served: true, args: ['--open'], env: { OPENGAME_STEAM_DIR: join(steam, 'grande'), OPENGAME_MAX_JUEGOS: '0', OPENGAME_DRY: '1' } },
  { name: '30 games --open dry run', served: true, args: ['--open'], env: { OPENGAME_STEAM_DIR: join(steam, 'mediana'), OPENGAME_DRY: '1' } },
  { name: 'OPENGAME_IMPRIMIR is ignored by bash', served: true, env: { OPENGAME_IMPRIMIR: '1', OPENGAME_STEAM_DIR: join(steam, 'nuevo') } },
  ...otherAwks.flatMap((awk): ReadonlyArray<ShCase> => {
    const bin = stubs(awk.name.replace(' ', '-'), { awk: `exec ${awk.run} "$@"` })
    return [
      { name: `${awk.name}: hybrid laptop and two Steam libraries`, served: true, path: [bin, hybrid], env: { OPENGAME_DRM: drms.hybrid, OPENGAME_STEAM_DIR: join(steam, 'nuevo') } },
      { name: `${awk.name}: Intel + AMD, old vulkaninfo, pre-2021 vdf`, served: true, path: [bin, amdTools], env: { OPENGAME_DRM: drms.amd, OPENGAME_STEAM_DIR: join(steam, 'antiguo') } },
      { name: `${awk.name}: 2000 games`, served: true, path: [bin], env: { OPENGAME_STEAM_DIR: join(steam, 'grande') } },
    ]
  }),
]

type Outcome = { readonly status: number | null; readonly stdout: string; readonly stderr: string; readonly handoff: string }

const settle = () => {
  const until = Date.now() + 2000
  while (Date.now() < until && !existsSync(handoff)) spawnSync('sleep', ['0.05'])
  spawnSync('sleep', ['0.1'])
  return existsSync(handoff) ? readFileSync(handoff, 'utf8') : ''
}

const runSh = (side: Side, c: ShCase): Outcome => {
  const script = join(run, 'opengame-detect.sh')
  const source = sides[side]('sh')
  writeFileSync(script, c.served === true ? serve(source) : source)
  rmSync(handoff, { force: true })
  const env = { PATH: [...(c.path ?? []), plain, c.tools ?? tools].join(':'), HOME: emptyHome, LANG: process.env.LANG ?? 'C.UTF-8', ...c.env }
  const r = spawnSync('bash', [script, ...(c.args ?? [])], { cwd: run, env, encoding: 'utf8' })
  const opened = c.env?.DISPLAY !== undefined || c.env?.WAYLAND_DISPLAY !== undefined
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, handoff: opened ? settle() : '' }
}

type Ps1Case = { readonly name: string; readonly served?: boolean; readonly env: Readonly<Record<string, string>> }
const ps1Cases: ReadonlyArray<Ps1Case> = [
  { name: 'hybrid laptop, OPENGAME_IMPRIMIR', served: true, env: { OPENGAME_IMPRIMIR: '1' } },
  { name: 'hybrid laptop, dry run', served: true, env: { OPENGAME_DRY: '1' } },
  { name: 'hybrid laptop opens the import page', served: true, env: {} },
  { name: 'raw script, dry run', env: { OPENGAME_DRY: '1' } },
  { name: 'OPENGAME_URL overrides the app address', served: true, env: { OPENGAME_URL: 'https://other.example', OPENGAME_DRY: '1' } },
  { name: 'Ryzen iGPU listed first', served: true, env: { OPENGAME_TEST_MACHINE: 'ryzen', OPENGAME_IMPRIMIR: '1' } },
  { name: 'basic display adapter, no Steam', served: true, env: { OPENGAME_TEST_MACHINE: 'basic', OPENGAME_IMPRIMIR: '1' } },
  { name: 'no VRAM anywhere: brand picks NVIDIA over AMD and Intel', served: true, env: { OPENGAME_EQUIVALENCE_GPUS: '8086:0412:0,1002:1638:0,10de:1380:0', OPENGAME_IMPRIMIR: '1' } },
  { name: 'unknown vendor loses to Intel', served: true, env: { OPENGAME_EQUIVALENCE_GPUS: '1af4:1050:0,8086:0412:0', OPENGAME_IMPRIMIR: '1' } },
  { name: 'same brand and VRAM: listing order picks', served: true, env: { OPENGAME_EQUIVALENCE_GPUS: '10de:1f91:2048,10de:1380:2048', OPENGAME_IMPRIMIR: '1' } },
  { name: 'VRAM beats brand', served: true, env: { OPENGAME_EQUIVALENCE_GPUS: '10de:1380:1024,1002:1638:4096', OPENGAME_IMPRIMIR: '1' } },
  { name: 'no PROCESSOR_ARCHITECTURE', served: true, env: { PROCESSOR_ARCHITECTURE: '', OPENGAME_IMPRIMIR: '1' } },
  { name: '32-bit shell on 64-bit Windows', served: true, env: { PROCESSOR_ARCHITECTURE: 'x86', PROCESSOR_ARCHITEW6432: 'AMD64', OPENGAME_IMPRIMIR: '1' } },
  { name: 'ARM64', served: true, env: { PROCESSOR_ARCHITECTURE: 'ARM64', OPENGAME_IMPRIMIR: '1' } },
  { name: 'pre-2021 libraryfolders.vdf', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'antiguo'), OPENGAME_IMPRIMIR: '1' } },
  { name: 'Steam root without libraryfolders.vdf', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'biblioteca2'), OPENGAME_IMPRIMIR: '1' } },
  { name: 'Steam root with no games', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'vacia'), OPENGAME_IMPRIMIR: '1' } },
  { name: 'Steam dir without steamapps', served: true, env: { OPENGAME_STEAM_DIR: join(work, 'home'), OPENGAME_IMPRIMIR: '1' } },
  { name: '30 games go to the clipboard', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'mediana') } },
  { name: '2000 games, served cap', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'grande'), OPENGAME_IMPRIMIR: '1' } },
  { name: '2000 games, raw placeholder means no cap', env: { OPENGAME_STEAM_DIR: join(steam, 'grande'), OPENGAME_IMPRIMIR: '1' } },
  { name: 'OPENGAME_MAX_JUEGOS=5', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'grande'), OPENGAME_MAX_JUEGOS: '5', OPENGAME_IMPRIMIR: '1' } },
  { name: 'OPENGAME_MAX_JUEGOS=0', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'mediana'), OPENGAME_MAX_JUEGOS: '0', OPENGAME_IMPRIMIR: '1' } },
  { name: 'OPENGAME_MAX_JUEGOS not a number', served: true, env: { OPENGAME_STEAM_DIR: join(steam, 'mediana'), OPENGAME_MAX_JUEGOS: '12abc', OPENGAME_IMPRIMIR: '1' } },
  { name: 'OPENGAME_IMPRIMIR other than 1 opens', served: true, env: { OPENGAME_IMPRIMIR: 'si' } },
]

const stubsFile = join(root, 'src/detector/fixtures/stubs.ps1')
// The fixture machines never tie on VRAM, so brand and listing order never pick a card. OPENGAME_EQUIVALENCE_GPUS
// lists vendor:device:vramMb cards (0 is unknown VRAM) that replace the fixture's display adapters.
const tieStubs = join(work, 'ties.ps1')
writeFileSync(
  tieStubs,
  String.raw`if ($env:OPENGAME_EQUIVALENCE_GPUS) {
  $equivalenceCim = ${'$'}{function:Get-CimInstance}
  $equivalenceItem = ${'$'}{function:Get-ItemProperty}
  $equivalenceCards = @(foreach ($c in $env:OPENGAME_EQUIVALENCE_GPUS.Split(',')) { $f = $c.Split(':'); [pscustomobject]@{ Ven = $f[0]; Dev = $f[1]; Mb = [int64]$f[2] } })
  function Get-CimInstance([string]$ClassName) {
    if ($ClassName -ne 'Win32_VideoController') { return & $equivalenceCim $ClassName }
    foreach ($c in $equivalenceCards) { [pscustomobject]@{ Name = 'GPU ' + $c.Ven + ':' + $c.Dev; PNPDeviceID = 'PCI\VEN_' + $c.Ven.ToUpper() + '&DEV_' + $c.Dev.ToUpper() + '&SUBSYS_00000000&REV_00\0'; AdapterRAM = [uint32]0 } }
  }
  function Get-ItemProperty([string]$Path) {
    if ($Path -notlike 'HKLM:\SYSTEM\*') { return & $equivalenceItem $Path }
    foreach ($c in $equivalenceCards) {
      $k = [pscustomobject]@{ MatchingDeviceId = 'pcien_' + $c.Ven + '&dev_' + $c.Dev }
      if ($c.Mb -gt 0) { $k | Add-Member -NotePropertyName 'HardwareInformation.qwMemorySize' -NotePropertyValue ($c.Mb * 1MB) }
      $k
    }
  }
}
`,
)
const powershellEnv = (c: Ps1Case) => ({ PROCESSOR_ARCHITECTURE: 'AMD64', OPENGAME_TEST_STEAM: join(steam, 'nuevo'), OPENGAME_TEST_HANDOFF_LOG: handoff, ...c.env })
const powershellArgs = (script: string) => ['-NoProfile', '-NonInteractive', '-Command', `. '${stubsFile}'; . '${tieStubs}'; Invoke-Expression (Get-Content -Raw -LiteralPath '${script}')`]

const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0'], { stdio: 'ignore' }).status === 0
const container = hasPwsh
  ? null
  : execFileSync('docker', ['run', '-d', '--rm', '--user', `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`, '-e', 'HOME=/tmp', '-v', `${root}:${root}:ro`, '-v', `${work}:${work}`, IMAGE, 'sleep', 'infinity'], {
      encoding: 'utf8',
    }).trim()

const runPs1 = (side: Side, c: Ps1Case): Outcome => {
  const script = join(run, 'opengame-detect.ps1')
  const source = freezePowershellClock(sides[side]('ps1'))
  writeFileSync(script, c.served === true ? serve(source) : source)
  rmSync(handoff, { force: true })
  const env = powershellEnv(c)
  const r =
    container === null
      ? spawnSync('pwsh', powershellArgs(script), { cwd: run, env: { PATH: process.env.PATH, HOME: emptyHome, ...env }, encoding: 'utf8' })
      : spawnSync('docker', ['exec', '-w', run, ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), container, 'pwsh', ...powershellArgs(script)], { encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, handoff: existsSync(handoff) ? readFileSync(handoff, 'utf8') : '' }
}

const firstDifference = (a: string, b: string) => {
  const [left, right] = [a.split('\n'), b.split('\n')]
  const line = left.findIndex((l, i) => l !== right[i])
  const at = line === -1 ? left.length : line
  return `line ${at + 1}\n      base: ${JSON.stringify(left[at]?.slice(0, 300))}\n      head: ${JSON.stringify(right[at]?.slice(0, 300))}`
}

let cases = 0
let differences = 0
const compare = <C extends { readonly name: string }>(script: Script, list: ReadonlyArray<C>, runner: (side: Side, c: C) => Outcome) => {
  for (const c of list) {
    const [b, h] = [runner('base', c), runner('head', c)]
    cases++
    const fields = (['status', 'stdout', 'stderr', 'handoff'] as const).filter((f) => b[f] !== h[f])
    if (fields.length === 0) {
      console.log(`ok    ${script}  ${c.name}  (stdout ${b.stdout.length} B, stderr ${b.stderr.length} B, exit ${b.status})`)
      continue
    }
    differences++
    console.log(`DIFF  ${script}  ${c.name}`)
    for (const f of fields) console.log(`    ${f}: ${f === 'status' ? `${b.status} vs ${h.status}` : firstDifference(String(b[f]), String(h[f]))}`)
  }
}

try {
  compare('sh', shCases, runSh)
  compare('ps1', ps1Cases, runPs1)
} finally {
  if (container !== null) spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' })
  rmSync(work, { recursive: true, force: true })
}
console.log(`detector equivalence against ${base}: ${cases} cases, ${differences} differences`)
process.exitCode = differences === 0 ? 0 : 1
