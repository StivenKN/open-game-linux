import { Schema } from 'effect'
import { DistribucionId, EdicionId, PerfilId, ReporteId, VersionCapaId } from './ids.ts'
import { Resultado, ResultadoFallido, ResultadoFuncional } from './literales.ts'
import { esVigente } from './vigencia.ts'

export const EstadoCompatibilidad = Schema.Literals([
  'sin_evidencia',
  'funciona',
  'funciona_con_ajustes',
  'no_inicia',
  'falla_en_ejecucion',
  'resultados_variables',
])
export type EstadoCompatibilidad = typeof EstadoCompatibilidad.Type

const estadoDeResultado = {
  funciona: 'funciona',
  funciona_con_ajustes: 'funciona_con_ajustes',
  no_inicia: 'no_inicia',
  falla_en_ejecucion: 'falla_en_ejecucion',
} as const satisfies Record<Resultado, EstadoCompatibilidad>

export const estadoDe = (resultados: Iterable<Resultado>): EstadoCompatibilidad => {
  const [unico, ...resto] = new Set(resultados)
  if (unico === undefined) return 'sin_evidencia'
  return resto.length === 0 ? estadoDeResultado[unico] : 'resultados_variables'
}

export const PruebaAprobada = Schema.Struct({
  reporte_id: ReporteId,
  estado_revision: Schema.Literal('aprobado'),
  edicion_id: EdicionId,
  lanzador: Schema.String,
  version_juego: Schema.String,
  distribucion_id: DistribucionId,
  distribucion: Schema.String,
  version_capa_id: VersionCapaId,
  capa: Schema.String,
  perfil_id: Schema.NullOr(PerfilId),
  perfil: Schema.NullOr(Schema.String),
  resultado: Resultado,
  fecha_prueba: Schema.Date,
  // numeric(7,2) arrives as text from the driver (probe c).
  fps_promedio: Schema.NullOr(Schema.FiniteFromString),
  resolucion: Schema.NullOr(Schema.String),
  calidad_grafica: Schema.NullOr(Schema.String),
  metodo_medicion: Schema.NullOr(Schema.String),
  fallos: Schema.Array(Schema.String),
})
export type PruebaAprobada = typeof PruebaAprobada.Type

export type FalloContado = { readonly codigo: string; readonly reportes: number }
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
  readonly vigentes: number
  readonly por_resultado: Partial<Record<Resultado, number>>
  readonly ultima_prueba: Date
  readonly fallos: ReadonlyArray<FalloContado>
  readonly fps: ReadonlyArray<FpsMedido>
}

/** An edition whose newest approved test fails after an earlier one worked. */
export type Regresion = Pick<PruebaAprobada, 'edicion_id' | 'lanzador' | 'fecha_prueba' | 'version_juego' | 'capa'> & {
  readonly resultado: ResultadoFallido
}

export type ResumenCompatibilidad = {
  readonly estado: EstadoCompatibilidad
  readonly pruebas: number
  readonly vigentes: number
  /** Every approved test is older than a year, so `estado` comes from stale evidence. */
  readonly sin_confirmacion_reciente: boolean
  readonly ultima_prueba: Date | null
  readonly entornos: ReadonlyArray<EntornoProbado>
  readonly fallos: ReadonlyArray<FalloContado>
  readonly regresiones: ReadonlyArray<Regresion>
}

/**
 * The one state function for the ficha and the catalog. State, result counts and causes come from the
 * tests of the last year when there is any, else from all of them; totals, dates and FPS from all.
 */
export const resumir = (pruebas: ReadonlyArray<PruebaAprobada>, ahora: Date): ResumenCompatibilidad => {
  const { vigentes, base } = baseDe(pruebas, ahora)
  const entornos = agrupar(pruebas, claveDe)
    .map((grupo) => entorno(grupo, ahora))
    .sort((a, b) => b.ultima_prueba.getTime() - a.ultima_prueba.getTime() || a.clave.localeCompare(b.clave))
  return {
    estado: estadoDe(base.map((p) => p.resultado)),
    pruebas: pruebas.length,
    vigentes: vigentes.length,
    sin_confirmacion_reciente: pruebas.length > 0 && vigentes.length === 0,
    ultima_prueba: entornos[0]?.ultima_prueba ?? null,
    entornos,
    fallos: contarFallos(base),
    regresiones: agrupar(pruebas, (p) => String(p.edicion_id))
      .flatMap(regresionDe)
      .sort((a, b) => b.fecha_prueba.getTime() - a.fecha_prueba.getTime()),
  }
}

export const enDistribucion = (pruebas: ReadonlyArray<PruebaAprobada>, distribucion: DistribucionId, ahora: Date): ResumenCompatibilidad =>
  resumir(pruebas.filter((p) => p.distribucion_id === distribucion), ahora)

const baseDe = (pruebas: ReadonlyArray<PruebaAprobada>, ahora: Date) => {
  const vigentes = pruebas.filter((p) => esVigente(p.fecha_prueba, ahora))
  return { vigentes, base: vigentes.length > 0 ? vigentes : pruebas }
}

// Tests at the same instant are ordered by id, the order they were registered in.
const masReciente = (pruebas: readonly [PruebaAprobada, ...PruebaAprobada[]]): PruebaAprobada =>
  pruebas.reduce((a, b) => ((b.fecha_prueba.getTime() - a.fecha_prueba.getTime() || b.reporte_id - a.reporte_id) > 0 ? b : a))

const claveDe = (p: PruebaAprobada): string =>
  JSON.stringify([p.edicion_id, p.version_juego, p.distribucion_id, p.version_capa_id, p.perfil_id])

const entorno = (pruebas: readonly [PruebaAprobada, ...PruebaAprobada[]], ahora: Date): EntornoProbado => {
  const [p] = pruebas
  const { vigentes, base } = baseDe(pruebas, ahora)
  const por_resultado: Partial<Record<Resultado, number>> = {}
  for (const { resultado } of base) por_resultado[resultado] = (por_resultado[resultado] ?? 0) + 1
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
    estado: estadoDe(base.map((x) => x.resultado)),
    pruebas: pruebas.length,
    vigentes: vigentes.length,
    por_resultado,
    ultima_prueba: masReciente(pruebas).fecha_prueba,
    fallos: contarFallos(base),
    fps: fpsPorContexto(pruebas),
  }
}

const esFallido = Schema.is(ResultadoFallido)
const esFuncional = Schema.is(ResultadoFuncional)

const regresionDe = (pruebas: readonly [PruebaAprobada, ...PruebaAprobada[]]): ReadonlyArray<Regresion> => {
  const ultima = masReciente(pruebas)
  const { resultado } = ultima
  if (!esFallido(resultado) || !pruebas.some((p) => p !== ultima && esFuncional(p.resultado))) return []
  const { edicion_id, lanzador, fecha_prueba, version_juego, capa } = ultima
  return [{ edicion_id, lanzador, fecha_prueba, version_juego, capa, resultado }]
}

const contarFallos = (pruebas: ReadonlyArray<PruebaAprobada>): ReadonlyArray<FalloContado> =>
  agrupar(pruebas.flatMap((p) => p.fallos), (codigo) => codigo)
    .map((grupo) => ({ codigo: grupo[0], reportes: grupo.length }))
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
