// 8.10 "Cómo se obtiene la compatibilidad". Pure and isomorphic. Nothing here is ever stored.
import { Schema } from 'effect'
import { DistribucionId, EdicionId, PerfilId, ReporteId, VersionCapaId } from './ids.ts'

/** reporte.resultado. The DB CHECK is generated from `Resultado.literals` (servidor/esquema). */
export const Resultado = Schema.Literals(['funciona', 'funciona_con_ajustes', 'no_inicia', 'falla_en_ejecucion'])
export type Resultado = typeof Resultado.Type

/** The computed state of a set of APPROVED results: the four results plus the two set-only states. */
export const EstadoCompatibilidad = Schema.Literals([
  'sin_evidencia',
  'funciona',
  'funciona_con_ajustes',
  'no_inicia',
  'falla_en_ejecucion',
  'resultados_variables',
])
export type EstadoCompatibilidad = typeof EstadoCompatibilidad.Type

/** Round 1 graft: an explicit map, so renaming a Resultado cannot silently change a state. */
const estadoDeResultado = {
  funciona: 'funciona',
  funciona_con_ajustes: 'funciona_con_ajustes',
  no_inicia: 'no_inicia',
  falla_en_ejecucion: 'falla_en_ejecucion',
} as const satisfies Record<Resultado, EstadoCompatibilidad>

/** 8.7: failing results need >= 1 reporte_fallo. Its negation is 8.9's "resultado funcional". */
export const exigeFallo = {
  funciona: false,
  funciona_con_ajustes: false,
  no_inicia: true,
  falla_en_ejecucion: true,
} as const satisfies Record<Resultado, boolean>

/**
 * THE result-set rule. Every grain calls it: catalog row, ficha headline, environment row,
 * "en tu distribución". No SQL CASE re-implements it.
 *   no results -> sin_evidencia; one distinct -> its state; two or more distinct -> resultados_variables
 */
export const estadoDe = (resultados: Iterable<Resultado>): EstadoCompatibilidad => {
  const distintos = new Set(resultados)
  if (distintos.size === 0) return 'sin_evidencia'
  if (distintos.size > 1) return 'resultados_variables'
  const [unico] = distintos
  return unico === undefined ? 'sin_evidencia' : estadoDeResultado[unico]
}

/**
 * One APPROVED report, flattened with its 8.10 grouping key and display labels.
 * This schema decodes the rows of the one summary query (servidor/consultas/ficha.ts).
 * `estado_revision: Literal('aprobado')` makes the name a proof: a pending row fails the decode,
 * so pending evidence cannot reach the summary even if someone edits the WHERE clause.
 */
export const PruebaAprobada = Schema.Struct({
  reporte_id: ReporteId,
  estado_revision: Schema.Literal('aprobado'),
  edicion_id: EdicionId,
  lanzador: Schema.String,
  version_juego: Schema.String,
  distribucion_id: DistribucionId,
  distribucion: Schema.String, // "Linux Mint 21.3"
  version_capa_id: VersionCapaId,
  capa: Schema.String, // "Proton 8.0-5"
  perfil_id: Schema.NullOr(PerfilId),
  perfil: Schema.NullOr(Schema.String), // "GTAV-BAJO r2"
  resultado: Resultado,
  fecha_prueba: Schema.Date,
  // numeric(7,2) arrives as text from the driver (verify in U1 probe-tipos; swap to Schema.Finite if not).
  fps_promedio: Schema.NullOr(Schema.FiniteFromString),
  resolucion: Schema.NullOr(Schema.String),
  calidad_grafica: Schema.NullOr(Schema.String),
  metodo_medicion: Schema.NullOr(Schema.String),
  fallos: Schema.Array(Schema.String), // tipo_fallo.codigo via array_agg
})
export type PruebaAprobada = typeof PruebaAprobada.Type

export type FalloContado = { readonly codigo: string; readonly reportes: number }
/** Measured FPS averaged per (resolucion, calidad). Never one mixed average, never an estimate. */
export type FpsMedido = {
  readonly resolucion: string
  readonly calidad: string
  readonly promedio: number
  readonly mediciones: number
}

export type EntornoProbado = Pick<
  PruebaAprobada,
  'edicion_id' | 'lanzador' | 'version_juego' | 'distribucion_id' | 'distribucion' | 'version_capa_id' | 'capa' | 'perfil_id' | 'perfil'
> & {
  readonly clave: string
  readonly estado: EstadoCompatibilidad
  readonly pruebas: number
  readonly por_resultado: Partial<Record<Resultado, number>>
  readonly ultima_prueba: Date
  readonly fallos: ReadonlyArray<FalloContado>
  readonly fps: ReadonlyArray<FpsMedido>
}

/**
 * One value feeds all three verdict presentations (veredicto variant 1 + variant 2's line):
 * badge = estado + pruebas + ultima_prueba, matrix = entornos, personal = enDistribucion(...).
 */
export type ResumenCompatibilidad = {
  readonly estado: EstadoCompatibilidad
  readonly pruebas: number
  readonly ultima_prueba: Date | null
  readonly entornos: ReadonlyArray<EntornoProbado> // newest ultima_prueba first
  readonly fallos: ReadonlyArray<FalloContado>
}

/**
 * Groups by the 8.10 key (edición, versión del juego, distribución, capa, perfil) and applies
 * `estadoDe` per group and over the whole set. FPS rows without full context cannot exist (DB CHECK
 * reporte_fps_con_contexto), so a non-null fps_promedio always has resolucion and calidad.
 */
export const resumir = (pruebas: ReadonlyArray<PruebaAprobada>): ResumenCompatibilidad => {
  void pruebas
  throw new Error('not implemented')
}

/** The same summary restricted to one distribution ("En tu distribución"). Re-derives from entornos; no query. */
export const enDistribucion = (resumen: ResumenCompatibilidad, distribucion: DistribucionId): ResumenCompatibilidad => {
  void resumen
  void distribucion
  throw new Error('not implemented')
}
