// 8.10 "Cómo se obtiene la compatibilidad". Pure and isomorphic. Nothing here is ever stored.
import { Schema } from 'effect'
import { DistribucionId, EdicionId, PerfilId, ReporteId, VersionCapaId } from './ids.ts'

/** reporte.resultado. The DB CHECK is generated from `Resultado.literals` (servidor/esquema). */
export const Resultado = Schema.Literals(['funciona', 'funciona_con_ajustes', 'no_inicia', 'falla_en_ejecucion'])
export type Resultado = typeof Resultado.Type

/** 8.9's "resultado funcional": what a profile's approval needs from at least one approved report. */
export const ResultadoFuncional = Resultado.pick(['funciona', 'funciona_con_ajustes'])
export type ResultadoFuncional = typeof ResultadoFuncional.Type

/** 8.7: these results need >= 1 reporte_fallo. NuevoReporte gives them a non-empty `fallos` type. */
export const ResultadoFallido = Resultado.pick(['no_inicia', 'falla_en_ejecucion'])
export type ResultadoFallido = typeof ResultadoFallido.Type

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

/** 8.7 as a lookup. `satisfies` ties it to ResultadoFuncional and ResultadoFallido at compile time. */
export const exigeFallo = {
  funciona: false,
  funciona_con_ajustes: false,
  no_inicia: true,
  falla_en_ejecucion: true,
} as const satisfies Record<ResultadoFuncional, false> & Record<ResultadoFallido, true>

/**
 * THE result-set rule. Every grain calls it: catalog row, ficha headline, environment row,
 * "en tu distribución". No SQL CASE re-implements it.
 *   no results -> sin_evidencia; one distinct -> its state; two or more distinct -> resultados_variables
 */
export const estadoDe = (resultados: Iterable<Resultado>): EstadoCompatibilidad => {
  const [unico, ...resto] = new Set(resultados)
  if (unico === undefined) return 'sin_evidencia'
  return resto.length === 0 ? estadoDeResultado[unico] : 'resultados_variables'
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
  // numeric(7,2) arrives as text from the driver (probe c).
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
export const resumir = (pruebas: ReadonlyArray<PruebaAprobada>): ResumenCompatibilidad =>
  combinar(agrupar(pruebas, claveDe).map(entorno))

/** The same summary restricted to one distribution ("En tu distribución"). Re-derives from entornos; no query. */
export const enDistribucion = (resumen: ResumenCompatibilidad, distribucion: DistribucionId): ResumenCompatibilidad =>
  combinar(resumen.entornos.filter((e) => e.distribucion_id === distribucion))

const claveDe = (p: PruebaAprobada): string =>
  JSON.stringify([p.edicion_id, p.version_juego, p.distribucion_id, p.version_capa_id, p.perfil_id])

const entorno = (pruebas: readonly [PruebaAprobada, ...PruebaAprobada[]]): EntornoProbado => {
  const [p] = pruebas
  const por_resultado: Partial<Record<Resultado, number>> = {}
  for (const { resultado } of pruebas) por_resultado[resultado] = (por_resultado[resultado] ?? 0) + 1
  return {
    clave: claveDe(p),
    edicion_id: p.edicion_id,
    lanzador: p.lanzador,
    version_juego: p.version_juego,
    distribucion_id: p.distribucion_id,
    distribucion: p.distribucion,
    version_capa_id: p.version_capa_id,
    capa: p.capa,
    perfil_id: p.perfil_id,
    perfil: p.perfil,
    estado: estadoDe(pruebas.map((x) => x.resultado)),
    pruebas: pruebas.length,
    por_resultado,
    ultima_prueba: new Date(Math.max(...pruebas.map((x) => x.fecha_prueba.getTime()))),
    fallos: contarFallos(pruebas.flatMap((x) => x.fallos.map((codigo) => ({ codigo, reportes: 1 })))),
    fps: fpsPorContexto(pruebas),
  }
}

/** Builds a summary from environment rows. resumir and enDistribucion share it, so they cannot disagree. */
const combinar = (entornos: ReadonlyArray<EntornoProbado>): ResumenCompatibilidad => {
  const fechas = entornos.map((e) => e.ultima_prueba.getTime())
  return {
    estado: estadoDe(entornos.flatMap((e) => Resultado.literals.filter((r) => (e.por_resultado[r] ?? 0) > 0))),
    pruebas: entornos.reduce((n, e) => n + e.pruebas, 0),
    ultima_prueba: fechas.length === 0 ? null : new Date(Math.max(...fechas)),
    entornos: [...entornos].sort((a, b) => b.ultima_prueba.getTime() - a.ultima_prueba.getTime() || a.clave.localeCompare(b.clave)),
    fallos: contarFallos(entornos.flatMap((e) => e.fallos)),
  }
}

/** Sums counts per codigo; most reported first. Entornos partition the reports, so their counts add up. */
const contarFallos = (conteos: ReadonlyArray<FalloContado>): ReadonlyArray<FalloContado> =>
  agrupar(conteos, (f) => f.codigo)
    .map(([f, ...resto]) => ({ codigo: f.codigo, reportes: resto.reduce((n, x) => n + x.reportes, f.reportes) }))
    .sort((a, b) => b.reportes - a.reportes || a.codigo.localeCompare(b.codigo))

const fpsPorContexto = (pruebas: ReadonlyArray<PruebaAprobada>): ReadonlyArray<FpsMedido> =>
  agrupar(
    pruebas.flatMap(({ fps_promedio, resolucion, calidad_grafica }) =>
      fps_promedio === null || resolucion === null || calidad_grafica === null
        ? []
        : [{ fps: fps_promedio, resolucion, calidad: calidad_grafica }],
    ),
    (m) => JSON.stringify([m.resolucion, m.calidad]),
  ).map((grupo) => ({
    resolucion: grupo[0].resolucion,
    calidad: grupo[0].calidad,
    promedio: grupo.reduce((n, m) => n + m.fps, 0) / grupo.length,
    mediciones: grupo.length,
  }))

/** Insertion-ordered groups; each group is non-empty by construction. */
const agrupar = <T>(elementos: ReadonlyArray<T>, clave: (x: T) => string): ReadonlyArray<readonly [T, ...T[]]> => {
  const grupos = new Map<string, [T, ...T[]]>()
  for (const x of elementos) {
    const k = clave(x)
    const grupo = grupos.get(k)
    if (grupo === undefined) grupos.set(k, [x])
    else grupo.push(x)
  }
  return [...grupos.values()]
}
