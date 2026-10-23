import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { CompatibilityStatus } from './compatibility.ts'
import { VulkanSupport, vulkanVersionPattern } from './evaluation.ts'
import type { Mismatch } from './errors.ts'
import {
  Checkbox,
  DependencyId,
  DiagnosticId,
  DistributionId,
  EditionId,
  GuideId,
  MachineId,
  LauncherId,
  ProfileId,
  ReportId,
  RequiredText,
  OptionalText,
  FailureTypeId,
  LayerVersionId,
  GameRequestId,
  OptionalTextOf,
} from './ids.ts'
import { GraphicsApi, LayerFamily, FailingOutcome, WorkingOutcome } from './literals.ts'
import { MAX_LIBRARY_GAMES, SteamStoreRef } from './library.ts'
import { maxLengths } from './max-lengths.ts'
import {
  AdoptionGuide,
  Dependency,
  Diagnostic,
  Distribution,
  Machine,
  Game,
  Profile,
  ProfileStep,
  Report,
  Solution,
  TextUpTo,
  OptionalTextUpTo,
  LayerVersion,
} from './tables.ts'

export const LayerVersionRef = Schema.Union([
  Schema.TaggedStruct('existente', { id: LayerVersionId }),
  Schema.TaggedStruct('nueva', { family: LayerFamily, variant: LayerVersion.fields.variant, version: LayerVersion.fields.version }),
])

export const TargetMachine = Schema.Union([
  Schema.TaggedStruct('existente', { id: MachineId }),
  Schema.TaggedStruct('nuevo', { alias: Machine.fields.alias }),
])

export const FpsMeasurement = Schema.Struct({
  avg_fps: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 99999.99 }, { message: 'Escribe un promedio de FPS entre 0 y 99999.99.' })),
  resolution: TextUpTo(maxLengths.report.resolution),
  graphics_quality: TextUpTo(maxLengths.report.graphics_quality),
  measurement_method: RequiredText,
})

export const ObservedFailure = Schema.Struct({ failure_type_id: FailureTypeId, detail: RequiredText })

// FormData cannot express an empty array, so a form with no failure rows posts no `failures` key (probe a).
const OptionalFailures = Schema.Array(ObservedFailure).pipe(Schema.withDecodingDefaultKey(Effect.succeed([])))
const RequiredFailures = Schema.Array(ObservedFailure).pipe(
  Schema.refine(Arr.isReadonlyArrayNonEmpty, {
    message: 'Si no inicia o falla, indica al menos un tipo de fallo (usa «otro» si no sabes la causa).',
  }),
  Schema.withDecodingDefaultKey(Effect.succeed([])),
)

const reportFields = {
  edition_id: EditionId,
  diagnostic_id: DiagnosticId,
  layer_version: LayerVersionRef,
  profile_id: Schema.NullOr(ProfileId),
  game_version: Report.fields.game_version,
  launcher_version: OptionalTextUpTo(maxLengths.report.launcher_version),
  tested_at: Schema.DateFromString, // the form's datetime-local value, read in the browser's own zone
  measurement: Schema.NullOr(FpsMeasurement),
  observations: RequiredText,
}

/**
 * One member per literal because a union only picks its member by a single
 * literal field; with a literal set it would try every member and report all their issues.
 */
export const NewReport = Schema.Union([
  ...WorkingOutcome.members.map((outcome) => Schema.Struct({ ...reportFields, outcome, failures: OptionalFailures })),
  ...FailingOutcome.members.map((outcome) => Schema.Struct({ ...reportFields, outcome, failures: RequiredFailures })),
])
export type NewReport = typeof NewReport.Type

export const NewSolution = Schema.Struct({
  report_id: ReportId,
  failure_type_id: FailureTypeId,
  profile_id: Schema.NullOr(ProfileId),
  title: Solution.fields.title,
  instructions: RequiredText,
})
export type NewSolution = typeof NewSolution.Type

export const NewGame = Schema.Struct({
  title: Game.fields.title,
  description: RequiredText,
  editions: Schema.NonEmptyArray(
    Schema.Struct({ launcher_id: LauncherId, external_id: OptionalTextUpTo(maxLengths.game_edition.external_id) }),
  ),
  // Checkboxes named `apis[]`; with none checked the form posts no `apis` key at all.
  apis: Schema.Array(GraphicsApi).pipe(
    Schema.refine(Arr.isReadonlyArrayNonEmpty, { message: 'Marca al menos una API gráfica.' }),
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
  x86_level_min: Game.fields.x86_level_min,
  // The open request this game answers, when a reviewer started from one; creating the game fulfils it.
  request_id: Schema.NullOr(GameRequestId),
})
export type NewGame = typeof NewGame.Type

export const DependencyRef = Schema.Union([
  Schema.TaggedStruct('existente', { id: DependencyId }),
  Schema.TaggedStruct('nueva', { name: Dependency.fields.name, package_manager: Dependency.fields.package_manager, description: RequiredText }),
])

export type DependencyRef = typeof DependencyRef.Type

const NewStep = Schema.Struct({ title: ProfileStep.fields.title, instruction: RequiredText })

const NewProfileDependency = Schema.Struct({
  dependency: DependencyRef,
  required_version: OptionalTextUpTo(maxLengths.profile_dependency.required_version),
  required: Checkbox,
  install_instruction: RequiredText,
})

const profileColumns = {
  title: Profile.fields.title,
  target_game_version: OptionalTextUpTo(maxLengths.profile.target_game_version),
  ram_min_mb: Profile.fields.ram_min_mb,
  vram_min_mb: Profile.fields.vram_min_mb,
  requires_vulkan: Profile.fields.requires_vulkan,
  vulkan_version_min: Schema.NullOr(TextUpTo(maxLengths.profile.vulkan_version_min).check(Schema.isPattern(vulkanVersionPattern))),
  cpu_requirement: OptionalText,
  gpu_requirement: OptionalText,
  launch_options: OptionalText,
}

/** The `profile` columns of `ProfileContent`, the one list the writer and the form's reads use. */
export const profileContentColumns = Struct.keys(profileColumns)

/**
 * What the author of a profile can still change while it is pending and nobody used it. The
 * environment it is for (edition, distribution, layer, architecture) is fixed at birth.
 * Steps keep the order of the form's rows.
 */
export const ProfileContent = Schema.Struct({
  ...profileColumns,
  steps: Schema.Array(NewStep).pipe(
    Schema.refine(Arr.isReadonlyArrayNonEmpty, { message: 'Un perfil necesita al menos un paso.' }),
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
  dependencies: Schema.Array(NewProfileDependency).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
})
export type ProfileContent = typeof ProfileContent.Type

const vulkanMinimumNeedsVulkan = Schema.makeFilter(
  (p: { readonly requires_vulkan: boolean | null; readonly vulkan_version_min: string | null }) => p.vulkan_version_min === null || p.requires_vulkan === true,
  { message: 'Una versión mínima de Vulkan solo cabe si el perfil exige Vulkan.' },
)

export const NewProfile = Schema.Struct({
  edition_id: EditionId,
  distribution_id: DistributionId,
  layer_version: LayerVersionRef,
  architecture: Profile.fields.architecture,
  ...ProfileContent.fields,
}).check(vulkanMinimumNeedsVulkan)
export type NewProfile = typeof NewProfile.Type

export const ProfileEdit = Schema.Struct({ profile_id: ProfileId, ...ProfileContent.fields }).check(vulkanMinimumNeedsVulkan)
export type ProfileEdit = typeof ProfileEdit.Type

export const NewGuide = AdoptionGuide.mapFields(Struct.pick(['type', 'distribution_id', 'title', 'content', 'status']))
export type NewGuide = typeof NewGuide.Type

export const GuideEdit = NewGuide.mapFields(Struct.assign({ guide_id: GuideId }))
export type GuideEdit = typeof GuideEdit.Type

/** "Pídelo": a title and, if known, the Steam store link or App ID. "Sumarme": join an open request. */
export const RequestGame = Schema.Union([
  Schema.TaggedStruct('nuevo', { title: Game.fields.title, steam_app_id: OptionalTextOf(SteamStoreRef) }),
  Schema.TaggedStruct('existente', { id: GameRequestId }),
])
export type RequestGame = typeof RequestGame.Type

export const RejectRequest = Schema.Struct({ id: GameRequestId, reason: RequiredText })
export type RejectRequest = typeof RejectRequest.Type

/** "Rellenar desde Steam" on the new-game form. */
export const SteamLookup = Schema.Struct({ steam_app_id: SteamStoreRef })

const captureFields = {
  captured_at: Schema.DateFromString,
  os_version: Diagnostic.fields.os_version,
  architecture: Diagnostic.fields.architecture,
  cpu_model: Diagnostic.fields.cpu_model,
  gpu_model: Diagnostic.fields.gpu_model,
  ram_mb: Diagnostic.fields.ram_mb,
  vram_mb: Diagnostic.fields.vram_mb,
}

const linuxFields = {
  operating_system: Schema.Literal('Linux'),
  distribution: Schema.Struct({ name: Distribution.fields.name, version: Distribution.fields.version }),
  driver: OptionalTextUpTo(maxLengths.diagnostic.driver),
  driver_version: OptionalTextUpTo(maxLengths.diagnostic.driver_version),
  vulkan_support: VulkanSupport,
  vulkan_version: OptionalTextUpTo(maxLengths.diagnostic.vulkan_version),
}

const detectedFields = {
  gpu_pci_id: Diagnostic.fields.gpu_pci_id,
  steam_library: Diagnostic.fields.steam_library,
  // Only the Linux detector reads these; the Windows detector and older payloads omit them.
  x86_level: Diagnostic.fields.x86_level.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  secure_boot: Diagnostic.fields.secure_boot.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  tpm: Diagnostic.fields.tpm.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  zram_mb: Diagnostic.fields.zram_mb.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  swap_mb: Diagnostic.fields.swap_mb.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
}

const vulkanMessage = 'Solo hay versión de Vulkan si hay soporte.'

const vulkanNeedsSupport = Schema.makeFilter((c: { readonly vulkan_support: VulkanSupport; readonly vulkan_version: string | null }) => c.vulkan_support === 'si' || c.vulkan_version === null, {
  message: vulkanMessage,
})

export const Capture = Schema.Union([
  Schema.Struct({ ...captureFields, ...detectedFields, ...linuxFields }).check(vulkanNeedsSupport),
  Schema.Struct({ ...captureFields, ...detectedFields, operating_system: Schema.Literal('Windows') }),
])
export type Capture = typeof Capture.Type

const manualFields = {
  capturado_en: Schema.DateFromString,
  version_sistema: Diagnostic.fields.os_version,
  arquitectura: Diagnostic.fields.architecture,
  cpu_modelo: Diagnostic.fields.cpu_model,
  gpu_modelo: Diagnostic.fields.gpu_model,
  ram_mb: Diagnostic.fields.ram_mb,
  vram_mb: Diagnostic.fields.vram_mb,
}

const manualVulkanNeedsSupport = Schema.makeFilter((c: { readonly soporte_vulkan: VulkanSupport; readonly version_vulkan: string | null }) => c.soporte_vulkan === 'si' || c.version_vulkan === null, {
  message: vulkanMessage,
})

export const ManualCapture = Schema.Union([
  Schema.Struct({
    ...manualFields,
    sistema: Schema.Literal('Linux'),
    distribucion: Schema.Struct({ nombre: Distribution.fields.name, version: Distribution.fields.version }),
    controlador: OptionalTextUpTo(maxLengths.diagnostic.driver),
    version_controlador: OptionalTextUpTo(maxLengths.diagnostic.driver_version),
    soporte_vulkan: VulkanSupport,
    version_vulkan: OptionalTextUpTo(maxLengths.diagnostic.vulkan_version),
  }).check(manualVulkanNeedsSupport),
  Schema.Struct({ ...manualFields, sistema: Schema.Literal('Windows') }),
])
export type ManualCapture = typeof ManualCapture.Type

// About 30 characters of JSON around each name, then ×2 for base64url (4/3) and the hardware fields.
// PowerShell writes non-ASCII as \uXXXX, so a full library of long non-ASCII names can still exceed it.
const MAX_DETECTOR_TEXT = MAX_LIBRARY_GAMES * (30 + maxLengths.library.name) * 2

export const DiagnosticInput = Schema.Union([
  Schema.TaggedStruct('detector', { texto: Schema.String.pipe(Schema.check(Schema.isMaxLength(MAX_DETECTOR_TEXT))) }),
  Schema.TaggedStruct('manual', { captura: ManualCapture }),
])
export type DiagnosticInput = typeof DiagnosticInput.Type

export const SaveDiagnostic = Schema.Struct({ machine: TargetMachine, input: DiagnosticInput, with_library: Checkbox })

export const CatalogFilter = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  estado: Schema.optionalKey(CompatibilityStatus),
  lanzador: Schema.optionalKey(LauncherId),
  sin_anti_cheat: Schema.optionalKey(Schema.Boolean),
})
export type CatalogFilter = typeof CatalogFilter.Type

export type TestContext = {
  readonly edition_id: EditionId
  readonly layer_version_id: LayerVersionId
  readonly distribution_id: DistributionId
  readonly architecture: string
  readonly game_version: string
}

export const TargetProfile = Profile.mapFields(
  Struct.pick(['edition_id', 'layer_version_id', 'distribution_id', 'architecture', 'target_game_version']),
)
export type TargetProfile = typeof TargetProfile.Type

export const mismatches = (test: TestContext, profile: TargetProfile): ReadonlyArray<Mismatch> => {
  const found: Array<Mismatch> = []
  if (test.edition_id !== profile.edition_id)
    found.push({ aspect: 'edicion', expected: profile.edition_id, actual: test.edition_id })
  if (test.layer_version_id !== profile.layer_version_id)
    found.push({ aspect: 'capa', expected: profile.layer_version_id, actual: test.layer_version_id })
  if (test.distribution_id !== profile.distribution_id)
    found.push({ aspect: 'distribucion', expected: profile.distribution_id, actual: test.distribution_id })
  if (test.architecture !== profile.architecture)
    found.push({ aspect: 'arquitectura', expected: profile.architecture, actual: test.architecture })
  if (profile.target_game_version !== null && test.game_version !== profile.target_game_version)
    found.push({ aspect: 'version_juego', expected: profile.target_game_version, actual: test.game_version })
  return found
}
