// Input schemas for every write, and the 8.7 comparability rule. Isomorphic.
//
// Text fields reuse the row Schemas' "Texto n" (tablas.ts), so an over-long value is a field error in the
// form instead of a varchar overflow on insert.
//
// Each schema is used three times with no copy: the browser form decodes FormData with it
// (field errors before any request), the server fn validator decodes the same Encoded value
// (`Schema.toStandardSchemaV1`), and the handler receives the decoded Type.
import { Array as Arr, Effect, Schema } from 'effect'
import { EstadoCompatibilidad } from './compatibilidad.ts'
import { SoporteVulkan } from './evaluacion.ts'
import type { Discrepancia } from './fallos.ts'
import {
  DiagnosticoId,
  DistribucionId,
  EdicionId,
  EquipoId,
  LanzadorId,
  PerfilId,
  ReporteId,
  Texto,
  TipoFalloId,
  VersionCapaId,
} from './ids.ts'
import { FamiliaCapa, ResultadoFallido, ResultadoFuncional } from './literales.ts'
import { Diagnostico, Distribucion, Equipo, Juego, largo, Reporte, Solucion, TextoHasta, TextoOpcionalHasta, VersionCapa } from './tablas.ts'

/** Round 1 graft: report on a Proton build the seeders missed. Registration upserts on (familia, variante, version). */
export const VersionCapaRef = Schema.Union([
  Schema.TaggedStruct('existente', { id: VersionCapaId }),
  Schema.TaggedStruct('nueva', { familia: FamiliaCapa, variante: VersionCapa.fields.variante, version: VersionCapa.fields.version }),
])

export const EquipoDestino = Schema.Union([
  Schema.TaggedStruct('existente', { id: EquipoId }),
  Schema.TaggedStruct('nuevo', { alias: Equipo.fields.alias }),
])

/** 8.7: FPS is all-or-nothing with its context. A report without a measurement has `medicion: null`, never 0. */
export const MedicionFps = Schema.Struct({
  // numeric(7,2): anything from 100000 up would overflow the column.
  fps_promedio: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 99999.99 }, { message: 'Escribe un promedio de FPS entre 0 y 99999.99.' })),
  resolucion: TextoHasta(largo.reporte.resolucion),
  calidad_grafica: TextoHasta(largo.reporte.calidad_grafica),
  metodo_medicion: Texto,
})

export const FalloObservado = Schema.Struct({ tipo_fallo_id: TipoFalloId, detalle: Texto })

// FormData cannot express an empty array, so a form with no fallos rows posts no `fallos` key (probe a).
const FallosOpcionales = Schema.Array(FalloObservado).pipe(Schema.withDecodingDefaultKey(Effect.succeed([])))
const FallosExigidos = Schema.Array(FalloObservado).pipe(
  Schema.refine(Arr.isReadonlyArrayNonEmpty, {
    message: 'Si no inicia o falla, indica al menos un tipo de fallo (usa «otro» si no sabes la causa).',
  }),
  Schema.withDecodingDefaultKey(Effect.succeed([])),
)

const camposReporte = {
  edicion_id: EdicionId,
  diagnostico_id: DiagnosticoId,
  version_capa: VersionCapaRef,
  perfil_id: Schema.NullOr(PerfilId),
  version_juego: Reporte.fields.version_juego,
  version_lanzador: TextoOpcionalHasta(largo.reporte.version_lanzador),
  fecha_prueba: Schema.DateFromString, // a date-only value parses as UTC midnight (probe a); render it in UTC
  medicion: Schema.NullOr(MedicionFps),
  observaciones: Texto,
}

/**
 * RF-08. The failing-result rule (8.7) is the type: one member per result, and the failing ones
 * require a non-empty `fallos`, so the form shows the message on `fallos` before submitting.
 * One member per literal (not one per half) because a union only picks its member by a single
 * literal field; with a literal set it would try every member and report all their issues.
 * Duplicate fallos: DB PK reporte_fallo_pkey is the home -> Regla fallo_duplicado.
 */
export const NuevoReporte = Schema.Union([
  ...ResultadoFuncional.members.map((resultado) => Schema.Struct({ ...camposReporte, resultado, fallos: FallosOpcionales })),
  ...ResultadoFallido.members.map((resultado) => Schema.Struct({ ...camposReporte, resultado, fallos: FallosExigidos })),
])
export type NuevoReporte = typeof NuevoReporte.Type

export const NuevaSolucion = Schema.Struct({
  reporte_id: ReporteId,
  tipo_fallo_id: TipoFalloId,
  perfil_id: Schema.NullOr(PerfilId),
  titulo: Solucion.fields.titulo,
  instrucciones: Texto,
})
export type NuevaSolucion = typeof NuevaSolucion.Type

/** RF-03, reviewers only. Editions are (lanzador, identificador externo opcional). */
export const NuevoJuego = Schema.Struct({
  titulo: Juego.fields.titulo,
  descripcion: Texto,
  ediciones: Schema.NonEmptyArray(
    Schema.Struct({ lanzador_id: LanzadorId, identificador_externo: TextoOpcionalHasta(largo.edicion_juego.identificador_externo) }),
  ),
})

const camposCaptura = {
  capturado_en: Schema.DateFromString,
  version_sistema: Diagnostico.fields.version_sistema,
  arquitectura: Diagnostico.fields.arquitectura,
  cpu_modelo: Diagnostico.fields.cpu_modelo,
  gpu_modelo: Diagnostico.fields.gpu_modelo,
  ram_mb: Diagnostico.fields.ram_mb,
  vram_mb: Diagnostico.fields.vram_mb,
  controlador: TextoOpcionalHasta(largo.diagnostico.controlador),
  version_controlador: TextoOpcionalHasta(largo.diagnostico.version_controlador),
  soporte_vulkan: SoporteVulkan,
  version_vulkan: TextoOpcionalHasta(largo.diagnostico.version_vulkan),
}

/**
 * The content of one diagnostico row. Two producers: the manual form (decoded with this schema)
 * and servidor/diagnostico/payload.ts (the only detector parser). Linux carries a distribution and
 * Windows has none, as a type (a diagnostico CHECK is the backstop). A Windows
 * capture only orients (8.10); a report needs a Linux one.
 */
export const Captura = Schema.Union([
  Schema.Struct({
    ...camposCaptura,
    sistema: Schema.Literal('Linux'),
    distribucion: Schema.Struct({ nombre: Distribucion.fields.nombre, version: Distribucion.fields.version }), // resolved to distribucion.id by upsert
  }),
  Schema.Struct({ ...camposCaptura, sistema: Schema.Literal('Windows') }),
]).check(
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

/**
 * 8.7 "Condiciones para que un reporte sea comparable". The single home of the rule. Called at save
 * (registrarReporte) and at approval (bloqueosAprobacion), the two moments 8.7 names, and by the
 * report form's loader to offer only comparable profiles. Empty = comparable.
 * Versions are identifiers: exact text equality, no numeric comparison.
 */
export const discrepancias = (prueba: ContextoPrueba, perfil: PerfilObjetivo): ReadonlyArray<Discrepancia> => {
  const encontradas: Array<Discrepancia> = []
  if (prueba.edicion_id !== perfil.edicion_id)
    encontradas.push({ de: 'edicion', esperado: perfil.edicion_id, observado: prueba.edicion_id })
  if (prueba.version_capa_id !== perfil.version_capa_id)
    encontradas.push({ de: 'capa', esperado: perfil.version_capa_id, observado: prueba.version_capa_id })
  if (prueba.distribucion_id !== perfil.distribucion_id)
    encontradas.push({ de: 'distribucion', esperado: perfil.distribucion_id, observado: prueba.distribucion_id })
  if (prueba.arquitectura !== perfil.arquitectura)
    encontradas.push({ de: 'arquitectura', esperado: perfil.arquitectura, observado: prueba.arquitectura })
  if (perfil.version_juego_objetivo !== null && prueba.version_juego !== perfil.version_juego_objetivo)
    encontradas.push({ de: 'version_juego', esperado: perfil.version_juego_objetivo, observado: prueba.version_juego })
  return encontradas
}
