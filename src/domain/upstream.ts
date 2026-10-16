// Turns approved community data into upstream artifacts: a umu-protonfixes fix file and a Proton
// compatibility report. The artifacts are English; user free text is copied as-is. OpenGame never sends
// them: it hands GitHub prefilled links and copy boxes (ARCHITECTURE Q3).
import { Array as Arr, Option, Schema, SchemaTransformation } from 'effect'
import { ProfileId } from './ids.ts'
import type { LayerFamily, Outcome } from './literals.ts'
import type { Dependency, Diagnostic, ProfileDependency, Report, LayerVersion } from './tables.ts'

const PROTONFIXES = 'Open-Wine-Components/umu-protonfixes'
const PROTON = 'ValveSoftware/Proton'
const STEAM = 'Steam'
/** Past this GitHub refuses the URL, so the issue link carries only the title and the body goes through the copy box. */
const URL_LIMIT = 8000

/** `edicion_juego.identificador_externo` is free text; this is the only place it becomes an AppID. */
export const SteamAppId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,9}$/)).pipe(Schema.brand('AppIdSteam'))
export type SteamAppId = typeof SteamAppId.Type

export const PrNumber = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand('NumeroPr'))
export type PrNumber = typeof PrNumber.Type

export const prUrl = (pr: number) => `https://github.com/${PROTONFIXES}/pull/${pr}`

/** Merged PRs that carry the generated docstring's marker: how a reviewer notices a fix that came from OpenGame. */
export const openGamePrs = `https://github.com/${PROTONFIXES}/pulls?q=${encodeURIComponent('is:pr is:merged OpenGame')}`

const prPattern = /^https:\/\/github\.com\/Open-Wine-Components\/umu-protonfixes\/pull\/([1-9][0-9]*)(?:[/?#].*)?$/

/** What a reviewer pastes: a umu-protonfixes PR URL on any of its tabs. Decodes to the PR number. */
export const ProtonfixesPr = Schema.Trim.check(
  Schema.isPattern(prPattern, { message: 'Pega el enlace de un PR de umu-protonfixes (github.com/Open-Wine-Components/umu-protonfixes/pull/…).' }),
).pipe(Schema.decodeTo(PrNumber, SchemaTransformation.transform({ decode: (url: string) => Number(prPattern.exec(url)?.[1]), encode: prUrl })))

/** A link that hands content to GitHub, or why it is withheld: demo content never goes upstream. */
export type Submission = { readonly _tag: 'enlace'; readonly url: string } | { readonly _tag: 'datos_de_ejemplo' }

const query = (params: Readonly<Record<string, string>>) =>
  Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')

type Edition = { readonly launcher: string; readonly external_id: string | null }

const appIdOf = (e: Edition): { readonly _tag: 'steam'; readonly appid: SteamAppId } | { readonly _tag: 'no'; readonly reason: 'no_es_steam' | 'sin_appid' } =>
  e.launcher !== STEAM
    ? { _tag: 'no', reason: 'no_es_steam' }
    : Option.match(Schema.decodeOption(SteamAppId)(e.external_id ?? ''), {
        onNone: () => ({ _tag: 'no', reason: 'sin_appid' }),
        onSome: (appid) => ({ _tag: 'steam', appid }),
      })

// ── Fix file (umu-protonfixes) ──────────────────────────────────────────────

// The renderer only interpolates these brands, so escaping `\` and the quote is enough to stay inside a Python string.
const EnvName = Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/)).pipe(Schema.brand('NombreEntorno'))
const WinetricksVerb = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9_.=-]*$/)).pipe(Schema.brand('VerboWinetricks'))
const PlainText = Schema.String.check(Schema.isPattern(/^\P{Cc}*$/u)).pipe(Schema.brand('TextoPlano'))
type EnvName = typeof EnvName.Type
type WinetricksVerb = typeof WinetricksVerb.Type
type PlainText = typeof PlainText.Type
const isEnvName = Schema.is(EnvName)
const isWinetricksVerb = Schema.is(WinetricksVerb)
const isPlainText = Schema.is(PlainText)

/** The only fix operations OpenGame data can express: util.protontricks, util.set_environment, util.append_argument. */
export type Operation =
  | { readonly _tag: 'winetricks'; readonly verb: WinetricksVerb }
  | { readonly _tag: 'entorno'; readonly name: EnvName; readonly value: PlainText }
  | { readonly _tag: 'argumento'; readonly value: PlainText }

export type SkipReason =
  | 'programa_envoltorio'
  | 'sintaxis_shell'
  | 'opcion_protonfixes'
  | 'ajuste_personal'
  | 'forma_invalida'
  | 'paquete_del_sistema'
  | 'dependencia_opcional'

/** A piece of the profile that did not become a fix line. Every one is shown, none is dropped silently. */
export type Skipped = { readonly text: string; readonly reason: SkipReason }

type Piece = Operation | Skipped

const skip = (text: string, reason: SkipReason): Skipped => ({ text, reason })

// Anything the shell would expand, chain, redirect or glob. Omitting such a token is safe; guessing its meaning is not.
const shellPattern = /['"`$;|&<>\\*?()~#]/
const assignmentPattern = /^[A-Za-z_][A-Za-z0-9_]*=/

/** Debugging aids and personal taste, not fixes for the game. */
const personalSettings = new Set(['PROTON_LOG', 'PROTON_LOG_DIR', 'WINEDEBUG', 'DXVK_HUD', 'DXVK_LOG_LEVEL', 'VKD3D_DEBUG', 'MANGOHUD'])
const isPersonalSetting = (name: string) => personalSettings.has(name) || name.startsWith('MANGOHUD_')

const shellSyntax = (token: string): Skipped | null =>
  shellPattern.test(token) || token.includes('%command%')
    ? skip(token, 'sintaxis_shell')
    : token.startsWith('-pf_')
      ? skip(token, 'opcion_protonfixes')
      : null

const assignment = (token: string): Piece => {
  const equals = token.indexOf('=')
  const name = token.slice(0, equals)
  const value = token.slice(equals + 1)
  if (isPersonalSetting(name)) return skip(token, 'ajuste_personal')
  return isEnvName(name) && isPlainText(value) ? { _tag: 'entorno', name, value } : skip(token, 'forma_invalida')
}

const argument = (token: string): Piece => (isPlainText(token) ? { _tag: 'argumento', value: token } : skip(token, 'forma_invalida'))

/**
 * Steam's own semantics: with %command%, leading NAME=value words are the environment, the first other word
 * starts a wrapper (gamemoderun, gamescope and its flags) and everything after %command% is a game argument.
 * Without %command% Steam appends the whole string to the game's command line, so every word is an argument.
 */
const translateLaunchOptions = (options: string | null): ReadonlyArray<Piece> => {
  const tokens = (options ?? '').split(/\s+/).filter((t) => t !== '')
  const cut = tokens.indexOf('%command%')
  const before = cut === -1 ? [] : tokens.slice(0, cut)
  const after = cut === -1 ? tokens : tokens.slice(cut + 1)
  const wrapper = before.findIndex((t) => !assignmentPattern.test(t))
  const envEnd = wrapper === -1 ? before.length : wrapper
  return [
    ...before.map((t, i) => shellSyntax(t) ?? (i < envEnd ? assignment(t) : skip(t, 'programa_envoltorio'))),
    ...after.map((t) => shellSyntax(t) ?? argument(t)),
  ]
}

type FixDependency = Pick<Dependency, 'name' | 'package_manager'> & Pick<ProfileDependency, 'required'>

const translateDependency = (d: FixDependency): Piece =>
  d.package_manager !== 'winetricks'
    ? skip(d.name, 'paquete_del_sistema')
    : !d.required
      ? skip(d.name, 'dependencia_opcional') // a fix file would make it mandatory
      : isWinetricksVerb(d.name)
        ? { _tag: 'winetricks', verb: d.name }
        : skip(d.name, 'forma_invalida')

export type NotExportableReason = 'no_es_steam' | 'sin_appid' | 'capa_sin_protonfixes'

type NotExportable = { readonly _tag: 'no_exportable'; readonly reason: NotExportableReason }

/** Whether a profile maps to gamefixes-steam/<appid>.py at all. Shared by exportFix and the writer of arreglo_upstream. */
export const exportableAppId = (
  e: Edition & { readonly family: LayerFamily },
): NotExportable | { readonly _tag: 'exportable'; readonly appid: SteamAppId } => {
  const edition = appIdOf(e)
  if (edition._tag === 'no') return { _tag: 'no_exportable', reason: edition.reason }
  // Any Proton variant: the profile was tested in a Proton prefix, which is what protonfixes patches. Wine and native never load it.
  return e.family === 'Proton' ? { _tag: 'exportable', appid: edition.appid } : { _tag: 'no_exportable', reason: 'capa_sin_protonfixes' }
}

export type FixInput = Edition & {
  readonly family: LayerFamily
  readonly game: string
  readonly profile: { readonly id: ProfileId; readonly revision: number }
  readonly launch_options: string | null
  readonly dependencies: ReadonlyArray<FixDependency>
  readonly demo: boolean
}

export type FixExport =
  | NotExportable
  | { readonly _tag: 'nada_traducible'; readonly skipped: ReadonlyArray<Skipped> }
  | {
      readonly _tag: 'archivo'
      readonly appid: SteamAppId
      readonly path: string
      readonly operations: readonly [Operation, ...Array<Operation>]
      readonly content: string
      readonly skipped: ReadonlyArray<Skipped>
      /** Writes ~/.config/protonfixes/localfixes/<appid>.py, which GE-Proton and umu read today. OpenGame never runs it. */
      readonly local_command: string
      readonly view_existing: string
      /** GitHub's new-file editor with the file filled in; GitHub forks the repo for users without write access. */
      readonly propose: Submission
    }

const py = (s: PlainText | EnvName | WinetricksVerb) => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`

const inDocstring = (s: PlainText) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

const line = (op: Operation) => {
  switch (op._tag) {
    case 'winetricks':
      return `    util.protontricks(${py(op.verb)})`
    case 'entorno':
      return `    util.set_environment(${py(op.name)}, ${py(op.value)})`
    case 'argumento':
      return `    util.append_argument(${py(op.value)})`
  }
}

const pythonFile = (game: string, profile: FixInput['profile'], operations: ReadonlyArray<Operation>) =>
  [
    `"""Game fix for ${inDocstring(PlainText.make(game.replace(/\p{Cc}/gu, ' ')))}"""`,
    '',
    'from protonfixes import util',
    '',
    '',
    'def main() -> None:',
    `    """Community fix from OpenGame Linux profile #${profile.id} r${profile.revision}."""`,
    ...operations.map(line),
    '',
  ].join('\n')

export const exportFix = (input: FixInput): FixExport => {
  const target = exportableAppId(input)
  if (target._tag === 'no_exportable') return target
  const options = translateLaunchOptions(input.launch_options)
  const dependencies = input.dependencies.map(translateDependency)
  // Dependencies first keeps upstream's line order: protontricks, then environment, then arguments.
  const operations = [...dependencies, ...options].filter((p) => '_tag' in p)
  const skipped = [...options, ...dependencies].filter((p) => 'reason' in p)
  if (!Arr.isReadonlyArrayNonEmpty(operations)) return { _tag: 'nada_traducible', skipped }

  const { appid } = target
  const content = pythonFile(input.game, input.profile, operations)
  const path = `gamefixes-steam/${appid}.py`
  return {
    _tag: 'archivo',
    appid,
    path,
    operations,
    content,
    skipped,
    // No line of the file can equal the quoted delimiter, so the heredoc always ends where we mean.
    local_command: `mkdir -p ~/.config/protonfixes/localfixes && cat > ~/.config/protonfixes/localfixes/${appid}.py <<'OPENGAME_FIX'\n${content}OPENGAME_FIX`,
    view_existing: `https://github.com/${PROTONFIXES}/blob/master/${path}`,
    propose: input.demo
      ? { _tag: 'datos_de_ejemplo' }
      : {
          _tag: 'enlace',
          url: `https://github.com/${PROTONFIXES}/new/master/gamefixes-steam?${query({
            filename: `${appid}.py`,
            value: content,
            message: `Add ${input.game} (${appid}) fix from OpenGame Linux`,
          })}`,
        },
  }
}

// ── Proton compatibility report (ValveSoftware/Proton) ──────────────────────

export type NoReportReason = 'no_es_steam' | 'sin_appid' | 'capa_no_valve' | 'funciona'

type Trial = Pick<LayerVersion, 'family' | 'variant'> & Pick<Report, 'outcome'>

// Valve's tracker is for its own Proton. A tweak-dependent result still counts: that tweak is what Valve fixes.
const trialReason = (r: Trial): 'capa_no_valve' | 'funciona' | null =>
  r.family !== 'Proton' || r.variant !== 'Valve' ? 'capa_no_valve' : r.outcome === 'funciona' ? 'funciona' : null

/** The "Reporte enviado" panel knows the launcher, layer and result but not the AppID; the report page decides for good. */
export const protonReportPossible = (r: Trial & { readonly launcher: string }) => r.launcher === STEAM && trialReason(r) === null

export type ReportInput = Edition &
  Trial &
  Pick<LayerVersion, 'version'> &
  Pick<Report, 'game_version' | 'tested_at' | 'observations'> &
  Pick<Diagnostic, 'gpu_model' | 'driver' | 'driver_version' | 'os_version'> & {
    readonly game: string
    readonly distribution: string
    readonly failures: ReadonlyArray<string>
    readonly demo: boolean
  }

export type ProtonReport =
  | { readonly _tag: 'no_aplica'; readonly reason: NoReportReason }
  | {
      readonly _tag: 'informe'
      readonly appid: SteamAppId
      readonly title: string
      readonly body: string
      readonly log_command: string
      readonly compress_command: string
      /** Valve wants one issue per game, so the user looks for an existing one first. */
      readonly search: string
      readonly open: Submission
      readonly body_in_link: boolean
    }

const outcomeInEnglish = {
  funciona: 'Works',
  funciona_con_ajustes: 'Works with tweaks',
  no_inicia: 'Does not start',
  falla_en_ejecucion: 'Fails while playing',
} as const satisfies Record<Outcome, string>

const driverOf = (e: Pick<Diagnostic, 'driver' | 'driver_version'>) =>
  e.driver_version === null ? (e.driver ?? 'unknown') : e.driver === null ? e.driver_version : `${e.driver_version} (${e.driver})`

/** Valve's compatibility-report.md with what OpenGame knows filled in. The "I confirm" boxes stay for the user to tick. */
const reportBody = (e: ReportInput, appid: SteamAppId) => {
  const symptoms = [...e.failures, e.observations].map((t) => t.trim()).filter((t) => t !== '')
  return [
    '# Compatibility Report',
    `- Name of the game with compatibility issues: ${e.game}`,
    `- Steam AppID of the game: ${appid}`,
    '',
    '## System Information',
    `- GPU: ${e.gpu_model}`,
    `- Video driver version: ${driverOf(e)}`,
    `- Kernel version: ${e.os_version}`,
    `- Distribution: ${e.distribution}`,
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
    symptoms.length === 0 ? '<!-- Describe what goes wrong. -->' : symptoms.join('\n\n'),
    '',
    '## Reproduction',
    `- Game version: ${e.game_version}`,
    `- Result: ${outcomeInEnglish[e.outcome]}`,
    `- Tested on: ${e.tested_at.toISOString().slice(0, 10)}`,
    '<!-- List the steps that lead to the problem. -->',
    '',
    'Prepared with OpenGame Linux.',
    '',
  ].join('\n')
}

export const protonReport = (input: ReportInput): ProtonReport => {
  const edition = appIdOf(input)
  if (edition._tag === 'no') return { _tag: 'no_aplica', reason: edition.reason }
  const reason = trialReason(input)
  if (reason !== null) return { _tag: 'no_aplica', reason }

  const { appid } = edition
  const title = `${input.game} (${appid})`
  const body = reportBody(input, appid)
  const newIssue = `https://github.com/${PROTON}/issues/new?`
  const withBody = newIssue + query({ template: 'compatibility-report.md', title, body })
  const body_in_link = withBody.length <= URL_LIMIT
  return {
    _tag: 'informe',
    appid,
    title,
    body,
    log_command: 'PROTON_LOG=1 %command%',
    compress_command: `gzip -k ~/steam-${appid}.log`,
    search: `https://github.com/${PROTON}/issues?${query({ q: appid })}`,
    open: input.demo
      ? { _tag: 'datos_de_ejemplo' }
      : { _tag: 'enlace', url: body_in_link ? withBody : newIssue + query({ template: 'compatibility-report.md', title }) },
    body_in_link,
  }
}

// ── Upstream tracking (reviewer form) ───────────────────────────────────────

/**
 * A reviewer's note that a profile's fix was merged into umu-protonfixes. Only merges are recorded, so there
 * is no status to keep in sync: the row is the claim and the PR link its evidence. `Anular` undoes a mistaken note.
 */
export const FixNote = Schema.Union([
  Schema.TaggedStruct('Aceptado', { perfil_id: ProfileId, pr: ProtonfixesPr }),
  Schema.TaggedStruct('Anular', { pr: PrNumber }),
])
export type FixNote = typeof FixNote.Type
