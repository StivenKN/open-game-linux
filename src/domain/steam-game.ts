import { Schema } from 'effect'
import type { LayerVersionId } from './ids.ts'
import { SteamAppId } from './library.ts'
import type { LayerFamily } from './literals.ts'
import type { LayerVersion } from './tables.ts'

/**
 * One installed Steam game as the Linux detector's report mode (`--game <appid>`) reads it. The report form
 * starts from it; nothing stores it.
 */
export const SteamGame = Schema.Struct({
  app_id: SteamAppId,
  /** The CompatToolMapping entry in force ("proton_9", "GE-Proton10-4"); null when none applies: the game runs natively. */
  tool: Schema.NullOr(Schema.String),
  /** The tool's own version file without its build time: "proton-9.0-2", "GE-Proton10-4". */
  tool_version: Schema.NullOr(Schema.String),
  launch_options: Schema.NullOr(Schema.String),
  build_id: Schema.NullOr(Schema.String),
  /** Several Steam accounts and none marked as the last one used, so the launch options are the first account's. */
  guessed_account: Schema.Boolean,
})
export type SteamGame = typeof SteamGame.Type

/** What the report form's layer fields start with. A `nueva` with an empty version means Steam did not say it. */
export type LayerPrefill =
  | { readonly _tag: 'existente'; readonly id: LayerVersionId }
  | { readonly _tag: 'nueva'; readonly family: LayerFamily; readonly variant: string; readonly version: string }

// A version file or a tool name that names one release: "proton-9.0-2", "experimental-9.0-20241017", "GE-Proton9-4".
const releases: ReadonlyArray<readonly [RegExp, string]> = [
  [/^proton-(.+)$/, 'Valve'],
  [/^experimental-(.+)$/, 'Experimental'],
  [/^GE-Proton(.+)$/i, 'GE'],
]

// Valve's tool names say only which build Steam keeps up to date.
const builds: ReadonlyArray<readonly [RegExp, string]> = [
  [/^proton_\d+$/, 'Valve'],
  [/^proton_experimental$/, 'Experimental'],
  [/^proton_hotfix$/, 'Hotfix'],
]

type LayerHint = { readonly family: LayerFamily; readonly variant: string | null; readonly version: string | null }

const hintOf = ({ tool, tool_version }: Pick<SteamGame, 'tool' | 'tool_version'>): LayerHint | null => {
  if (tool === null) return { family: 'Nativo', variant: null, version: null }
  for (const text of [tool_version, tool]) {
    for (const [pattern, variant] of releases) {
      const version = text === null ? undefined : pattern.exec(text)?.[1]
      if (version !== undefined) return { family: 'Proton', variant, version }
    }
  }
  const variant = builds.find(([pattern]) => pattern.test(tool))?.[1]
  return variant === undefined ? null : { family: 'Proton', variant, version: null }
}

/**
 * The layer a detected Steam tool names, matched to the catalog only when Steam names the exact release; null
 * for a tool it does not know (the form then starts as usual). It never guesses a release from a series.
 */
export const prefillLayer = (game: Pick<SteamGame, 'tool' | 'tool_version'>, layers: ReadonlyArray<LayerVersion>): LayerPrefill | null => {
  const hint = hintOf(game)
  if (hint === null) return null
  const { family, variant, version } = hint
  const known =
    variant === null || version === null
      ? undefined
      : layers.find((l) => l.family === family && l.variant.toLowerCase() === variant.toLowerCase() && l.version === version)
  return known === undefined ? { _tag: 'nueva', family, variant: variant ?? '', version: version ?? '' } : { _tag: 'existente', id: known.id }
}
