import { Schema } from 'effect'
import { SteamLibrary } from './library.ts'
import { OperatingSystem, VulkanSupport } from './evaluation.ts'
import { PciId } from './gpu.ts'
import { GuideStatus, GuideType } from './guides.ts'
import {
  DependencyId,
  DiagnosticId,
  DistributionId,
  EditionId,
  MachineId,
  GuideId,
  GameId,
  LauncherId,
  ProfileId,
  ReportId,
  SolutionId,
  RequiredText,
  OptionalTextOf,
  FailureTypeId,
  UserId,
  LayerVersionId,
} from './ids.ts'
import { maxLengths } from './max-lengths.ts'
import { GraphicsApi, LayerFamily, Outcome, ProtonVariant } from './literals.ts'
import { SecureBoot, X86Level, Tpm } from './platform.ts'
import { ReviewStatus, Role } from './review.ts'

export const TextUpTo = (n: number) => RequiredText.pipe(Schema.check(Schema.isMaxLength(n)))

export const OptionalTextUpTo = (n: number) => OptionalTextOf(TextUpTo(n))

const Positive = Schema.Int.check(Schema.isGreaterThan(0))
const NonNegative = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** Created by better-auth (server/schema/auth.ts). `image` is better-auth's own unmapped column. */
export const User = Schema.Struct({
  id: UserId,
  alias: TextUpTo(maxLengths.usuario.alias),
  correo: TextUpTo(maxLengths.usuario.correo),
  correo_verificado: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
  creado_en: Schema.Date,
  actualizado_en: Schema.Date,
  rol: Role,
  activo: Schema.Boolean,
})
export type User = typeof User.Type

export const Machine = Schema.Struct({
  id: MachineId,
  usuario_id: UserId,
  alias: TextUpTo(maxLengths.equipo.alias),
  creado_en: Schema.Date,
})
export type Machine = typeof Machine.Type

export const Diagnostic = Schema.Struct({
  id: DiagnosticId,
  equipo_id: MachineId,
  capturado_en: Schema.Date,
  sistema: OperatingSystem,
  version_sistema: TextUpTo(maxLengths.diagnostico.version_sistema),
  distribucion_id: Schema.NullOr(DistributionId),
  arquitectura: TextUpTo(maxLengths.diagnostico.arquitectura),
  cpu_modelo: TextUpTo(maxLengths.diagnostico.cpu_modelo),
  gpu_modelo: TextUpTo(maxLengths.diagnostico.gpu_modelo),
  ram_mb: Positive,
  vram_mb: Schema.NullOr(NonNegative),
  controlador: Schema.NullOr(TextUpTo(maxLengths.diagnostico.controlador)),
  version_controlador: Schema.NullOr(TextUpTo(maxLengths.diagnostico.version_controlador)),
  soporte_vulkan: VulkanSupport,
  version_vulkan: Schema.NullOr(TextUpTo(maxLengths.diagnostico.version_vulkan)),
  gpu_pci_id: Schema.NullOr(PciId),
  biblioteca_steam: Schema.NullOr(SteamLibrary),
  // NULL: not captured (old detectors, Windows, the manual form).
  nivel_x86: Schema.NullOr(X86Level),
  arranque_seguro: Schema.NullOr(SecureBoot),
  tpm: Schema.NullOr(Tpm),
  zram_mb: Schema.NullOr(NonNegative),
  swap_mb: Schema.NullOr(NonNegative),
})
export type Diagnostic = typeof Diagnostic.Type

export const Game = Schema.Struct({
  id: GameId,
  titulo: TextUpTo(maxLengths.juego.titulo),
  descripcion: RequiredText,
  nivel_x86_min: Schema.NullOr(X86Level),
  actualizado_en: Schema.Date,
})
export type Game = typeof Game.Type

/** One row per graphics API the game can render with; no rows means unknown. */
export const GameApi = Schema.Struct({ juego_id: GameId, api: GraphicsApi })
export type GameApi = typeof GameApi.Type

export const Launcher = Schema.Struct({
  id: LauncherId,
  nombre: TextUpTo(maxLengths.lanzador.nombre),
  url_oficial: Schema.NullOr(TextUpTo(maxLengths.lanzador.url_oficial)),
})
export type Launcher = typeof Launcher.Type

export const GameEdition = Schema.Struct({
  id: EditionId,
  juego_id: GameId,
  lanzador_id: LauncherId,
  identificador_externo: Schema.NullOr(TextUpTo(maxLengths.edicion_juego.identificador_externo)),
  actualizado_en: Schema.Date,
})
export type GameEdition = typeof GameEdition.Type

export const Distribution = Schema.Struct({
  id: DistributionId,
  nombre: TextUpTo(maxLengths.distribucion.nombre),
  version: TextUpTo(maxLengths.distribucion.version),
  url_oficial: Schema.NullOr(TextUpTo(maxLengths.distribucion.url_oficial)),
})
export type Distribution = typeof Distribution.Type

export const LayerVersion = Schema.Struct({
  id: LayerVersionId,
  familia: LayerFamily,
  variante: TextUpTo(maxLengths.version_capa.variante),
  version: TextUpTo(maxLengths.version_capa.version),
})
export type LayerVersion = typeof LayerVersion.Type

export const ReviewFields = Schema.Struct({
  estado_revision: ReviewStatus,
  revisor_id: Schema.NullOr(UserId),
  revisado_en: Schema.NullOr(Schema.Date),
  motivo_revision: Schema.NullOr(RequiredText),
  evidencia_revision: Schema.NullOr(RequiredText),
})
export type ReviewFields = typeof ReviewFields.Type

export const Profile = Schema.Struct({
  id: ProfileId,
  edicion_id: EditionId,
  distribucion_id: DistributionId,
  version_capa_id: LayerVersionId,
  autor_id: UserId,
  arquitectura: TextUpTo(maxLengths.perfil_configuracion.arquitectura),
  revision: Positive,
  titulo: TextUpTo(maxLengths.perfil_configuracion.titulo),
  version_juego_objetivo: Schema.NullOr(TextUpTo(maxLengths.perfil_configuracion.version_juego_objetivo)),
  ram_min_mb: Schema.NullOr(Positive),
  vram_min_mb: Schema.NullOr(NonNegative),
  requiere_vulkan: Schema.NullOr(Schema.Boolean),
  version_vulkan_min: Schema.NullOr(TextUpTo(maxLengths.perfil_configuracion.version_vulkan_min)),
  condicion_cpu: Schema.NullOr(RequiredText),
  condicion_gpu: Schema.NullOr(RequiredText),
  parametros_lanzamiento: Schema.NullOr(RequiredText),
  creado_en: Schema.Date,
  ...ReviewFields.fields,
})
export type Profile = typeof Profile.Type

export const ProfileStep = Schema.Struct({
  perfil_id: ProfileId,
  orden: Positive,
  titulo: TextUpTo(maxLengths.paso_configuracion.titulo),
  instruccion: RequiredText,
})
export type ProfileStep = typeof ProfileStep.Type

export const Dependency = Schema.Struct({
  id: DependencyId,
  nombre: TextUpTo(maxLengths.dependencia.nombre),
  gestor: TextUpTo(maxLengths.dependencia.gestor),
  descripcion: RequiredText,
})
export type Dependency = typeof Dependency.Type

export const ProfileDependency = Schema.Struct({
  perfil_id: ProfileId,
  dependencia_id: DependencyId,
  version_requerida: Schema.NullOr(TextUpTo(maxLengths.perfil_dependencia.version_requerida)),
  obligatoria: Schema.Boolean,
  instruccion_instalacion: RequiredText,
})
export type ProfileDependency = typeof ProfileDependency.Type

export const FailureType = Schema.Struct({
  id: FailureTypeId,
  codigo: TextUpTo(maxLengths.tipo_fallo.codigo),
  descripcion: RequiredText,
})
export type FailureType = typeof FailureType.Type

export const Report = Schema.Struct({
  id: ReportId,
  edicion_id: EditionId,
  diagnostico_id: DiagnosticId,
  version_capa_id: LayerVersionId,
  perfil_id: Schema.NullOr(ProfileId),
  version_juego: TextUpTo(maxLengths.reporte.version_juego),
  version_lanzador: Schema.NullOr(TextUpTo(maxLengths.reporte.version_lanzador)),
  fecha_prueba: Schema.Date,
  resultado: Outcome,
  fps_promedio: Schema.NullOr(Schema.FiniteFromString), // numeric(7,2) arrives as text (probes.md (c))
  resolucion: Schema.NullOr(TextUpTo(maxLengths.reporte.resolucion)),
  calidad_grafica: Schema.NullOr(TextUpTo(maxLengths.reporte.calidad_grafica)),
  metodo_medicion: Schema.NullOr(RequiredText),
  observaciones: RequiredText,
  creado_en: Schema.Date,
  ...ReviewFields.fields,
})
export type Report = typeof Report.Type

export const ReportFailure = Schema.Struct({
  reporte_id: ReportId,
  tipo_fallo_id: FailureTypeId,
  detalle: RequiredText,
})
export type ReportFailure = typeof ReportFailure.Type

export const Solution = Schema.Struct({
  id: SolutionId,
  reporte_id: ReportId,
  tipo_fallo_id: FailureTypeId,
  autor_id: UserId,
  perfil_id: Schema.NullOr(ProfileId),
  titulo: TextUpTo(maxLengths.solucion.titulo),
  instrucciones: RequiredText,
  creado_en: Schema.Date,
  ...ReviewFields.fields,
})
export type Solution = typeof Solution.Type

export const AdoptionGuide = Schema.Struct({
  id: GuideId,
  autor_id: UserId,
  distribucion_id: Schema.NullOr(DistributionId),
  tipo: GuideType,
  titulo: TextUpTo(maxLengths.guia_adopcion.titulo),
  contenido: RequiredText,
  revision: Positive,
  estado: GuideStatus,
  creado_en: Schema.Date,
  actualizado_en: Schema.Date,
})
export type AdoptionGuide = typeof AdoptionGuide.Type

/** One Steam edition's aggregate of a ProtonDB export. Never individual reports (8.9). */
export const ProtonDbSummary = Schema.Struct({
  edicion_id: EditionId,
  exportado_en: Schema.Date,
  reportes_total: Positive,
  recientes: NonNegative,
  recientes_funcionan: NonNegative,
  modestos_recientes: NonNegative,
  modestos_funcionan: NonNegative,
  ultimo_reporte: Schema.Date,
  capa_variante: Schema.NullOr(ProtonVariant),
  capa_version: Schema.NullOr(TextUpTo(maxLengths.protondb_resumen.capa_version)),
  capa_reportes: NonNegative,
})
export type ProtonDbSummary = typeof ProtonDbSummary.Type
