import { describe, expect, it } from '@effect/vitest'
import { type CompatibilityStatus, onDistribution, onSteamDeck, statusOf, type ApprovedTest, summarize, timeline, workedOnSteamDeck } from './compatibility.ts'
import { DistributionId, EditionId, LayerVersionId, ReportId } from './ids.ts'
import type { Outcome } from './literals.ts'
import { ets2, gtaV, valorant } from './samples.ts'
import { isRecent } from './recency.ts'

const now = new Date('2026-10-15T00:00:00Z')

describe('statusOf', () => {
  const cases: ReadonlyArray<readonly [ReadonlyArray<Outcome>, CompatibilityStatus]> = [
    [[], 'sin_evidencia'],
    [['funciona', 'funciona'], 'funciona'],
    [['funciona_con_ajustes'], 'funciona_con_ajustes'],
    [['no_inicia', 'no_inicia'], 'no_inicia'],
    [['falla_en_ejecucion'], 'falla_en_ejecucion'],
    [['funciona', 'funciona_con_ajustes'], 'resultados_variables'],
    [['no_inicia', 'falla_en_ejecucion'], 'resultados_variables'],
    [['funciona', 'no_inicia', 'funciona'], 'resultados_variables'],
  ]
  it.each(cases)('%o -> %s', (outcomes, status) => {
    expect(statusOf(outcomes)).toBe(status)
  })
})

describe('summarize on the sample games', () => {
  it('GTA V: three environments with different results give resultados_variables', () => {
    const r = summarize(gtaV.tests, now)
    expect(r.status).toBe('resultados_variables')
    expect(r.test_count).toBe(4)
    expect(r.last_tested).toEqual(new Date('2026-10-02T12:00:00Z'))
    expect(r.setups.map((e) => [e.distribution, e.layer, e.profile, e.status, e.test_count])).toEqual([
      ['Fedora 40', 'Proton 9.0-3', null, 'falla_en_ejecucion', 1],
      ['Linux Mint 21.3', 'Proton 8.0-5', 'GTAV-BAJO r2', 'funciona', 2],
      ['Arch Linux', 'GE-Proton 9-4', null, 'funciona_con_ajustes', 1],
    ])
    expect(r.failures).toEqual([{ code: 'lanzador', reports: 1 }])
  })

  it('GTA V: an environment counts its results and keeps its newest test date', () => {
    const mint = summarize(gtaV.tests, now).setups.find((e) => e.distribution === 'Linux Mint 21.3')
    expect(mint?.by_outcome).toEqual({ funciona: 2 })
    expect(mint?.last_tested).toEqual(new Date('2026-09-28T12:00:00Z'))
    expect(mint?.fps).toEqual([{ resolution: '1280x720', quality: 'Bajo', average: 54, samples: 1 }])
  })

  it('Valorant: every approved report fails to start, so no_inicia, with anti_cheat counted per report', () => {
    const r = summarize(valorant.tests, now)
    expect(r.status).toBe('no_inicia')
    expect(r.setups).toHaveLength(2)
    expect(r.failures).toEqual([{ code: 'anti_cheat', reports: 2 }])
  })

  it('ETS2: pending reports never reach the summary, so sin_evidencia', () => {
    expect(summarize(ets2.tests, now)).toEqual({
      status: 'sin_evidencia',
      test_count: 0,
      recent_count: 0,
      no_recent_confirmation: false,
      last_tested: null,
      setups: [],
      failures: [],
      regressions: [],
    })
  })
})

describe('summarize FPS', () => {
  const base = gtaV.tests[0]
  const measured = (fps: number, resolution: string, quality: string): ApprovedTest =>
    ({ ...base, avg_fps: fps, resolution, graphics_quality: quality })

  it('averages per (resolucion, calidad) inside one environment, never one mixed average', () => {
    const tests = [measured(50, '1280x720', 'Bajo'), measured(60, '1280x720', 'Bajo'), measured(30, '1920x1080', 'Alto')]
    const [only, ...others] = summarize(tests, now).setups
    expect(others).toEqual([])
    expect(only?.fps).toEqual([
      { resolution: '1280x720', quality: 'Bajo', average: 55, samples: 2 },
      { resolution: '1920x1080', quality: 'Alto', average: 30, samples: 1 },
    ])
  })

  it('the same resolution at another quality is another group', () => {
    const fps = summarize([measured(50, '1280x720', 'Bajo'), measured(40, '1280x720', 'Medio')], now).setups[0]?.fps
    expect(fps?.map((f) => f.quality)).toEqual(['Bajo', 'Medio'])
  })
})

describe('onDistribution', () => {
  it('the Linux Mint 21.3 slice of GTA V is funciona with its two tests', () => {
    const r = onDistribution(gtaV.tests, DistributionId.make(1), now)
    expect(r.status).toBe('funciona')
    expect(r.test_count).toBe(2)
    expect(r.setups.map((e) => e.distribution)).toEqual(['Linux Mint 21.3'])
    expect(r.failures).toEqual([])
  })

  it('a distribution with no approved tests is sin_evidencia', () => {
    expect(onDistribution(gtaV.tests, DistributionId.make(99), now).status).toBe('sin_evidencia')
  })

  it('slices by distribution partition the tests', () => {
    const r = summarize(valorant.tests, now)
    const arch = onDistribution(valorant.tests, DistributionId.make(2), now)
    const mint = onDistribution(valorant.tests, DistributionId.make(1), now)
    expect([arch.status, mint.status]).toEqual(['no_inicia', 'no_inicia'])
    expect(arch.test_count + mint.test_count).toBe(r.test_count)
  })
})

const [gtaMint] = gtaV.tests
const approved = (report_id: number, outcome: Outcome, tested_at: string, changes: Partial<ApprovedTest> = {}): ApprovedTest =>
  ({ ...gtaMint, ...changes, report_id: ReportId.make(report_id), outcome, tested_at: new Date(tested_at), avg_fps: null, failures: changes.failures ?? [] })

describe('isRecent', () => {
  it('a test exactly 365 days old is recent, one millisecond older is not', () => {
    const reference = new Date('2026-10-15T00:00:00Z')
    expect(isRecent(new Date('2025-10-15T00:00:00Z'), reference)).toBe(true)
    expect(isRecent(new Date('2025-10-14T23:59:59.999Z'), reference)).toBe(false)
  })
})

describe('summarize with the 365-day window', () => {
  it('state and causes come only from the tests of the last year; totals and dates from all', () => {
    const r = summarize(gtaV.tests, new Date('2027-10-01T00:00:00Z'))
    expect([r.status, r.test_count, r.recent_count, r.no_recent_confirmation]).toEqual(['falla_en_ejecucion', 4, 1, false])
    expect(r.last_tested).toEqual(new Date('2026-10-02T12:00:00Z'))
    expect(r.failures).toEqual([{ code: 'lanzador', reports: 1 }])
    expect(r.setups.map((e) => [e.distribution, e.test_count, e.recent_count])).toEqual([
      ['Fedora 40', 1, 1],
      ['Linux Mint 21.3', 2, 0],
      ['Arch Linux', 1, 0],
    ])
  })

  it('a cause seen only in stale tests leaves the summary once a recent test exists', () => {
    const recovered = approved(7, 'funciona', '2027-09-01T12:00:00Z', { edition_id: EditionId.make(3) })
    const r = summarize([...valorant.tests, recovered], new Date('2027-10-01T00:00:00Z'))
    expect([r.status, r.recent_count, r.failures]).toEqual(['funciona', 1, []])
  })

  it('with no test from the last year, the state comes from all of them and says so', () => {
    const r = summarize(gtaV.tests, new Date('2028-10-15T00:00:00Z'))
    expect([r.status, r.test_count, r.recent_count, r.no_recent_confirmation]).toEqual(['resultados_variables', 4, 0, true])
    expect(r.failures).toEqual([{ code: 'lanzador', reports: 1 }])
  })

  it('an environment applies the same rule: its stale failure gives way to its recent success', () => {
    const [e, ...others] = summarize(
      [approved(1, 'no_inicia', '2025-01-10T12:00:00Z', { failures: ['lanzador'] }), approved(2, 'funciona', '2026-09-01T12:00:00Z')],
      now,
    ).setups
    expect(others).toEqual([])
    expect([e?.status, e?.test_count, e?.recent_count, e?.by_outcome, e?.failures]).toEqual(['funciona', 2, 1, { funciona: 1 }, []])
  })
})

describe('summarize regressions', () => {
  it('GTA V: the Steam edition newest test fails after earlier ones worked', () => {
    expect(summarize(gtaV.tests, now).regressions).toEqual([
      {
        edition_id: EditionId.make(1),
        launcher: 'Steam',
        tested_at: new Date('2026-10-02T12:00:00Z'),
        game_version: '1.0.3258',
        layer_version_id: LayerVersionId.make(3),
        layer: 'Proton 9.0-3',
        outcome: 'falla_en_ejecucion',
      },
    ])
  })

  it('no window applies: a two-year-old regression is still reported', () => {
    expect(summarize(gtaV.tests, new Date('2028-10-15T00:00:00Z')).regressions).toHaveLength(1)
  })

  it('an edition that never worked has no regression', () => {
    expect(summarize(valorant.tests, now).regressions).toEqual([])
  })

  it('an edition whose newest test works has no regression', () => {
    const withoutFedora = gtaV.tests.filter((p) => p.distribution !== 'Fedora 40')
    expect(summarize(withoutFedora, now).regressions).toEqual([])
  })

  it('two tests on the same instant: the later registered one is the newest', () => {
    const sameDay = '2026-10-01T12:00:00Z'
    expect(summarize([approved(10, 'funciona', sameDay), approved(11, 'no_inicia', sameDay)], now).regressions).toEqual([
      {
        edition_id: EditionId.make(1),
        launcher: 'Steam',
        tested_at: new Date(sameDay),
        game_version: '1.0.3179',
        layer_version_id: LayerVersionId.make(1),
        layer: 'Proton 8.0-5',
        outcome: 'no_inicia',
      },
    ])
    expect(summarize([approved(10, 'no_inicia', sameDay), approved(11, 'funciona', sameDay)], now).regressions).toEqual([])
  })
})

describe('timeline', () => {
  it('GTA V: one step per layer version in the order each was first tested, and the regression on the version that broke', () => {
    expect(timeline(gtaV.tests).map((h) => [h.layer, h.status, h.test_count, h.first_tested, h.last_tested, h.regressions.length])).toEqual([
      ['GE-Proton 9-4', 'funciona_con_ajustes', 1, new Date('2026-09-02T12:00:00Z'), new Date('2026-09-02T12:00:00Z'), 0],
      ['Proton 8.0-5', 'funciona', 2, new Date('2026-09-14T12:00:00Z'), new Date('2026-09-28T12:00:00Z'), 0],
      ['Proton 9.0-3', 'falla_en_ejecucion', 1, new Date('2026-10-02T12:00:00Z'), new Date('2026-10-02T12:00:00Z'), 1],
    ])
    expect(timeline(gtaV.tests).flatMap((h) => h.regressions)).toEqual(summarize(gtaV.tests, now).regressions)
  })

  it('a version groups every edition and setup, and its state is statusOf over all of them, however old', () => {
    const [only, ...others] = timeline([
      approved(1, 'funciona', '2023-01-10T12:00:00Z'),
      approved(2, 'no_inicia', '2026-10-01T12:00:00Z', { edition_id: EditionId.make(2), failures: ['anti_cheat'] }),
    ])
    expect(others).toEqual([])
    expect([only?.status, only?.test_count, only?.first_tested]).toEqual(['resultados_variables', 2, new Date('2023-01-10T12:00:00Z')])
  })

  it('two versions first tested at the same instant keep the order their reports were registered in', () => {
    const sameDay = '2026-10-01T12:00:00Z'
    const proton9 = { layer_version_id: LayerVersionId.make(3), layer: 'Proton 9.0-3' }
    expect(timeline([approved(11, 'funciona', sameDay, proton9), approved(10, 'funciona', sameDay)]).map((h) => h.layer)).toEqual([
      'Proton 8.0-5',
      'Proton 9.0-3',
    ])
  })

  it('no approved test, no history', () => {
    expect(timeline([])).toEqual([])
  })
})

describe('Steam Deck', () => {
  const desktop = approved(10, 'funciona', '2026-10-01T12:00:00Z')
  const lcd = approved(11, 'no_inicia', '2026-10-02T12:00:00Z', { device: 'steam_deck_lcd', failures: ['anti_cheat'] })

  it('onSteamDeck summarizes only the tests run on a Deck', () => {
    expect(onSteamDeck([desktop, lcd], now)).toMatchObject({ status: 'no_inicia', test_count: 1, failures: [{ code: 'anti_cheat', reports: 1 }] })
    expect(onSteamDeck([desktop], now)).toMatchObject({ status: 'sin_evidencia', test_count: 0 })
  })

  it('workedOnSteamDeck needs a working test on a Deck, however old', () => {
    expect(workedOnSteamDeck([desktop, lcd])).toBe(false)
    expect(workedOnSteamDeck([desktop, lcd, approved(12, 'funciona_con_ajustes', '2024-01-01T12:00:00Z', { device: 'steam_deck_oled' })])).toBe(true)
  })

  it('a Deck is its own environment, apart from a desktop with the same setup', () => {
    const oled = approved(12, 'funciona', '2026-10-03T12:00:00Z', { device: 'steam_deck_oled' })
    expect(summarize([desktop, oled], now).setups.map((e) => [e.device, e.test_count])).toEqual([
      ['steam_deck_oled', 1],
      [null, 1],
    ])
  })
})
