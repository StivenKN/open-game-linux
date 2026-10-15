// Turns approved community data into upstream artifacts: a umu-protonfixes fix file and a Proton
// compatibility report. The artifacts are English; user free text is copied as-is. OpenGame never sends
// them: it hands GitHub prefilled links and copy boxes (ARCHITECTURE Q3).
import { Array as Arr, Option, Schema, SchemaTransformation } from 'effect'
import { PerfilId } from './ids.ts'
import type { FamiliaCapa, Resultado } from './literales.ts'
import type { Dependencia, Diagnostico, PerfilDependencia, Reporte, VersionCapa } from './tablas.ts'

const PROTONFIXES = 'Open-Wine-Components/umu-protonfixes'
const PROTON = 'ValveSoftware/Proton'
const STEAM = 'Steam'
/** Past this GitHub refuses the URL, so the issue link carries only the title and the body goes through the copy box. */
const LIMITE_URL = 8000

/** `edicion_juego.identificador_externo` is free text; this is the only place it becomes an AppID. */
export const AppIdSteam = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,9}$/)).pipe(Schema.brand('AppIdSteam'))
export type AppIdSteam = typeof AppIdSteam.Type

export const NumeroPr = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand('NumeroPr'))
export type NumeroPr = typeof NumeroPr.Type

export const urlPr = (pr: number) => `https://github.com/${PROTONFIXES}/pull/${pr}`

/** Merged PRs that carry the generated docstring's marker: how a reviewer notices a fix that came from OpenGame. */
export const prsDeOpenGame = `https://github.com/${PROTONFIXES}/pulls?q=${encodeURIComponent('is:pr is:merged OpenGame')}`

const rePr = /^https:\/\/github\.com\/Open-Wine-Components\/umu-protonfixes\/pull\/([1-9][0-9]*)(?:[/?#].*)?$/

/** What a reviewer pastes: a umu-protonfixes PR URL on any of its tabs. Decodes to the PR number. */
export const PrProtonfixes = Schema.Trim.check(
  Schema.isPattern(rePr, { message: 'Pega el enlace de un PR de umu-protonfixes (github.com/Open-Wine-Components/umu-protonfixes/pull/…).' }),
).pipe(Schema.decodeTo(NumeroPr, SchemaTransformation.transform({ decode: (url: string) => Number(rePr.exec(url)?.[1]), encode: urlPr })))

/** A link that hands content to GitHub, or why it is withheld: demo content never goes upstream. */
export type Envio = { readonly _tag: 'enlace'; readonly url: string } | { readonly _tag: 'datos_de_ejemplo' }

const consulta = (parametros: Readonly<Record<string, string>>) =>
  Object.entries(parametros)
    .map(([clave, valor]) => `${clave}=${encodeURIComponent(valor)}`)
    .join('&')

type Edicion = { readonly lanzador: string; readonly identificador_externo: string | null }

const appIdDe = (e: Edicion): { readonly _tag: 'steam'; readonly appid: AppIdSteam } | { readonly _tag: 'no'; readonly motivo: 'no_es_steam' | 'sin_appid' } =>
  e.lanzador !== STEAM
    ? { _tag: 'no', motivo: 'no_es_steam' }
    : Option.match(Schema.decodeOption(AppIdSteam)(e.identificador_externo ?? ''), {
        onNone: () => ({ _tag: 'no', motivo: 'sin_appid' }),
        onSome: (appid) => ({ _tag: 'steam', appid }),
      })

// ── Fix file (umu-protonfixes) ──────────────────────────────────────────────

// The renderer only interpolates these brands, so escaping `\` and the quote is enough to stay inside a Python string.
const NombreEntorno = Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/)).pipe(Schema.brand('NombreEntorno'))
const VerboWinetricks = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9_.=-]*$/)).pipe(Schema.brand('VerboWinetricks'))
const TextoPlano = Schema.String.check(Schema.isPattern(/^\P{Cc}*$/u)).pipe(Schema.brand('TextoPlano'))
type NombreEntorno = typeof NombreEntorno.Type
type VerboWinetricks = typeof VerboWinetricks.Type
type TextoPlano = typeof TextoPlano.Type
const esNombreEntorno = Schema.is(NombreEntorno)
const esVerboWinetricks = Schema.is(VerboWinetricks)
const esTextoPlano = Schema.is(TextoPlano)

/** The only fix operations OpenGame data can express: util.protontricks, util.set_environment, util.append_argument. */
export type Operacion =
  | { readonly _tag: 'winetricks'; readonly verbo: VerboWinetricks }
  | { readonly _tag: 'entorno'; readonly nombre: NombreEntorno; readonly valor: TextoPlano }
  | { readonly _tag: 'argumento'; readonly valor: TextoPlano }

export type MotivoOmision =
  | 'programa_envoltorio'
  | 'sintaxis_shell'
  | 'opcion_protonfixes'
  | 'ajuste_personal'
  | 'forma_invalida'
  | 'paquete_del_sistema'
  | 'dependencia_opcional'

/** A piece of the profile that did not become a fix line. Every one is shown, none is dropped silently. */
export type Omitido = { readonly texto: string; readonly motivo: MotivoOmision }

type Pieza = Operacion | Omitido

const omitir = (texto: string, motivo: MotivoOmision): Omitido => ({ texto, motivo })

// Anything the shell would expand, chain, redirect or glob. Omitting such a token is safe; guessing its meaning is not.
const reShell = /['"`$;|&<>\\*?()~#]/
const reAsignacion = /^[A-Za-z_][A-Za-z0-9_]*=/

/** Debugging aids and personal taste, not fixes for the game. */
const ajustesPersonales = new Set(['PROTON_LOG', 'PROTON_LOG_DIR', 'WINEDEBUG', 'DXVK_HUD', 'DXVK_LOG_LEVEL', 'VKD3D_DEBUG', 'MANGOHUD'])
const esAjustePersonal = (nombre: string) => ajustesPersonales.has(nombre) || nombre.startsWith('MANGOHUD_')

const sintaxis = (token: string): Omitido | null =>
  reShell.test(token) || token.includes('%command%')
    ? omitir(token, 'sintaxis_shell')
    : token.startsWith('-pf_')
      ? omitir(token, 'opcion_protonfixes')
      : null

const asignacion = (token: string): Pieza => {
  const igual = token.indexOf('=')
  const nombre = token.slice(0, igual)
  const valor = token.slice(igual + 1)
  if (esAjustePersonal(nombre)) return omitir(token, 'ajuste_personal')
  return esNombreEntorno(nombre) && esTextoPlano(valor) ? { _tag: 'entorno', nombre, valor } : omitir(token, 'forma_invalida')
}

const argumento = (token: string): Pieza => (esTextoPlano(token) ? { _tag: 'argumento', valor: token } : omitir(token, 'forma_invalida'))

/**
 * Steam's own semantics: with %command%, leading NAME=value words are the environment, the first other word
 * starts a wrapper (gamemoderun, gamescope and its flags) and everything after %command% is a game argument.
 * Without %command% Steam appends the whole string to the game's command line, so every word is an argument.
 */
const traducirParametros = (parametros: string | null): ReadonlyArray<Pieza> => {
  const tokens = (parametros ?? '').split(/\s+/).filter((t) => t !== '')
  const corte = tokens.indexOf('%command%')
  const antes = corte === -1 ? [] : tokens.slice(0, corte)
  const despues = corte === -1 ? tokens : tokens.slice(corte + 1)
  const envoltorio = antes.findIndex((t) => !reAsignacion.test(t))
  const finEntorno = envoltorio === -1 ? antes.length : envoltorio
  return [
    ...antes.map((t, i) => sintaxis(t) ?? (i < finEntorno ? asignacion(t) : omitir(t, 'programa_envoltorio'))),
    ...despues.map((t) => sintaxis(t) ?? argumento(t)),
  ]
}

type DependenciaDePerfil = Pick<Dependencia, 'nombre' | 'gestor'> & Pick<PerfilDependencia, 'obligatoria'>

const traducirDependencia = (d: DependenciaDePerfil): Pieza =>
  d.gestor !== 'winetricks'
    ? omitir(d.nombre, 'paquete_del_sistema')
    : !d.obligatoria
      ? omitir(d.nombre, 'dependencia_opcional') // a fix file would make it mandatory
      : esVerboWinetricks(d.nombre)
        ? { _tag: 'winetricks', verbo: d.nombre }
        : omitir(d.nombre, 'forma_invalida')

export type MotivoNoExportable = 'no_es_steam' | 'sin_appid' | 'capa_sin_protonfixes'

type NoExportable = { readonly _tag: 'no_exportable'; readonly motivo: MotivoNoExportable }

/** Whether a profile maps to gamefixes-steam/<appid>.py at all. Shared by exportarFix and the writer of arreglo_upstream. */
export const appIdExportable = (
  e: Edicion & { readonly familia: FamiliaCapa },
): NoExportable | { readonly _tag: 'exportable'; readonly appid: AppIdSteam } => {
  const edicion = appIdDe(e)
  if (edicion._tag === 'no') return { _tag: 'no_exportable', motivo: edicion.motivo }
  // Any Proton variant: the profile was tested in a Proton prefix, which is what protonfixes patches. Wine and native never load it.
  return e.familia === 'Proton' ? { _tag: 'exportable', appid: edicion.appid } : { _tag: 'no_exportable', motivo: 'capa_sin_protonfixes' }
}

export type EntradaFix = Edicion & {
  readonly familia: FamiliaCapa
  readonly juego: string
  readonly perfil: { readonly id: PerfilId; readonly revision: number }
  readonly parametros_lanzamiento: string | null
  readonly dependencias: ReadonlyArray<DependenciaDePerfil>
  readonly ejemplo: boolean
}

export type ExportacionFix =
  | NoExportable
  | { readonly _tag: 'nada_traducible'; readonly omitidos: ReadonlyArray<Omitido> }
  | {
      readonly _tag: 'archivo'
      readonly appid: AppIdSteam
      readonly ruta: string
      readonly operaciones: readonly [Operacion, ...Array<Operacion>]
      /** The Python module, exact bytes. */
      readonly contenido: string
      readonly omitidos: ReadonlyArray<Omitido>
      /** Writes ~/.config/protonfixes/localfixes/<appid>.py, which GE-Proton and umu read today. OpenGame never runs it. */
      readonly comando_local: string
      readonly ver_existente: string
      /** GitHub's new-file editor with the file filled in; GitHub forks the repo for users without write access. */
      readonly proponer: Envio
    }

const py = (s: TextoPlano | NombreEntorno | VerboWinetricks) => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`

const enDocstring = (s: TextoPlano) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

const linea = (op: Operacion) => {
  switch (op._tag) {
    case 'winetricks':
      return `    util.protontricks(${py(op.verbo)})`
    case 'entorno':
      return `    util.set_environment(${py(op.nombre)}, ${py(op.valor)})`
    case 'argumento':
      return `    util.append_argument(${py(op.valor)})`
  }
}

const archivoPython = (juego: string, perfil: EntradaFix['perfil'], operaciones: ReadonlyArray<Operacion>) =>
  [
    `"""Game fix for ${enDocstring(TextoPlano.make(juego.replace(/\p{Cc}/gu, ' ')))}"""`,
    '',
    'from protonfixes import util',
    '',
    '',
    'def main() -> None:',
    `    """Community fix from OpenGame Linux profile #${perfil.id} r${perfil.revision}."""`,
    ...operaciones.map(linea),
    '',
  ].join('\n')

export const exportarFix = (entrada: EntradaFix): ExportacionFix => {
  const destino = appIdExportable(entrada)
  if (destino._tag === 'no_exportable') return destino
  const parametros = traducirParametros(entrada.parametros_lanzamiento)
  const dependencias = entrada.dependencias.map(traducirDependencia)
  // Dependencies first keeps upstream's line order: protontricks, then environment, then arguments.
  const operaciones = [...dependencias, ...parametros].filter((p) => '_tag' in p)
  const omitidos = [...parametros, ...dependencias].filter((p) => 'motivo' in p)
  if (!Arr.isReadonlyArrayNonEmpty(operaciones)) return { _tag: 'nada_traducible', omitidos }

  const { appid } = destino
  const contenido = archivoPython(entrada.juego, entrada.perfil, operaciones)
  const ruta = `gamefixes-steam/${appid}.py`
  return {
    _tag: 'archivo',
    appid,
    ruta,
    operaciones,
    contenido,
    omitidos,
    // No line of the file can equal the quoted delimiter, so the heredoc always ends where we mean.
    comando_local: `mkdir -p ~/.config/protonfixes/localfixes && cat > ~/.config/protonfixes/localfixes/${appid}.py <<'OPENGAME_FIX'\n${contenido}OPENGAME_FIX`,
    ver_existente: `https://github.com/${PROTONFIXES}/blob/master/${ruta}`,
    proponer: entrada.ejemplo
      ? { _tag: 'datos_de_ejemplo' }
      : {
          _tag: 'enlace',
          url: `https://github.com/${PROTONFIXES}/new/master/gamefixes-steam?${consulta({
            filename: `${appid}.py`,
            value: contenido,
            message: `Add ${entrada.juego} (${appid}) fix from OpenGame Linux`,
          })}`,
        },
  }
}

// ── Proton compatibility report (ValveSoftware/Proton) ──────────────────────

export type MotivoSinInforme = 'no_es_steam' | 'sin_appid' | 'capa_no_valve' | 'funciona'

type Ensayo = Pick<VersionCapa, 'familia' | 'variante'> & Pick<Reporte, 'resultado'>

// Valve's tracker is for its own Proton. A tweak-dependent result still counts: that tweak is what Valve fixes.
const motivoEnsayo = (r: Ensayo): 'capa_no_valve' | 'funciona' | null =>
  r.familia !== 'Proton' || r.variante !== 'Valve' ? 'capa_no_valve' : r.resultado === 'funciona' ? 'funciona' : null

/** The "Reporte enviado" panel knows the launcher, layer and result but not the AppID; the report page decides for good. */
export const informeProtonPosible = (r: Ensayo & { readonly lanzador: string }) => r.lanzador === STEAM && motivoEnsayo(r) === null

export type EntradaInforme = Edicion &
  Ensayo &
  Pick<VersionCapa, 'version'> &
  Pick<Reporte, 'version_juego' | 'fecha_prueba' | 'observaciones'> &
  Pick<Diagnostico, 'gpu_modelo' | 'controlador' | 'version_controlador' | 'version_sistema'> & {
    readonly juego: string
    readonly distribucion: string
    readonly fallos: ReadonlyArray<string>
    readonly ejemplo: boolean
  }

export type InformeProton =
  | { readonly _tag: 'no_aplica'; readonly motivo: MotivoSinInforme }
  | {
      readonly _tag: 'informe'
      readonly appid: AppIdSteam
      readonly titulo: string
      readonly cuerpo: string
      readonly comando_registro: string
      readonly comando_comprimir: string
      /** Valve wants one issue per game, so the user looks for an existing one first. */
      readonly buscar: string
      readonly abrir: Envio
      readonly cuerpo_en_enlace: boolean
    }

const resultadoEnIngles = {
  funciona: 'Works',
  funciona_con_ajustes: 'Works with tweaks',
  no_inicia: 'Does not start',
  falla_en_ejecucion: 'Fails while playing',
} as const satisfies Record<Resultado, string>

const controladorDe = (e: Pick<Diagnostico, 'controlador' | 'version_controlador'>) =>
  e.version_controlador === null ? (e.controlador ?? 'unknown') : e.controlador === null ? e.version_controlador : `${e.version_controlador} (${e.controlador})`

/** Valve's compatibility-report.md with what OpenGame knows filled in. The "I confirm" boxes stay for the user to tick. */
const cuerpoInforme = (e: EntradaInforme, appid: AppIdSteam) => {
  const sintomas = [...e.fallos, e.observaciones].map((t) => t.trim()).filter((t) => t !== '')
  return [
    '# Compatibility Report',
    `- Name of the game with compatibility issues: ${e.juego}`,
    `- Steam AppID of the game: ${appid}`,
    '',
    '## System Information',
    `- GPU: ${e.gpu_modelo}`,
    `- Video driver version: ${controladorDe(e)}`,
    `- Kernel version: ${e.version_sistema}`,
    `- Distribution: ${e.distribucion}`,
    '- Link to full system information report as [Gist](https://gist.github.com/):',
    `- Proton version: Proton ${e.version}`,
    '',
    '## I confirm:',
    "- [ ] that I haven't found an existing compatibility report for this game.",
    '- [ ] that I have checked whether there are updates for my system available.',
    '',
    "<!-- Please add `PROTON_LOG=1 %command%` to the game's launch options and",
    'attach the generated $HOME/steam-$APPID.log to this issue report as a file.',
    '(Proton logs compress well if needed.)-->',
    '',
    "## Symptoms <!-- What's the problem? -->",
    sintomas.length === 0 ? '<!-- Describe what goes wrong. -->' : sintomas.join('\n\n'),
    '',
    '## Reproduction',
    `- Game version: ${e.version_juego}`,
    `- Result: ${resultadoEnIngles[e.resultado]}`,
    `- Tested on: ${e.fecha_prueba.toISOString().slice(0, 10)}`,
    '<!-- List the steps that lead to the problem. -->',
    '',
    'Prepared with OpenGame Linux.',
    '',
  ].join('\n')
}

export const informeProton = (entrada: EntradaInforme): InformeProton => {
  const edicion = appIdDe(entrada)
  if (edicion._tag === 'no') return { _tag: 'no_aplica', motivo: edicion.motivo }
  const motivo = motivoEnsayo(entrada)
  if (motivo !== null) return { _tag: 'no_aplica', motivo }

  const { appid } = edicion
  const titulo = `${entrada.juego} (${appid})`
  const cuerpo = cuerpoInforme(entrada, appid)
  const nuevo = `https://github.com/${PROTON}/issues/new?`
  const conCuerpo = nuevo + consulta({ template: 'compatibility-report.md', title: titulo, body: cuerpo })
  const cuerpo_en_enlace = conCuerpo.length <= LIMITE_URL
  return {
    _tag: 'informe',
    appid,
    titulo,
    cuerpo,
    comando_registro: 'PROTON_LOG=1 %command%',
    comando_comprimir: `gzip -k ~/steam-${appid}.log`,
    buscar: `https://github.com/${PROTON}/issues?${consulta({ q: appid })}`,
    abrir: entrada.ejemplo
      ? { _tag: 'datos_de_ejemplo' }
      : { _tag: 'enlace', url: cuerpo_en_enlace ? conCuerpo : nuevo + consulta({ template: 'compatibility-report.md', title: titulo }) },
    cuerpo_en_enlace,
  }
}

// ── Upstream tracking (reviewer form) ───────────────────────────────────────

/**
 * A reviewer's note that a profile's fix was merged into umu-protonfixes. Only merges are recorded, so there
 * is no status to keep in sync: the row is the claim and the PR link its evidence. `Anular` undoes a mistaken note.
 */
export const NotaArreglo = Schema.Union([
  Schema.TaggedStruct('Aceptado', { perfil_id: PerfilId, pr: PrProtonfixes }),
  Schema.TaggedStruct('Anular', { pr: NumeroPr }),
])
export type NotaArreglo = typeof NotaArreglo.Type
