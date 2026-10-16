import { Schema } from 'effect'
import { DistributionId, EditionId, ProfileId, ReportId, LayerVersionId } from './ids.ts'
import { Outcome, FailingOutcome, WorkingOutcome } from './literals.ts'
import { isRecent } from './recency.ts'

export const CompatibilityStatus = Schema.Literals([
  'sin_evidencia',
  'funciona',
  'funciona_con_ajustes',
  'no_inicia',
  'falla_en_ejecucion',
  'resultados_variables',
])
export type CompatibilityStatus = typeof CompatibilityStatus.Type

const statusByOutcome = {
  funciona: 'funciona',
  funciona_con_ajustes: 'funciona_con_ajustes',
  no_inicia: 'no_inicia',
  falla_en_ejecucion: 'falla_en_ejecucion',
} as const satisfies Record<Outcome, CompatibilityStatus>

export const statusOf = (outcomes: Iterable<Outcome>): CompatibilityStatus => {
  const [only, ...rest] = new Set(outcomes)
  if (only === undefined) return 'sin_evidencia'
  return rest.length === 0 ? statusByOutcome[only] : 'resultados_variables'
}

export const ApprovedTest = Schema.Struct({
  reporte_id: ReportId,
  estado_revision: Schema.Literal('aprobado'),
  edicion_id: EditionId,
  lanzador: Schema.String,
  version_juego: Schema.String,
  distribucion_id: DistributionId,
  distribucion: Schema.String,
  version_capa_id: LayerVersionId,
  capa: Schema.String,
  perfil_id: Schema.NullOr(ProfileId),
  perfil: Schema.NullOr(Schema.String),
  resultado: Outcome,
  fecha_prueba: Schema.Date,
  // numeric(7,2) arrives as text from the driver (probe c).
  fps_promedio: Schema.NullOr(Schema.FiniteFromString),
  resolucion: Schema.NullOr(Schema.String),
  calidad_grafica: Schema.NullOr(Schema.String),
  metodo_medicion: Schema.NullOr(Schema.String),
  fallos: Schema.Array(Schema.String),
})
export type ApprovedTest = typeof ApprovedTest.Type

export type FailureCount = { readonly code: string; readonly reports: number }
export type MeasuredFps = {
  readonly resolution: string
  readonly quality: string
  readonly average: number
  readonly samples: number
}

export type TestedSetup = Pick<
  ApprovedTest,
  'edicion_id' | 'lanzador' | 'version_juego' | 'distribucion_id' | 'distribucion' | 'version_capa_id' | 'capa' | 'perfil_id' | 'perfil'
> & {
  readonly key: string
  readonly status: CompatibilityStatus
  readonly test_count: number
  readonly recent_count: number
  readonly by_outcome: Partial<Record<Outcome, number>>
  readonly last_tested: Date
  readonly failures: ReadonlyArray<FailureCount>
  readonly fps: ReadonlyArray<MeasuredFps>
}

/** An edition whose newest approved test fails after an earlier one worked. */
export type Regression = Pick<ApprovedTest, 'edicion_id' | 'lanzador' | 'fecha_prueba' | 'version_juego' | 'capa'> & {
  readonly resultado: FailingOutcome
}

export type CompatibilitySummary = {
  readonly status: CompatibilityStatus
  readonly test_count: number
  readonly recent_count: number
  /** Every approved test is older than a year, so `status` comes from stale evidence. */
  readonly no_recent_confirmation: boolean
  readonly last_tested: Date | null
  readonly setups: ReadonlyArray<TestedSetup>
  readonly failures: ReadonlyArray<FailureCount>
  readonly regressions: ReadonlyArray<Regression>
}

/**
 * The one state function for the game page and the catalog. State, result counts and causes come from the
 * tests of the last year when there is any, else from all of them; totals, dates and FPS from all.
 */
export const summarize = (tests: ReadonlyArray<ApprovedTest>, now: Date): CompatibilitySummary => {
  const { recent, base } = baseOf(tests, now)
  const setups = groupBy(tests, keyOf)
    .map((group) => testedSetup(group, now))
    .sort((a, b) => b.last_tested.getTime() - a.last_tested.getTime() || a.key.localeCompare(b.key))
  return {
    status: statusOf(base.map((p) => p.resultado)),
    test_count: tests.length,
    recent_count: recent.length,
    no_recent_confirmation: tests.length > 0 && recent.length === 0,
    last_tested: setups[0]?.last_tested ?? null,
    setups,
    failures: countFailures(base),
    regressions: groupBy(tests, (p) => String(p.edicion_id))
      .flatMap(regressionOf)
      .sort((a, b) => b.fecha_prueba.getTime() - a.fecha_prueba.getTime()),
  }
}

export const onDistribution = (tests: ReadonlyArray<ApprovedTest>, distribution: DistributionId, now: Date): CompatibilitySummary =>
  summarize(tests.filter((p) => p.distribucion_id === distribution), now)

const baseOf = (tests: ReadonlyArray<ApprovedTest>, now: Date) => {
  const recent = tests.filter((p) => isRecent(p.fecha_prueba, now))
  return { recent, base: recent.length > 0 ? recent : tests }
}

// Tests at the same instant are ordered by id, the order they were registered in.
const newest = (tests: readonly [ApprovedTest, ...ApprovedTest[]]): ApprovedTest =>
  tests.reduce((a, b) => ((b.fecha_prueba.getTime() - a.fecha_prueba.getTime() || b.reporte_id - a.reporte_id) > 0 ? b : a))

const keyOf = (p: ApprovedTest): string =>
  JSON.stringify([p.edicion_id, p.version_juego, p.distribucion_id, p.version_capa_id, p.perfil_id])

const testedSetup = (tests: readonly [ApprovedTest, ...ApprovedTest[]], now: Date): TestedSetup => {
  const [p] = tests
  const { recent, base } = baseOf(tests, now)
  const by_outcome: Partial<Record<Outcome, number>> = {}
  for (const { resultado } of base) by_outcome[resultado] = (by_outcome[resultado] ?? 0) + 1
  return {
    key: keyOf(p),
    edicion_id: p.edicion_id,
    lanzador: p.lanzador,
    version_juego: p.version_juego,
    distribucion_id: p.distribucion_id,
    distribucion: p.distribucion,
    version_capa_id: p.version_capa_id,
    capa: p.capa,
    perfil_id: p.perfil_id,
    perfil: p.perfil,
    status: statusOf(base.map((x) => x.resultado)),
    test_count: tests.length,
    recent_count: recent.length,
    by_outcome,
    last_tested: newest(tests).fecha_prueba,
    failures: countFailures(base),
    fps: fpsBySetting(tests),
  }
}

const isFailing = Schema.is(FailingOutcome)
const isWorking = Schema.is(WorkingOutcome)

const regressionOf = (tests: readonly [ApprovedTest, ...ApprovedTest[]]): ReadonlyArray<Regression> => {
  const latest = newest(tests)
  const { resultado } = latest
  if (!isFailing(resultado) || !tests.some((p) => p !== latest && isWorking(p.resultado))) return []
  const { edicion_id, lanzador, fecha_prueba, version_juego, capa } = latest
  return [{ edicion_id, lanzador, fecha_prueba, version_juego, capa, resultado }]
}

const countFailures = (tests: ReadonlyArray<ApprovedTest>): ReadonlyArray<FailureCount> =>
  groupBy(tests.flatMap((p) => p.fallos), (code) => code)
    .map((group) => ({ code: group[0], reports: group.length }))
    .sort((a, b) => b.reports - a.reports || a.code.localeCompare(b.code))

const fpsBySetting = (tests: ReadonlyArray<ApprovedTest>): ReadonlyArray<MeasuredFps> =>
  groupBy(
    tests.flatMap(({ fps_promedio, resolucion, calidad_grafica }) =>
      fps_promedio === null || resolucion === null || calidad_grafica === null
        ? []
        : [{ fps: fps_promedio, resolucion, quality: calidad_grafica }],
    ),
    (m) => JSON.stringify([m.resolucion, m.quality]),
  ).map((group) => ({
    resolution: group[0].resolucion,
    quality: group[0].quality,
    average: group.reduce((n, m) => n + m.fps, 0) / group.length,
    samples: group.length,
  }))

const groupBy = <T>(items: ReadonlyArray<T>, key: (x: T) => string): ReadonlyArray<readonly [T, ...T[]]> => {
  const groups = new Map<string, [T, ...T[]]>()
  for (const x of items) {
    const k = key(x)
    const group = groups.get(k)
    if (group === undefined) groups.set(k, [x])
    else group.push(x)
  }
  return [...groups.values()]
}
