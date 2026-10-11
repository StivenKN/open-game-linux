import { Schema } from 'effect'
import { DistribucionId, EdicionId, PerfilId, ReporteId, VersionCapaId } from './ids.ts'
import { Resultado } from './literales.ts'

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
  readonly por_resultado: Partial<Record<Resultado, number>>
  readonly ultima_prueba: Date
  readonly fallos: ReadonlyArray<FalloContado>
  readonly fps: ReadonlyArray<FpsMedido>
}

export type ResumenCompatibilidad = {
  readonly estado: EstadoCompatibilidad
  readonly pruebas: number
  readonly ultima_prueba: Date | null
  readonly entornos: ReadonlyArray<EntornoProbado>
  readonly fallos: ReadonlyArray<FalloContado>
}

export const resumir = (pruebas: ReadonlyArray<PruebaAprobada>): ResumenCompatibilidad =>
  combinar(agrupar(pruebas, claveDe).map(entorno))

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
