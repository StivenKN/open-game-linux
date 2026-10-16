import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { CompatibilityStatus } from './compatibility.ts'
import { VulkanSupport } from './evaluation.ts'
import type { Mismatch } from './errors.ts'
import {
  Checkbox,
  DiagnosticId,
  DistributionId,
  EditionId,
  MachineId,
  LauncherId,
  ProfileId,
  ReportId,
  RequiredText,
  FailureTypeId,
  LayerVersionId,
} from './ids.ts'
import { GraphicsApi, LayerFamily, FailingOutcome, WorkingOutcome } from './literals.ts'
import { MAX_LIBRARY_GAMES } from './library.ts'
import { maxLengths } from './max-lengths.ts'
import { Diagnostic, Distribution, Machine, Game, Profile, Report, Solution, TextUpTo, OptionalTextUpTo, LayerVersion } from './tables.ts'

export const LayerVersionRef = Schema.Union([
  Schema.TaggedStruct('existente', { id: LayerVersionId }),
  Schema.TaggedStruct('nueva', { familia: LayerFamily, variante: LayerVersion.fields.variante, version: LayerVersion.fields.version }),
])

export const TargetMachine = Schema.Union([
  Schema.TaggedStruct('existente', { id: MachineId }),
  Schema.TaggedStruct('nuevo', { alias: Machine.fields.alias }),
])

export const FpsMeasurement = Schema.Struct({
  fps_promedio: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 99999.99 }, { message: 'Escribe un promedio de FPS entre 0 y 99999.99.' })),
  resolucion: TextUpTo(maxLengths.reporte.resolucion),
  calidad_grafica: TextUpTo(maxLengths.reporte.calidad_grafica),
  metodo_medicion: RequiredText,
})

export const ObservedFailure = Schema.Struct({ tipo_fallo_id: FailureTypeId, detalle: RequiredText })

// FormData cannot express an empty array, so a form with no fallos rows posts no `fallos` key (probe a).
const OptionalFailures = Schema.Array(ObservedFailure).pipe(Schema.withDecodingDefaultKey(Effect.succeed([])))
const RequiredFailures = Schema.Array(ObservedFailure).pipe(
  Schema.refine(Arr.isReadonlyArrayNonEmpty, {
    message: 'Si no inicia o falla, indica al menos un tipo de fallo (usa «otro» si no sabes la causa).',
  }),
  Schema.withDecodingDefaultKey(Effect.succeed([])),
)

const reportFields = {
  edicion_id: EditionId,
  diagnostico_id: DiagnosticId,
  version_capa: LayerVersionRef,
  perfil_id: Schema.NullOr(ProfileId),
  version_juego: Report.fields.version_juego,
  version_lanzador: OptionalTextUpTo(maxLengths.reporte.version_lanzador),
  fecha_prueba: Schema.DateFromString, // the form's datetime-local value, read in the browser's own zone
  medicion: Schema.NullOr(FpsMeasurement),
  observaciones: RequiredText,
}

/**
 * One member per literal because a union only picks its member by a single
 * literal field; with a literal set it would try every member and report all their issues.
 */
export const NewReport = Schema.Union([
  ...WorkingOutcome.members.map((outcome) => Schema.Struct({ ...reportFields, resultado: outcome, fallos: OptionalFailures })),
  ...FailingOutcome.members.map((outcome) => Schema.Struct({ ...reportFields, resultado: outcome, fallos: RequiredFailures })),
])
export type NewReport = typeof NewReport.Type

export const NewSolution = Schema.Struct({
  reporte_id: ReportId,
  tipo_fallo_id: FailureTypeId,
  perfil_id: Schema.NullOr(ProfileId),
  titulo: Solution.fields.titulo,
  instrucciones: RequiredText,
})
export type NewSolution = typeof NewSolution.Type

export const NewGame = Schema.Struct({
  titulo: Game.fields.titulo,
  descripcion: RequiredText,
  ediciones: Schema.NonEmptyArray(
    Schema.Struct({ lanzador_id: LauncherId, identificador_externo: OptionalTextUpTo(maxLengths.edicion_juego.identificador_externo) }),
  ),
  // Checkboxes named `apis[]`; with none checked the form posts no `apis` key at all.
  apis: Schema.Array(GraphicsApi).pipe(
    Schema.refine(Arr.isReadonlyArrayNonEmpty, { message: 'Marca al menos una API gráfica.' }),
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
  nivel_x86_min: Game.fields.nivel_x86_min,
})
export type NewGame = typeof NewGame.Type

const captureFields = {
  capturado_en: Schema.DateFromString,
  version_sistema: Diagnostic.fields.version_sistema,
  arquitectura: Diagnostic.fields.arquitectura,
  cpu_modelo: Diagnostic.fields.cpu_modelo,
  gpu_modelo: Diagnostic.fields.gpu_modelo,
  ram_mb: Diagnostic.fields.ram_mb,
  vram_mb: Diagnostic.fields.vram_mb,
}

const linuxFields = {
  sistema: Schema.Literal('Linux'),
  distribucion: Schema.Struct({ nombre: Distribution.fields.nombre, version: Distribution.fields.version }),
  controlador: OptionalTextUpTo(maxLengths.diagnostico.controlador),
  version_controlador: OptionalTextUpTo(maxLengths.diagnostico.version_controlador),
  soporte_vulkan: VulkanSupport,
  version_vulkan: OptionalTextUpTo(maxLengths.diagnostico.version_vulkan),
}

const detectedFields = {
  gpu_pci_id: Diagnostic.fields.gpu_pci_id,
  biblioteca_steam: Diagnostic.fields.biblioteca_steam,
  // Only the Linux detector reads these; the Windows detector and older payloads omit them.
  nivel_x86: Diagnostic.fields.nivel_x86.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  arranque_seguro: Diagnostic.fields.arranque_seguro.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  tpm: Diagnostic.fields.tpm.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  zram_mb: Diagnostic.fields.zram_mb.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  swap_mb: Diagnostic.fields.swap_mb.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
}

const vulkanNeedsSupport = Schema.makeFilter((c: { readonly soporte_vulkan: VulkanSupport; readonly version_vulkan: string | null }) => c.soporte_vulkan === 'si' || c.version_vulkan === null, {
  message: 'Solo hay versión de Vulkan si hay soporte.',
})

export const Capture = Schema.Union([
  Schema.Struct({ ...captureFields, ...detectedFields, ...linuxFields }).check(vulkanNeedsSupport),
  Schema.Struct({ ...captureFields, ...detectedFields, sistema: Schema.Literal('Windows') }),
])
export type Capture = typeof Capture.Type

export const ManualCapture = Schema.Union([
  Schema.Struct({ ...captureFields, ...linuxFields }).check(vulkanNeedsSupport),
  Schema.Struct({ ...captureFields, sistema: Schema.Literal('Windows') }),
])

// About 30 characters of JSON around each name, then ×2 for base64url (4/3) and the hardware fields.
// PowerShell writes non-ASCII as \uXXXX, so a full library of long non-ASCII names can still exceed it.
const MAX_DETECTOR_TEXT = MAX_LIBRARY_GAMES * (30 + maxLengths.biblioteca.nombre) * 2

export const DiagnosticInput = Schema.Union([
  Schema.TaggedStruct('detector', { texto: Schema.String.pipe(Schema.check(Schema.isMaxLength(MAX_DETECTOR_TEXT))) }),
  Schema.TaggedStruct('manual', { captura: ManualCapture }),
])
export type DiagnosticInput = typeof DiagnosticInput.Type

export const SaveDiagnostic = Schema.Struct({ equipo: TargetMachine, entrada: DiagnosticInput, con_biblioteca: Checkbox })

export const CatalogFilter = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  estado: Schema.optionalKey(CompatibilityStatus),
  lanzador: Schema.optionalKey(LauncherId),
  sin_anti_cheat: Schema.optionalKey(Schema.Boolean),
})
export type CatalogFilter = typeof CatalogFilter.Type

export type TestContext = {
  readonly edicion_id: EditionId
  readonly version_capa_id: LayerVersionId
  readonly distribucion_id: DistributionId
  readonly arquitectura: string
  readonly version_juego: string
}

export const TargetProfile = Profile.mapFields(
  Struct.pick(['edicion_id', 'version_capa_id', 'distribucion_id', 'arquitectura', 'version_juego_objetivo']),
)
export type TargetProfile = typeof TargetProfile.Type

export const mismatches = (test: TestContext, profile: TargetProfile): ReadonlyArray<Mismatch> => {
  const found: Array<Mismatch> = []
  if (test.edicion_id !== profile.edicion_id)
    found.push({ aspect: 'edicion', expected: profile.edicion_id, actual: test.edicion_id })
  if (test.version_capa_id !== profile.version_capa_id)
    found.push({ aspect: 'capa', expected: profile.version_capa_id, actual: test.version_capa_id })
  if (test.distribucion_id !== profile.distribucion_id)
    found.push({ aspect: 'distribucion', expected: profile.distribucion_id, actual: test.distribucion_id })
  if (test.arquitectura !== profile.arquitectura)
    found.push({ aspect: 'arquitectura', expected: profile.arquitectura, actual: test.arquitectura })
  if (profile.version_juego_objetivo !== null && test.version_juego !== profile.version_juego_objetivo)
    found.push({ aspect: 'version_juego', expected: profile.version_juego_objetivo, actual: test.version_juego })
  return found
}
