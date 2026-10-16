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
  report_id: ReportId,
  review_status: Schema.Literal('aprobado'),
  edition_id: EditionId,
  launcher: Schema.String,
  game_version: Schema.String,
  distribution_id: DistributionId,
  distribution: Schema.String,
  layer_version_id: LayerVersionId,
  layer: Schema.String,
  profile_id: Schema.NullOr(ProfileId),
  profile: Schema.NullOr(Schema.String),
  outcome: Outcome,
  tested_at: Schema.Date,
  // numeric(7,2) arrives as text from the driver (probe c).
  avg_fps: Schema.NullOr(Schema.FiniteFromString),
  resolution: Schema.NullOr(Schema.String),
  graphics_quality: Schema.NullOr(Schema.String),
  measurement_method: Schema.NullOr(Schema.String),
  failures: Schema.Array(Schema.String),
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
  'edition_id' | 'launcher' | 'game_version' | 'distribution_id' | 'distribution' | 'layer_version_id' | 'layer' | 'profile_id' | 'profile'
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
export type Regression = Pick<ApprovedTest, 'edition_id' | 'launcher' | 'tested_at' | 'game_version' | 'layer'> & {
  readonly outcome: FailingOutcome
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
    status: statusOf(base.map((p) => p.outcome)),
    test_count: tests.length,
    recent_count: recent.length,
    no_recent_confirmation: tests.length > 0 && recent.length === 0,
    last_tested: setups[0]?.last_tested ?? null,
    setups,
    failures: countFailures(base),
    regressions: groupBy(tests, (p) => String(p.edition_id))
      .flatMap(regressionOf)
      .sort((a, b) => b.tested_at.getTime() - a.tested_at.getTime()),
  }
}

export const onDistribution = (tests: ReadonlyArray<ApprovedTest>, distribution: DistributionId, now: Date): CompatibilitySummary =>
  summarize(tests.filter((p) => p.distribution_id === distribution), now)

const baseOf = (tests: ReadonlyArray<ApprovedTest>, now: Date) => {
  const recent = tests.filter((p) => isRecent(p.tested_at, now))
  return { recent, base: recent.length > 0 ? recent : tests }
}

// Tests at the same instant are ordered by id, the order they were registered in.
const newest = (tests: readonly [ApprovedTest, ...ApprovedTest[]]): ApprovedTest =>
  tests.reduce((a, b) => ((b.tested_at.getTime() - a.tested_at.getTime() || b.report_id - a.report_id) > 0 ? b : a))

const keyOf = (p: ApprovedTest): string =>
  JSON.stringify([p.edition_id, p.game_version, p.distribution_id, p.layer_version_id, p.profile_id])

const testedSetup = (tests: readonly [ApprovedTest, ...ApprovedTest[]], now: Date): TestedSetup => {
  const [p] = tests
  const { recent, base } = baseOf(tests, now)
  const by_outcome: Partial<Record<Outcome, number>> = {}
  for (const { outcome } of base) by_outcome[outcome] = (by_outcome[outcome] ?? 0) + 1
  return {
    key: keyOf(p),
    edition_id: p.edition_id,
    launcher: p.launcher,
    game_version: p.game_version,
    distribution_id: p.distribution_id,
    distribution: p.distribution,
    layer_version_id: p.layer_version_id,
    layer: p.layer,
    profile_id: p.profile_id,
    profile: p.profile,
    status: statusOf(base.map((x) => x.outcome)),
    test_count: tests.length,
    recent_count: recent.length,
    by_outcome,
    last_tested: newest(tests).tested_at,
    failures: countFailures(base),
    fps: fpsBySetting(tests),
  }
}

const isFailing = Schema.is(FailingOutcome)
const isWorking = Schema.is(WorkingOutcome)

const regressionOf = (tests: readonly [ApprovedTest, ...ApprovedTest[]]): ReadonlyArray<Regression> => {
  const latest = newest(tests)
  const { outcome } = latest
  if (!isFailing(outcome) || !tests.some((p) => p !== latest && isWorking(p.outcome))) return []
  const { edition_id, launcher, tested_at, game_version, layer } = latest
  return [{ edition_id, launcher, tested_at, game_version, layer, outcome }]
}

const countFailures = (tests: ReadonlyArray<ApprovedTest>): ReadonlyArray<FailureCount> =>
  groupBy(tests.flatMap((p) => p.failures), (code) => code)
    .map((group) => ({ code: group[0], reports: group.length }))
    .sort((a, b) => b.reports - a.reports || a.code.localeCompare(b.code))

const fpsBySetting = (tests: ReadonlyArray<ApprovedTest>): ReadonlyArray<MeasuredFps> =>
  groupBy(
    tests.flatMap(({ avg_fps, resolution: resolucion, graphics_quality }) =>
      avg_fps === null || resolucion === null || graphics_quality === null
        ? []
        : [{ fps: avg_fps, resolucion, quality: graphics_quality }],
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
