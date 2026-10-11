// Input schemas for every write, and the 8.7 comparability rule. Isomorphic.
//
// Each schema is used three times with no copy: the browser form decodes FormData with it
// (field errors before any request), the server fn validator decodes the same Encoded value
// (`Schema.toStandardSchemaV1`), and the handler receives the decoded Type.
import { Schema } from 'effect'
import { exigeFallo, EstadoCompatibilidad, Resultado } from './compatibilidad.ts'
import { Sistema, SoporteVulkan } from './evaluacion.ts'
import type { Regla } from './fallos.ts'
import {
  DiagnosticoId,
  DistribucionId,
  EdicionId,
  EquipoId,
  LanzadorId,
  PerfilId,
  ReporteId,
  Texto,
  TextoOpcional,
  TipoFalloId,
  VersionCapaId,
} from './ids.ts'

/** version_capa.familia. 'Nativo' is round 1 open decision 2's default (native Linux titles). */
export const FamiliaCapa = Schema.Literals(['Wine', 'Proton', 'Nativo'])
export type FamiliaCapa = typeof FamiliaCapa.Type

/** Round 1 graft: report on a Proton build the seeders missed. Registration upserts on (familia, variante, version). */
export const VersionCapaRef = Schema.Union([
  Schema.TaggedStruct('existente', { id: VersionCapaId }),
  Schema.TaggedStruct('nueva', { familia: FamiliaCapa, variante: Texto, version: Texto }),
])

export const EquipoDestino = Schema.Union([
  Schema.TaggedStruct('existente', { id: EquipoId }),
  Schema.TaggedStruct('nuevo', { alias: Texto }),
])

/** 8.7: FPS is all-or-nothing with its context. A report without a measurement has `medicion: null`, never 0. */
export const MedicionFps = Schema.Struct({
  fps_promedio: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  resolucion: Texto,
  calidad_grafica: Texto,
  metodo_medicion: Texto,
})

export const FalloObservado = Schema.Struct({ tipo_fallo_id: TipoFalloId, detalle: Texto })

/** RF-08. The failing-result rule (8.7) lives here, so the form shows it on `fallos` before submitting. */
export const NuevoReporte = Schema.Struct({
  edicion_id: EdicionId,
  diagnostico_id: DiagnosticoId,
  version_capa: VersionCapaRef,
  perfil_id: Schema.NullOr(PerfilId),
  version_juego: Texto,
  version_lanzador: TextoOpcional,
  fecha_prueba: Schema.DateFromString,
  resultado: Resultado,
  fallos: Schema.Array(FalloObservado), // duplicates: DB PK reporte_fallo_pkey is the home -> Regla fallo duplicado
  medicion: Schema.NullOr(MedicionFps),
  observaciones: Texto,
}).check(
  Schema.makeFilter((r) => !exigeFallo[r.resultado] || r.fallos.length > 0, {
    message: 'Si no inicia o falla, indica al menos un tipo de fallo (usa «otro» si no sabes la causa).',
    // TODO(U2): attach the issue to path ['fallos'] so useEnvio places it on that field.
  }),
)
export type NuevoReporte = typeof NuevoReporte.Type

export const NuevaSolucion = Schema.Struct({
  reporte_id: ReporteId,
  tipo_fallo_id: TipoFalloId,
  perfil_id: Schema.NullOr(PerfilId),
  titulo: Texto,
  instrucciones: Texto,
})
export type NuevaSolucion = typeof NuevaSolucion.Type

/** RF-03, reviewers only. Editions are (lanzador, identificador externo opcional). */
export const NuevoJuego = Schema.Struct({
  titulo: Texto,
  descripcion: Texto,
  ediciones: Schema.NonEmptyArray(Schema.Struct({ lanzador_id: LanzadorId, identificador_externo: TextoOpcional })),
})

/**
 * The content of one diagnostico row. Two producers: the manual form (decoded with this schema)
 * and servidor/diagnostico/payload.ts (the only detector parser). Mirrors the diagnostico CHECKs.
 */
export const Captura = Schema.Struct({
  capturado_en: Schema.DateFromString,
  sistema: Sistema,
  version_sistema: Texto,
  distribucion: Schema.NullOr(Schema.Struct({ nombre: Texto, version: Texto })), // resolved to distribucion.id by upsert
  arquitectura: Texto,
  cpu_modelo: Texto,
  gpu_modelo: Texto,
  ram_mb: Schema.Int.check(Schema.isGreaterThan(0)),
  vram_mb: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  controlador: TextoOpcional,
  version_controlador: TextoOpcional,
  soporte_vulkan: SoporteVulkan,
  version_vulkan: TextoOpcional,
}).check(
  Schema.makeFilter((c) => (c.sistema === 'Linux') === (c.distribucion !== null), {
    message: 'Linux necesita distribución; Windows no la lleva.',
  }),
  Schema.makeFilter((c) => c.soporte_vulkan === 'si' || c.version_vulkan === null, {
    message: 'Solo hay versión de Vulkan si hay soporte.',
  }),
)
export type Captura = typeof Captura.Type

/**
 * What reaches the server from /diagnostico and /diagnostico/importar. The browser never parses
 * `texto` (fragment value, base64url, raw JSON or a whole URL); it posts it untouched.
 */
export const EntradaDiagnostico = Schema.Union([
  Schema.TaggedStruct('detector', { texto: Schema.String }),
  Schema.TaggedStruct('manual', { captura: Captura }),
])
export type EntradaDiagnostico = typeof EntradaDiagnostico.Type

export const GuardarDiagnostico = Schema.Struct({ equipo: EquipoDestino, entrada: EntradaDiagnostico })

/** Catalog search params (wireframe 9.1 filters that section 8 can back). Used as the route's validateSearch. */
export const FiltroCatalogo = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  estado: Schema.optionalKey(EstadoCompatibilidad),
  lanzador: Schema.optionalKey(LanzadorId),
  sin_anti_cheat: Schema.optionalKey(Schema.Boolean),
})
export type FiltroCatalogo = typeof FiltroCatalogo.Type

// ------------------------------------------------------------------ 8.7 comparability

/** The report side: its own columns plus distro and arch read from its diagnostico. */
export type ContextoPrueba = {
  readonly edicion_id: EdicionId
  readonly version_capa_id: VersionCapaId
  readonly distribucion_id: DistribucionId
  readonly arquitectura: string
  readonly version_juego: string
}

export type PerfilObjetivo = Omit<ContextoPrueba, 'version_juego'> & { readonly version_juego_objetivo: string | null }

type Discrepancia = Extract<Regla, `perfil_${string}`>

/**
 * 8.7 "Condiciones para que un reporte sea comparable". The single home of the rule. Called at save
 * (registrarReporte) and at approval (bloqueosAprobacion), the two moments 8.7 names, and by the
 * report form's loader to offer only comparable profiles. Empty = comparable.
 * Versions are identifiers: exact text equality, no numeric comparison.
 */
export const discrepancias = (prueba: ContextoPrueba, perfil: PerfilObjetivo): ReadonlyArray<Discrepancia> => {
  void prueba
  void perfil
  throw new Error('not implemented')
}
