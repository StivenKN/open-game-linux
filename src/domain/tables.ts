import { Schema } from 'effect'
import { BibliotecaSteam } from './library.ts'
import { Sistema, SoporteVulkan } from './evaluation.ts'
import { PciId } from './gpu.ts'
import { EstadoGuia, TipoGuia } from './guides.ts'
import {
  DependenciaId,
  DiagnosticoId,
  DistribucionId,
  EdicionId,
  EquipoId,
  GuiaId,
  JuegoId,
  LanzadorId,
  PerfilId,
  ReporteId,
  SolucionId,
  Texto,
  TextoOpcionalDe,
  TipoFalloId,
  UsuarioId,
  VersionCapaId,
} from './ids.ts'
import { largo } from './max-lengths.ts'
import { ApiGrafica, FamiliaCapa, Resultado, VarianteProton } from './literals.ts'
import { ArranqueSeguro, NivelX86, Tpm } from './platform.ts'
import { EstadoRevision, Rol } from './review.ts'

export const TextoHasta = (n: number) => Texto.pipe(Schema.check(Schema.isMaxLength(n)))

export const TextoOpcionalHasta = (n: number) => TextoOpcionalDe(TextoHasta(n))

const Positivo = Schema.Int.check(Schema.isGreaterThan(0))
const NoNegativo = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** Created by better-auth (server/schema/auth.ts). `image` is better-auth's own unmapped column. */
export const Usuario = Schema.Struct({
  id: UsuarioId,
  alias: TextoHasta(largo.usuario.alias),
  correo: TextoHasta(largo.usuario.correo),
  correo_verificado: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
  creado_en: Schema.Date,
  actualizado_en: Schema.Date,
  rol: Rol,
  activo: Schema.Boolean,
})
export type Usuario = typeof Usuario.Type

export const Equipo = Schema.Struct({
  id: EquipoId,
  usuario_id: UsuarioId,
  alias: TextoHasta(largo.equipo.alias),
  creado_en: Schema.Date,
})
export type Equipo = typeof Equipo.Type

export const Diagnostico = Schema.Struct({
  id: DiagnosticoId,
  equipo_id: EquipoId,
  capturado_en: Schema.Date,
  sistema: Sistema,
  version_sistema: TextoHasta(largo.diagnostico.version_sistema),
  distribucion_id: Schema.NullOr(DistribucionId),
  arquitectura: TextoHasta(largo.diagnostico.arquitectura),
  cpu_modelo: TextoHasta(largo.diagnostico.cpu_modelo),
  gpu_modelo: TextoHasta(largo.diagnostico.gpu_modelo),
  ram_mb: Positivo,
  vram_mb: Schema.NullOr(NoNegativo),
  controlador: Schema.NullOr(TextoHasta(largo.diagnostico.controlador)),
  version_controlador: Schema.NullOr(TextoHasta(largo.diagnostico.version_controlador)),
  soporte_vulkan: SoporteVulkan,
  version_vulkan: Schema.NullOr(TextoHasta(largo.diagnostico.version_vulkan)),
  gpu_pci_id: Schema.NullOr(PciId),
  biblioteca_steam: Schema.NullOr(BibliotecaSteam),
  // NULL: not captured (old detectors, Windows, the manual form).
  nivel_x86: Schema.NullOr(NivelX86),
  arranque_seguro: Schema.NullOr(ArranqueSeguro),
  tpm: Schema.NullOr(Tpm),
  zram_mb: Schema.NullOr(NoNegativo),
  swap_mb: Schema.NullOr(NoNegativo),
})
export type Diagnostico = typeof Diagnostico.Type

export const Juego = Schema.Struct({
  id: JuegoId,
  titulo: TextoHasta(largo.juego.titulo),
  descripcion: Texto,
  nivel_x86_min: Schema.NullOr(NivelX86),
  actualizado_en: Schema.Date,
})
export type Juego = typeof Juego.Type

/** One row per graphics API the game can render with; no rows means unknown. */
export const JuegoApi = Schema.Struct({ juego_id: JuegoId, api: ApiGrafica })
export type JuegoApi = typeof JuegoApi.Type

export const Lanzador = Schema.Struct({
  id: LanzadorId,
  nombre: TextoHasta(largo.lanzador.nombre),
  url_oficial: Schema.NullOr(TextoHasta(largo.lanzador.url_oficial)),
})
export type Lanzador = typeof Lanzador.Type

export const EdicionJuego = Schema.Struct({
  id: EdicionId,
  juego_id: JuegoId,
  lanzador_id: LanzadorId,
  identificador_externo: Schema.NullOr(TextoHasta(largo.edicion_juego.identificador_externo)),
  actualizado_en: Schema.Date,
})
export type EdicionJuego = typeof EdicionJuego.Type

export const Distribucion = Schema.Struct({
  id: DistribucionId,
  nombre: TextoHasta(largo.distribucion.nombre),
  version: TextoHasta(largo.distribucion.version),
  url_oficial: Schema.NullOr(TextoHasta(largo.distribucion.url_oficial)),
})
export type Distribucion = typeof Distribucion.Type

export const VersionCapa = Schema.Struct({
  id: VersionCapaId,
  familia: FamiliaCapa,
  variante: TextoHasta(largo.version_capa.variante),
  version: TextoHasta(largo.version_capa.version),
})
export type VersionCapa = typeof VersionCapa.Type

export const BloqueRevision = Schema.Struct({
  estado_revision: EstadoRevision,
  revisor_id: Schema.NullOr(UsuarioId),
  revisado_en: Schema.NullOr(Schema.Date),
  motivo_revision: Schema.NullOr(Texto),
  evidencia_revision: Schema.NullOr(Texto),
})
export type BloqueRevision = typeof BloqueRevision.Type

export const PerfilConfiguracion = Schema.Struct({
  id: PerfilId,
  edicion_id: EdicionId,
  distribucion_id: DistribucionId,
  version_capa_id: VersionCapaId,
  autor_id: UsuarioId,
  arquitectura: TextoHasta(largo.perfil_configuracion.arquitectura),
  revision: Positivo,
  titulo: TextoHasta(largo.perfil_configuracion.titulo),
  version_juego_objetivo: Schema.NullOr(TextoHasta(largo.perfil_configuracion.version_juego_objetivo)),
  ram_min_mb: Schema.NullOr(Positivo),
  vram_min_mb: Schema.NullOr(NoNegativo),
  requiere_vulkan: Schema.NullOr(Schema.Boolean),
  version_vulkan_min: Schema.NullOr(TextoHasta(largo.perfil_configuracion.version_vulkan_min)),
  condicion_cpu: Schema.NullOr(Texto),
  condicion_gpu: Schema.NullOr(Texto),
  parametros_lanzamiento: Schema.NullOr(Texto),
  creado_en: Schema.Date,
  ...BloqueRevision.fields,
})
export type PerfilConfiguracion = typeof PerfilConfiguracion.Type

export const PasoConfiguracion = Schema.Struct({
  perfil_id: PerfilId,
  orden: Positivo,
  titulo: TextoHasta(largo.paso_configuracion.titulo),
  instruccion: Texto,
})
export type PasoConfiguracion = typeof PasoConfiguracion.Type

export const Dependencia = Schema.Struct({
  id: DependenciaId,
  nombre: TextoHasta(largo.dependencia.nombre),
  gestor: TextoHasta(largo.dependencia.gestor),
  descripcion: Texto,
})
export type Dependencia = typeof Dependencia.Type

export const PerfilDependencia = Schema.Struct({
  perfil_id: PerfilId,
  dependencia_id: DependenciaId,
  version_requerida: Schema.NullOr(TextoHasta(largo.perfil_dependencia.version_requerida)),
  obligatoria: Schema.Boolean,
  instruccion_instalacion: Texto,
})
export type PerfilDependencia = typeof PerfilDependencia.Type

export const TipoFallo = Schema.Struct({
  id: TipoFalloId,
  codigo: TextoHasta(largo.tipo_fallo.codigo),
  descripcion: Texto,
})
export type TipoFallo = typeof TipoFallo.Type

export const Reporte = Schema.Struct({
  id: ReporteId,
  edicion_id: EdicionId,
  diagnostico_id: DiagnosticoId,
  version_capa_id: VersionCapaId,
  perfil_id: Schema.NullOr(PerfilId),
  version_juego: TextoHasta(largo.reporte.version_juego),
  version_lanzador: Schema.NullOr(TextoHasta(largo.reporte.version_lanzador)),
  fecha_prueba: Schema.Date,
  resultado: Resultado,
  fps_promedio: Schema.NullOr(Schema.FiniteFromString), // numeric(7,2) arrives as text (probes.md (c))
  resolucion: Schema.NullOr(TextoHasta(largo.reporte.resolucion)),
  calidad_grafica: Schema.NullOr(TextoHasta(largo.reporte.calidad_grafica)),
  metodo_medicion: Schema.NullOr(Texto),
  observaciones: Texto,
  creado_en: Schema.Date,
  ...BloqueRevision.fields,
})
export type Reporte = typeof Reporte.Type

export const ReporteFallo = Schema.Struct({
  reporte_id: ReporteId,
  tipo_fallo_id: TipoFalloId,
  detalle: Texto,
})
export type ReporteFallo = typeof ReporteFallo.Type

export const Solucion = Schema.Struct({
  id: SolucionId,
  reporte_id: ReporteId,
  tipo_fallo_id: TipoFalloId,
  autor_id: UsuarioId,
  perfil_id: Schema.NullOr(PerfilId),
  titulo: TextoHasta(largo.solucion.titulo),
  instrucciones: Texto,
  creado_en: Schema.Date,
  ...BloqueRevision.fields,
})
export type Solucion = typeof Solucion.Type

export const GuiaAdopcion = Schema.Struct({
  id: GuiaId,
  autor_id: UsuarioId,
  distribucion_id: Schema.NullOr(DistribucionId),
  tipo: TipoGuia,
  titulo: TextoHasta(largo.guia_adopcion.titulo),
  contenido: Texto,
  revision: Positivo,
  estado: EstadoGuia,
  creado_en: Schema.Date,
  actualizado_en: Schema.Date,
})
export type GuiaAdopcion = typeof GuiaAdopcion.Type

/** One Steam edition's aggregate of a ProtonDB export. Never individual reports (8.9). */
export const ProtonDbResumen = Schema.Struct({
  edicion_id: EdicionId,
  exportado_en: Schema.Date,
  reportes_total: Positivo,
  recientes: NoNegativo,
  recientes_funcionan: NoNegativo,
  modestos_recientes: NoNegativo,
  modestos_funcionan: NoNegativo,
  ultimo_reporte: Schema.Date,
  capa_variante: Schema.NullOr(VarianteProton),
  capa_version: Schema.NullOr(TextoHasta(largo.protondb_resumen.capa_version)),
  capa_reportes: NoNegativo,
})
export type ProtonDbResumen = typeof ProtonDbResumen.Type
