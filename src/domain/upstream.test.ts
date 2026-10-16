import { describe, expect, it } from '@effect/vitest'
import { Option, Schema } from 'effect'
import { PerfilId } from './ids.ts'
import {
  AppIdSteam,
  type EntradaFix,
  type EntradaInforme,
  exportarFix,
  type ExportacionFix,
  informeProton,
  informeProtonPosible,
  NotaArreglo,
  type Omitido,
  PrProtonfixes,
} from './upstream.ts'

const witcher: EntradaFix = {
  lanzador: 'Steam',
  identificador_externo: '292030',
  familia: 'Proton',
  juego: 'The Witcher 3: Wild Hunt',
  perfil: { id: PerfilId.make(12), revision: 1 },
  parametros_lanzamiento: 'DXVK_FRAME_RATE=60 gamemoderun %command% --launcher-skip',
  dependencias: [
    { nombre: 'd3dcompiler_47', gestor: 'winetricks', obligatoria: true },
    { nombre: 'gamemode', gestor: 'apt', obligatoria: false },
  ],
  ejemplo: false,
}

const archivoWitcher = `"""Game fix for The Witcher 3: Wild Hunt"""

from protonfixes import util


def main() -> None:
    """Community fix from OpenGame Linux profile #12 r1."""
    util.protontricks('d3dcompiler_47')
    util.set_environment('DXVK_FRAME_RATE', '60')
    util.append_argument('--launcher-skip')
`

/** The module docstring, the util.* lines and the omissions: the parts of a file that vary per profile. */
const partes = (x: ExportacionFix) => {
  if (x._tag !== 'archivo') return x
  const lineas = x.contenido.split('\n')
  return { cabecera: lineas[0], lineas: lineas.slice(7, -1), omitidos: x.omitidos }
}

describe('exportarFix', () => {
  it('Witcher 3 seed profile: exact file, local command, links and omissions', () => {
    expect(exportarFix(witcher)).toEqual({
      _tag: 'archivo',
      appid: '292030',
      ruta: 'gamefixes-steam/292030.py',
      operaciones: [
        { _tag: 'winetricks', verbo: 'd3dcompiler_47' },
        { _tag: 'entorno', nombre: 'DXVK_FRAME_RATE', valor: '60' },
        { _tag: 'argumento', valor: '--launcher-skip' },
      ],
      contenido: archivoWitcher,
      omitidos: [
        { texto: 'gamemoderun', motivo: 'programa_envoltorio' },
        { texto: 'gamemode', motivo: 'paquete_del_sistema' },
      ],
      comando_local: `mkdir -p ~/.config/protonfixes/localfixes && cat > ~/.config/protonfixes/localfixes/292030.py <<'OPENGAME_FIX'\n${archivoWitcher}OPENGAME_FIX`,
      ver_existente: 'https://github.com/Open-Wine-Components/umu-protonfixes/blob/master/gamefixes-steam/292030.py',
      proponer: {
        _tag: 'enlace',
        url:
          'https://github.com/Open-Wine-Components/umu-protonfixes/new/master/gamefixes-steam?filename=292030.py' +
          `&value=${encodeURIComponent(archivoWitcher)}` +
          '&message=Add%20The%20Witcher%203%3A%20Wild%20Hunt%20(292030)%20fix%20from%20OpenGame%20Linux',
      },
    })
  })

  it('demo content gets the file but no GitHub link', () => {
    const x = exportarFix({ ...witcher, ejemplo: true })
    expect(x._tag === 'archivo' && x.proponer).toEqual({ _tag: 'datos_de_ejemplo' })
  })

  const casos: ReadonlyArray<readonly [string, Partial<EntradaFix>, ReturnType<typeof partes>]> = [
    [
      'injection: quotes in the title and a quote in a value',
      { juego: `Assassin's "Creed"`, parametros_lanzamiento: "FOO=it's %command% -dx11", dependencias: [] },
      {
        cabecera: `"""Game fix for Assassin's \\"Creed\\""""`,
        lineas: ["    util.append_argument('-dx11')"],
        omitidos: [{ texto: "FOO=it's", motivo: 'sintaxis_shell' }],
      },
    ],
    [
      'injection: a trailing backslash in the title and in a token',
      { juego: 'Foo\\', parametros_lanzamiento: '%command% -path=C:\\ -windowed', dependencias: [] },
      {
        cabecera: '"""Game fix for Foo\\\\"""',
        lineas: ["    util.append_argument('-windowed')"],
        omitidos: [{ texto: '-path=C:\\', motivo: 'sintaxis_shell' }],
      },
    ],
    [
      'injection: """ in the title',
      { juego: 'Evil"""; import os', parametros_lanzamiento: '%command% -dx11', dependencias: [] },
      { cabecera: '"""Game fix for Evil\\"\\"\\"; import os"""', lineas: ["    util.append_argument('-dx11')"], omitidos: [] },
    ],
    [
      'injection: control characters in the title, a value, an argument and a verb',
      {
        juego: 'A\nimport os\u0007',
        parametros_lanzamiento: 'FOO=a\u0001b BAR=1 %command% -x\u001b[2J -ok',
        dependencias: [
          { nombre: 'vcrun\u0007', gestor: 'winetricks', obligatoria: true },
          { nombre: 'vcrun2022', gestor: 'winetricks', obligatoria: true },
        ],
      },
      {
        cabecera: '"""Game fix for A import os """',
        lineas: ["    util.protontricks('vcrun2022')", "    util.set_environment('BAR', '1')", "    util.append_argument('-ok')"],
        omitidos: [
          { texto: 'FOO=a\u0001b', motivo: 'forma_invalida' },
          { texto: '-x\u001b[2J', motivo: 'forma_invalida' },
          { texto: 'vcrun\u0007', motivo: 'forma_invalida' },
        ],
      },
    ],
    [
      "injection: '); import os; (' as launch options and as a dependency",
      {
        parametros_lanzamiento: "'); import os; ('",
        dependencias: [{ nombre: "'); import os; ('", gestor: 'winetricks', obligatoria: true }],
      },
      {
        cabecera: '"""Game fix for The Witcher 3: Wild Hunt"""',
        lineas: ["    util.append_argument('import')"],
        omitidos: [
          { texto: "');", motivo: 'sintaxis_shell' },
          { texto: 'os;', motivo: 'sintaxis_shell' },
          { texto: "('", motivo: 'sintaxis_shell' },
          { texto: "'); import os; ('", motivo: 'forma_invalida' },
        ],
      },
    ],
    [
      'deny-list: logging and overlay variables are personal settings',
      {
        parametros_lanzamiento: 'PROTON_LOG=1 PROTON_LOG_DIR=/tmp WINEDEBUG=-all DXVK_HUD=fps DXVK_LOG_LEVEL=none VKD3D_DEBUG=none MANGOHUD=1 MANGOHUD_CONFIG=fps DXVK_ASYNC=1 %command%',
        dependencias: [],
      },
      {
        cabecera: '"""Game fix for The Witcher 3: Wild Hunt"""',
        lineas: ["    util.set_environment('DXVK_ASYNC', '1')"],
        omitidos: ['PROTON_LOG=1', 'PROTON_LOG_DIR=/tmp', 'WINEDEBUG=-all', 'DXVK_HUD=fps', 'DXVK_LOG_LEVEL=none', 'VKD3D_DEBUG=none', 'MANGOHUD=1', 'MANGOHUD_CONFIG=fps'].map(
          (texto): Omitido => ({ texto, motivo: 'ajuste_personal' }),
        ),
      },
    ],
    [
      'no %command%: Steam appends everything, so NAME=value is an argument too',
      { parametros_lanzamiento: '-dx11 FOO=1', dependencias: [] },
      {
        cabecera: '"""Game fix for The Witcher 3: Wild Hunt"""',
        lineas: ["    util.append_argument('-dx11')", "    util.append_argument('FOO=1')"],
        omitidos: [],
      },
    ],
    [
      "a wrapper's flags and a NAME=value after it belong to the wrapper; -pf_ options and a second %command% stay out",
      { parametros_lanzamiento: 'A=1 gamescope -w 1280 B=2 -- %command% -pf_tricks=vcrun2019 %command% -skip', dependencias: [] },
      {
        cabecera: '"""Game fix for The Witcher 3: Wild Hunt"""',
        lineas: ["    util.set_environment('A', '1')", "    util.append_argument('-skip')"],
        omitidos: [
          ...['gamescope', '-w', '1280', 'B=2', '--'].map((texto): Omitido => ({ texto, motivo: 'programa_envoltorio' })),
          { texto: '-pf_tricks=vcrun2019', motivo: 'opcion_protonfixes' },
          { texto: '%command%', motivo: 'sintaxis_shell' },
        ],
      },
    ],
    [
      'an optional winetricks verb would become mandatory in a fix file',
      { parametros_lanzamiento: '%command% -dx11', dependencias: [{ nombre: 'vcrun2019', gestor: 'winetricks', obligatoria: false }] },
      {
        cabecera: '"""Game fix for The Witcher 3: Wild Hunt"""',
        lineas: ["    util.append_argument('-dx11')"],
        omitidos: [{ texto: 'vcrun2019', motivo: 'dependencia_opcional' }],
      },
    ],
    [
      'GTA V seed profile: nothing translates',
      { parametros_lanzamiento: 'gamemoderun %command%', dependencias: [{ nombre: 'gamemode', gestor: 'apt', obligatoria: false }] },
      {
        _tag: 'nada_traducible',
        omitidos: [
          { texto: 'gamemoderun', motivo: 'programa_envoltorio' },
          { texto: 'gamemode', motivo: 'paquete_del_sistema' },
        ],
      },
    ],
    ['no launch options and no dependencies', { parametros_lanzamiento: null, dependencias: [] }, { _tag: 'nada_traducible', omitidos: [] }],
    ['a Wine layer never runs protonfixes', { familia: 'Wine' }, { _tag: 'no_exportable', motivo: 'capa_sin_protonfixes' }],
    ['a native game never runs protonfixes', { familia: 'Nativo' }, { _tag: 'no_exportable', motivo: 'capa_sin_protonfixes' }],
    ['GOG has no gamefixes-steam file', { lanzador: 'GOG', identificador_externo: null }, { _tag: 'no_exportable', motivo: 'no_es_steam' }],
    ['a Steam edition without an AppID', { identificador_externo: null }, { _tag: 'no_exportable', motivo: 'sin_appid' }],
  ]
  it.each(casos)('%s', (_, cambios, esperado) => {
    expect(partes(exportarFix({ ...witcher, ...cambios }))).toEqual(esperado)
  })
})

describe('AppIdSteam', () => {
  const casos: ReadonlyArray<readonly [string, boolean]> = [
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
  it.each(casos)('%j -> %s', (texto, valido) => {
    expect(Option.isSome(Schema.decodeUnknownOption(AppIdSteam)(texto))).toBe(valido)
  })
})

describe('PrProtonfixes', () => {
  const casos: ReadonlyArray<readonly [string, number | null]> = [
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
  it.each(casos)('%j -> %s', (url, pr) => {
    expect(Option.getOrNull(Schema.decodeUnknownOption(PrProtonfixes)(url))).toBe(pr)
  })

  it('a reviewer note decodes the pasted URL to the PR number', () => {
    expect(
      Schema.decodeUnknownSync(NotaArreglo)({ _tag: 'Aceptado', perfil_id: 12, pr: 'https://github.com/Open-Wine-Components/umu-protonfixes/pull/512/files' }),
    ).toEqual({ _tag: 'Aceptado', perfil_id: 12, pr: 512 })
  })
})

const reporte3: EntradaInforme = {
  lanzador: 'Steam',
  identificador_externo: '271590',
  familia: 'Proton',
  variante: 'Valve',
  version: '9.0-3',
  resultado: 'falla_en_ejecucion',
  version_juego: '1.0.3258',
  fecha_prueba: new Date('2026-10-02T19:00:00Z'),
  observaciones: 'Tras la actualización 1.0.3258 el lanzador corta la partida a los pocos minutos.',
  gpu_modelo: 'AMD Radeon RX 6600',
  controlador: 'amdgpu',
  version_controlador: 'Mesa 24.1.7',
  version_sistema: '6.10.6-200.fc40.x86_64',
  juego: 'Grand Theft Auto V',
  distribucion: 'Fedora 40',
  fallos: ['El Rockstar Games Launcher se queda en «Actualizando» y se cierra tras unos minutos de juego.'],
  ejemplo: false,
}

const cuerpo3 = `# Compatibility Report
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

const nuevoIssue = 'https://github.com/ValveSoftware/Proton/issues/new?template=compatibility-report.md&title=Grand%20Theft%20Auto%20V%20(271590)'

describe('informeProton', () => {
  it("report #3 (GTA V, Proton 9.0-3, Ana's Fedora tower): exact issue body and links", () => {
    expect(informeProton(reporte3)).toEqual({
      _tag: 'informe',
      appid: '271590',
      titulo: 'Grand Theft Auto V (271590)',
      cuerpo: cuerpo3,
      comando_registro: 'PROTON_LOG=1 %command%',
      comando_comprimir: 'gzip -k ~/steam-271590.log',
      buscar: 'https://github.com/ValveSoftware/Proton/issues?q=271590',
      abrir: { _tag: 'enlace', url: `${nuevoIssue}&body=${encodeURIComponent(cuerpo3)}` },
      cuerpo_en_enlace: true,
    })
  })

  it('past the URL limit the link carries only the title; the body stays whole for the copy box', () => {
    const largo = informeProton({ ...reporte3, observaciones: 'x'.repeat(8000) })
    expect(largo._tag === 'informe' && { abrir: largo.abrir, cuerpo_en_enlace: largo.cuerpo_en_enlace, cabe: largo.cuerpo.includes('x'.repeat(8000)) }).toEqual({
      abrir: { _tag: 'enlace', url: nuevoIssue },
      cuerpo_en_enlace: false,
      cabe: true,
    })
  })

  it('demo content gets the body but no GitHub link', () => {
    const x = informeProton({ ...reporte3, ejemplo: true })
    expect(x._tag === 'informe' && x.abrir).toEqual({ _tag: 'datos_de_ejemplo' })
  })

  const driver: ReadonlyArray<readonly [string | null, string | null, string]> = [
    ['nvidia', '550.107.02', '- Video driver version: 550.107.02 (nvidia)'],
    [null, 'Mesa 24.1.7', '- Video driver version: Mesa 24.1.7'],
    ['amdgpu', null, '- Video driver version: amdgpu'],
    [null, null, '- Video driver version: unknown'],
  ]
  it.each(driver)('driver %s / %s -> %s', (controlador, version_controlador, esperado) => {
    const x = informeProton({ ...reporte3, controlador, version_controlador })
    expect(x._tag === 'informe' && x.cuerpo.split('\n')[6]).toBe(esperado)
  })

  it('empty symptoms keep a prompt for the user', () => {
    const x = informeProton({ ...reporte3, fallos: [], observaciones: '  ' })
    expect(x._tag === 'informe' && x.cuerpo.split('\n').slice(20, 22)).toEqual(["## Symptoms <!-- What's the problem? -->", '<!-- Describe what goes wrong. -->'])
  })

  const fuera: ReadonlyArray<readonly [string, Partial<EntradaInforme>, ReturnType<typeof informeProton>]> = [
    ['a working game has nothing to report', { resultado: 'funciona' }, { _tag: 'no_aplica', motivo: 'funciona' }],
    ['GE-Proton is not Valve', { variante: 'GE', version: '9-4' }, { _tag: 'no_aplica', motivo: 'capa_no_valve' }],
    ['Wine is not Proton', { familia: 'Wine', variante: 'estable' }, { _tag: 'no_aplica', motivo: 'capa_no_valve' }],
    ['not a Steam edition', { lanzador: 'Epic Games Store', identificador_externo: null }, { _tag: 'no_aplica', motivo: 'no_es_steam' }],
    ['a Steam edition without an AppID', { identificador_externo: null }, { _tag: 'no_aplica', motivo: 'sin_appid' }],
  ]
  it.each(fuera)('%s', (_, cambios, esperado) => {
    expect(informeProton({ ...reporte3, ...cambios })).toEqual(esperado)
  })

  it('works with tweaks still qualifies: the tweak is what Valve fixes', () => {
    expect(informeProton({ ...reporte3, resultado: 'funciona_con_ajustes' })._tag).toBe('informe')
  })
})

describe('informeProtonPosible', () => {
  const casos: ReadonlyArray<readonly [Parameters<typeof informeProtonPosible>[0], boolean]> = [
    [{ lanzador: 'Steam', familia: 'Proton', variante: 'Valve', resultado: 'no_inicia' }, true],
    [{ lanzador: 'Steam', familia: 'Proton', variante: 'Valve', resultado: 'funciona_con_ajustes' }, true],
    [{ lanzador: 'Steam', familia: 'Proton', variante: 'Valve', resultado: 'funciona' }, false],
    [{ lanzador: 'Steam', familia: 'Proton', variante: 'GE', resultado: 'no_inicia' }, false],
    [{ lanzador: 'GOG', familia: 'Proton', variante: 'Valve', resultado: 'no_inicia' }, false],
  ]
  it.each(casos)('%o -> %s', (r, esperado) => {
    expect(informeProtonPosible(r)).toBe(esperado)
  })
})
