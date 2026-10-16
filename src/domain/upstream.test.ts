import { describe, expect, it } from '@effect/vitest'
import { Option, Schema } from 'effect'
import { ProfileId } from './ids.ts'
import {
  SteamAppId,
  type FixInput,
  type ReportInput,
  exportFix,
  type FixExport,
  protonReport,
  protonReportPossible,
  FixNote,
  type Skipped,
  ProtonfixesPr,
} from './upstream.ts'

const witcher: FixInput = {
  launcher: 'Steam',
  external_id: '292030',
  family: 'Proton',
  game: 'The Witcher 3: Wild Hunt',
  profile: { id: ProfileId.make(12), revision: 1 },
  launch_options: 'DXVK_FRAME_RATE=60 gamemoderun %command% --launcher-skip',
  dependencies: [
    { name: 'd3dcompiler_47', package_manager: 'winetricks', required: true },
    { name: 'gamemode', package_manager: 'apt', required: false },
  ],
  demo: false,
}

const witcherFile = `"""Game fix for The Witcher 3: Wild Hunt"""

from protonfixes import util


def main() -> None:
    """Community fix from OpenGame Linux profile #12 r1."""
    util.protontricks('d3dcompiler_47')
    util.set_environment('DXVK_FRAME_RATE', '60')
    util.append_argument('--launcher-skip')
`

/** The module docstring, the util.* lines and the omissions: the parts of a file that vary per profile. */
const parts = (x: FixExport) => {
  if (x._tag !== 'archivo') return x
  const lines = x.content.split('\n')
  return { header: lines[0], lines: lines.slice(7, -1), skipped: x.skipped }
}

describe('exportFix', () => {
  it('Witcher 3 seed profile: exact file, local command, links and omissions', () => {
    expect(exportFix(witcher)).toEqual({
      _tag: 'archivo',
      appid: '292030',
      path: 'gamefixes-steam/292030.py',
      operations: [
        { _tag: 'winetricks', verb: 'd3dcompiler_47' },
        { _tag: 'entorno', name: 'DXVK_FRAME_RATE', value: '60' },
        { _tag: 'argumento', value: '--launcher-skip' },
      ],
      content: witcherFile,
      skipped: [
        { text: 'gamemoderun', reason: 'programa_envoltorio' },
        { text: 'gamemode', reason: 'paquete_del_sistema' },
      ],
      local_command: `mkdir -p ~/.config/protonfixes/localfixes && cat > ~/.config/protonfixes/localfixes/292030.py <<'OPENGAME_FIX'\n${witcherFile}OPENGAME_FIX`,
      view_existing: 'https://github.com/Open-Wine-Components/umu-protonfixes/blob/master/gamefixes-steam/292030.py',
      propose: {
        _tag: 'enlace',
        url:
          'https://github.com/Open-Wine-Components/umu-protonfixes/new/master/gamefixes-steam?filename=292030.py' +
          `&value=${encodeURIComponent(witcherFile)}` +
          '&message=Add%20The%20Witcher%203%3A%20Wild%20Hunt%20(292030)%20fix%20from%20OpenGame%20Linux',
      },
    })
  })

  it('demo content gets the file but no GitHub link', () => {
    const x = exportFix({ ...witcher, demo: true })
    expect(x._tag === 'archivo' && x.propose).toEqual({ _tag: 'datos_de_ejemplo' })
  })

  const cases: ReadonlyArray<readonly [string, Partial<FixInput>, ReturnType<typeof parts>]> = [
    [
      'injection: quotes in the title and a quote in a value',
      { game: `Assassin's "Creed"`, launch_options: "FOO=it's %command% -dx11", dependencies: [] },
      {
        header: `"""Game fix for Assassin's \\"Creed\\""""`,
        lines: ["    util.append_argument('-dx11')"],
        skipped: [{ text: "FOO=it's", reason: 'sintaxis_shell' }],
      },
    ],
    [
      'injection: a trailing backslash in the title and in a token',
      { game: 'Foo\\', launch_options: '%command% -path=C:\\ -windowed', dependencies: [] },
      {
        header: '"""Game fix for Foo\\\\"""',
        lines: ["    util.append_argument('-windowed')"],
        skipped: [{ text: '-path=C:\\', reason: 'sintaxis_shell' }],
      },
    ],
    [
      'injection: """ in the title',
      { game: 'Evil"""; import os', launch_options: '%command% -dx11', dependencies: [] },
      { header: '"""Game fix for Evil\\"\\"\\"; import os"""', lines: ["    util.append_argument('-dx11')"], skipped: [] },
    ],
    [
      'injection: control characters in the title, a value, an argument and a verb',
      {
        game: 'A\nimport os\u0007',
        launch_options: 'FOO=a\u0001b BAR=1 %command% -x\u001b[2J -ok',
        dependencies: [
          { name: 'vcrun\u0007', package_manager: 'winetricks', required: true },
          { name: 'vcrun2022', package_manager: 'winetricks', required: true },
        ],
      },
      {
        header: '"""Game fix for A import os """',
        lines: ["    util.protontricks('vcrun2022')", "    util.set_environment('BAR', '1')", "    util.append_argument('-ok')"],
        skipped: [
          { text: 'FOO=a\u0001b', reason: 'forma_invalida' },
          { text: '-x\u001b[2J', reason: 'forma_invalida' },
          { text: 'vcrun\u0007', reason: 'forma_invalida' },
        ],
      },
    ],
    [
      "injection: '); import os; (' as launch options and as a dependency",
      {
        launch_options: "'); import os; ('",
        dependencies: [{ name: "'); import os; ('", package_manager: 'winetricks', required: true }],
      },
      {
        header: '"""Game fix for The Witcher 3: Wild Hunt"""',
        lines: ["    util.append_argument('import')"],
        skipped: [
          { text: "');", reason: 'sintaxis_shell' },
          { text: 'os;', reason: 'sintaxis_shell' },
          { text: "('", reason: 'sintaxis_shell' },
          { text: "'); import os; ('", reason: 'forma_invalida' },
        ],
      },
    ],
    [
      'deny-list: logging and overlay variables are personal settings',
      {
        launch_options: 'PROTON_LOG=1 PROTON_LOG_DIR=/tmp WINEDEBUG=-all DXVK_HUD=fps DXVK_LOG_LEVEL=none VKD3D_DEBUG=none MANGOHUD=1 MANGOHUD_CONFIG=fps DXVK_ASYNC=1 %command%',
        dependencies: [],
      },
      {
        header: '"""Game fix for The Witcher 3: Wild Hunt"""',
        lines: ["    util.set_environment('DXVK_ASYNC', '1')"],
        skipped: ['PROTON_LOG=1', 'PROTON_LOG_DIR=/tmp', 'WINEDEBUG=-all', 'DXVK_HUD=fps', 'DXVK_LOG_LEVEL=none', 'VKD3D_DEBUG=none', 'MANGOHUD=1', 'MANGOHUD_CONFIG=fps'].map(
          (texto): Skipped => ({ text: texto, reason: 'ajuste_personal' }),
        ),
      },
    ],
    [
      'no %command%: Steam appends everything, so NAME=value is an argument too',
      { launch_options: '-dx11 FOO=1', dependencies: [] },
      {
        header: '"""Game fix for The Witcher 3: Wild Hunt"""',
        lines: ["    util.append_argument('-dx11')", "    util.append_argument('FOO=1')"],
        skipped: [],
      },
    ],
    [
      "a wrapper's flags and a NAME=value after it belong to the wrapper; -pf_ options and a second %command% stay out",
      { launch_options: 'A=1 gamescope -w 1280 B=2 -- %command% -pf_tricks=vcrun2019 %command% -skip', dependencies: [] },
      {
        header: '"""Game fix for The Witcher 3: Wild Hunt"""',
        lines: ["    util.set_environment('A', '1')", "    util.append_argument('-skip')"],
        skipped: [
          ...['gamescope', '-w', '1280', 'B=2', '--'].map((texto): Skipped => ({ text: texto, reason: 'programa_envoltorio' })),
          { text: '-pf_tricks=vcrun2019', reason: 'opcion_protonfixes' },
          { text: '%command%', reason: 'sintaxis_shell' },
        ],
      },
    ],
    [
      'an optional winetricks verb would become mandatory in a fix file',
      { launch_options: '%command% -dx11', dependencies: [{ name: 'vcrun2019', package_manager: 'winetricks', required: false }] },
      {
        header: '"""Game fix for The Witcher 3: Wild Hunt"""',
        lines: ["    util.append_argument('-dx11')"],
        skipped: [{ text: 'vcrun2019', reason: 'dependencia_opcional' }],
      },
    ],
    [
      'GTA V seed profile: nothing translates',
      { launch_options: 'gamemoderun %command%', dependencies: [{ name: 'gamemode', package_manager: 'apt', required: false }] },
      {
        _tag: 'nada_traducible',
        skipped: [
          { text: 'gamemoderun', reason: 'programa_envoltorio' },
          { text: 'gamemode', reason: 'paquete_del_sistema' },
        ],
      },
    ],
    ['no launch options and no dependencies', { launch_options: null, dependencies: [] }, { _tag: 'nada_traducible', skipped: [] }],
    ['a Wine layer never runs protonfixes', { family: 'Wine' }, { _tag: 'no_exportable', reason: 'capa_sin_protonfixes' }],
    ['a native game never runs protonfixes', { family: 'Nativo' }, { _tag: 'no_exportable', reason: 'capa_sin_protonfixes' }],
    ['GOG has no gamefixes-steam file', { launcher: 'GOG', external_id: null }, { _tag: 'no_exportable', reason: 'no_es_steam' }],
    ['a Steam edition without an AppID', { external_id: null }, { _tag: 'no_exportable', reason: 'sin_appid' }],
  ]
  it.each(cases)('%s', (_, changes, expected) => {
    expect(parts(exportFix({ ...witcher, ...changes }))).toEqual(expected)
  })
})

describe('SteamAppId', () => {
  const cases: ReadonlyArray<readonly [string, boolean]> = [
    ['292030', true],
    ['730', true],
    ['4294967295', true],
    ['0', false],
    ['0730', false],
    ['12345678901', false],
    [' 730', false],
    ['730a', false],
    ['', false],
  ]
  it.each(cases)('%j -> %s', (text, valid) => {
    expect(Option.isSome(Schema.decodeUnknownOption(SteamAppId)(text))).toBe(valid)
  })
})

describe('ProtonfixesPr', () => {
  const cases: ReadonlyArray<readonly [string, number | null]> = [
    ['https://github.com/Open-Wine-Components/umu-protonfixes/pull/512', 512],
    ['https://github.com/Open-Wine-Components/umu-protonfixes/pull/512/files', 512],
    ['  https://github.com/Open-Wine-Components/umu-protonfixes/pull/512#issuecomment-1  ', 512],
    ['https://github.com/ValveSoftware/Proton/pull/512', null],
    ['https://github.com/Open-Wine-Components/umu-protonfixes-fork/pull/512', null],
    ['https://github.com/Open-Wine-Components/umu-protonfixes/issues/512', null],
    ['https://github.com/Open-Wine-Components/umu-protonfixes/pull/0', null],
    ['https://github.com/Open-Wine-Components/umu-protonfixes/pull/512x', null],
    ['http://github.com/Open-Wine-Components/umu-protonfixes/pull/512', null],
    ['512', null],
  ]
  it.each(cases)('%j -> %s', (url, pr) => {
    expect(Option.getOrNull(Schema.decodeUnknownOption(ProtonfixesPr)(url))).toBe(pr)
  })

  it('a reviewer note decodes the pasted URL to the PR number', () => {
    expect(
      Schema.decodeUnknownSync(FixNote)({ _tag: 'Aceptado', perfil_id: 12, pr: 'https://github.com/Open-Wine-Components/umu-protonfixes/pull/512/files' }),
    ).toEqual({ _tag: 'Aceptado', perfil_id: 12, pr: 512 })
  })
})

const report3: ReportInput = {
  launcher: 'Steam',
  external_id: '271590',
  family: 'Proton',
  variant: 'Valve',
  version: '9.0-3',
  outcome: 'falla_en_ejecucion',
  game_version: '1.0.3258',
  tested_at: new Date('2026-10-02T19:00:00Z'),
  observations: 'Tras la actualización 1.0.3258 el lanzador corta la partida a los pocos minutos.',
  gpu_model: 'AMD Radeon RX 6600',
  driver: 'amdgpu',
  driver_version: 'Mesa 24.1.7',
  os_version: '6.10.6-200.fc40.x86_64',
  game: 'Grand Theft Auto V',
  distribution: 'Fedora 40',
  failures: ['El Rockstar Games Launcher se queda en «Actualizando» y se cierra tras unos minutos de juego.'],
  demo: false,
}

const body3 = `# Compatibility Report
- Name of the game with compatibility issues: Grand Theft Auto V
- Steam AppID of the game: 271590

## System Information
- GPU: AMD Radeon RX 6600
- Video driver version: Mesa 24.1.7 (amdgpu)
- Kernel version: 6.10.6-200.fc40.x86_64
- Distribution: Fedora 40
- Link to full system information report as [Gist](https://gist.github.com/):
- Proton version: Proton 9.0-3

## I confirm:
- [ ] that I haven't found an existing compatibility report for this game.
- [ ] that I have checked whether there are updates for my system available.

<!-- Please add \`PROTON_LOG=1 %command%\` to the game's launch options and
attach the generated $HOME/steam-$APPID.log to this issue report as a file.
(Proton logs compress well if needed.)-->

## Symptoms <!-- What's the problem? -->
El Rockstar Games Launcher se queda en «Actualizando» y se cierra tras unos minutos de juego.

Tras la actualización 1.0.3258 el lanzador corta la partida a los pocos minutos.

## Reproduction
- Game version: 1.0.3258
- Result: Fails while playing
- Tested on: 2026-10-02
<!-- List the steps that lead to the problem. -->

Prepared with OpenGame Linux.
`

const newIssue = 'https://github.com/ValveSoftware/Proton/issues/new?template=compatibility-report.md&title=Grand%20Theft%20Auto%20V%20(271590)'

describe('protonReport', () => {
  it("report #3 (GTA V, Proton 9.0-3, Ana's Fedora tower): exact issue body and links", () => {
    expect(protonReport(report3)).toEqual({
      _tag: 'informe',
      appid: '271590',
      title: 'Grand Theft Auto V (271590)',
      body: body3,
      log_command: 'PROTON_LOG=1 %command%',
      compress_command: 'gzip -k ~/steam-271590.log',
      search: 'https://github.com/ValveSoftware/Proton/issues?q=271590',
      open: { _tag: 'enlace', url: `${newIssue}&body=${encodeURIComponent(body3)}` },
      body_in_link: true,
    })
  })

  it('past the URL limit the link carries only the title; the body stays whole for the copy box', () => {
    const oversized = protonReport({ ...report3, observations: 'x'.repeat(8000) })
    expect(oversized._tag === 'informe' && { abrir: oversized.open, cuerpo_en_enlace: oversized.body_in_link, cabe: oversized.body.includes('x'.repeat(8000)) }).toEqual({
      abrir: { _tag: 'enlace', url: newIssue },
      cuerpo_en_enlace: false,
      cabe: true,
    })
  })

  it('demo content gets the body but no GitHub link', () => {
    const x = protonReport({ ...report3, demo: true })
    expect(x._tag === 'informe' && x.open).toEqual({ _tag: 'datos_de_ejemplo' })
  })

  const driver: ReadonlyArray<readonly [string | null, string | null, string]> = [
    ['nvidia', '550.107.02', '- Video driver version: 550.107.02 (nvidia)'],
    [null, 'Mesa 24.1.7', '- Video driver version: Mesa 24.1.7'],
    ['amdgpu', null, '- Video driver version: amdgpu'],
    [null, null, '- Video driver version: unknown'],
  ]
  it.each(driver)('driver %s / %s -> %s', (driverName, driver_version, expected) => {
    const x = protonReport({ ...report3, driver: driverName, driver_version })
    expect(x._tag === 'informe' && x.body.split('\n')[6]).toBe(expected)
  })

  it('empty symptoms keep a prompt for the user', () => {
    const x = protonReport({ ...report3, failures: [], observations: '  ' })
    expect(x._tag === 'informe' && x.body.split('\n').slice(20, 22)).toEqual(["## Symptoms <!-- What's the problem? -->", '<!-- Describe what goes wrong. -->'])
  })

  const notApplicable: ReadonlyArray<readonly [string, Partial<ReportInput>, ReturnType<typeof protonReport>]> = [
    ['a working game has nothing to report', { outcome: 'funciona' }, { _tag: 'no_aplica', reason: 'funciona' }],
    ['GE-Proton is not Valve', { variant: 'GE', version: '9-4' }, { _tag: 'no_aplica', reason: 'capa_no_valve' }],
    ['Wine is not Proton', { family: 'Wine', variant: 'estable' }, { _tag: 'no_aplica', reason: 'capa_no_valve' }],
    ['not a Steam edition', { launcher: 'Epic Games Store', external_id: null }, { _tag: 'no_aplica', reason: 'no_es_steam' }],
    ['a Steam edition without an AppID', { external_id: null }, { _tag: 'no_aplica', reason: 'sin_appid' }],
  ]
  it.each(notApplicable)('%s', (_, changes, expected) => {
    expect(protonReport({ ...report3, ...changes })).toEqual(expected)
  })

  it('works with tweaks still qualifies: the tweak is what Valve fixes', () => {
    expect(protonReport({ ...report3, outcome: 'funciona_con_ajustes' })._tag).toBe('informe')
  })
})

describe('protonReportPossible', () => {
  const cases: ReadonlyArray<readonly [Parameters<typeof protonReportPossible>[0], boolean]> = [
    [{ launcher: 'Steam', family: 'Proton', variant: 'Valve', outcome: 'no_inicia' }, true],
    [{ launcher: 'Steam', family: 'Proton', variant: 'Valve', outcome: 'funciona_con_ajustes' }, true],
    [{ launcher: 'Steam', family: 'Proton', variant: 'Valve', outcome: 'funciona' }, false],
    [{ launcher: 'Steam', family: 'Proton', variant: 'GE', outcome: 'no_inicia' }, false],
    [{ launcher: 'GOG', family: 'Proton', variant: 'Valve', outcome: 'no_inicia' }, false],
  ]
  it.each(cases)('%o -> %s', (r, expected) => {
    expect(protonReportPossible(r)).toBe(expected)
  })
})
