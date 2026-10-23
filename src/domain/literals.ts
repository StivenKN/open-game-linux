import { Schema } from 'effect'

export const LayerFamily = Schema.Literals(['Wine', 'Proton', 'Nativo'])
export type LayerFamily = typeof LayerFamily.Type

export const Outcome = Schema.Literals(['funciona', 'funciona_con_ajustes', 'no_inicia', 'falla_en_ejecucion'])
export type Outcome = typeof Outcome.Type

export const WorkingOutcome = Outcome.pick(['funciona', 'funciona_con_ajustes'])
export type WorkingOutcome = typeof WorkingOutcome.Type

export const FailingOutcome = Outcome.pick(['no_inicia', 'falla_en_ejecucion'])
export type FailingOutcome = typeof FailingOutcome.Type

export const requiresFailure = {
  funciona: false,
  funciona_con_ajustes: false,
  no_inicia: true,
  falla_en_ejecucion: true,
} as const satisfies Record<WorkingOutcome, false> & Record<FailingOutcome, true>

/** Graphics APIs a game can render with. A game with none declared has unknown APIs. */
export const GraphicsApi = Schema.Literals(['d3d9', 'd3d10', 'd3d11', 'd3d12', 'vulkan', 'opengl'])
export type GraphicsApi = typeof GraphicsApi.Type

// ProtonDB's `variant`. 'notListed' is left out: as a layer it says nothing, so it reads as no layer.
export const ProtonVariant = Schema.Literals(['official', 'experimental', 'ge', 'native', 'older'])
export type ProtonVariant = typeof ProtonVariant.Type

// AreWeAntiCheatYet's `status`, in its own words.
export const AntiCheatStatus = Schema.Literals(['Supported', 'Running', 'Planned', 'Broken', 'Denied'])
export type AntiCheatStatus = typeof AntiCheatStatus.Type

/** The datasets the external imports read: ProtonDB's monthly export and AreWeAntiCheatYet's games.json. */
export const ExternalSource = Schema.Literals(['protondb', 'anticheat'])
export type ExternalSource = typeof ExternalSource.Type
