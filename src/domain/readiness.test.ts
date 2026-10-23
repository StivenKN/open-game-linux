import { describe, expect, it } from '@effect/vitest'
import type { CompatibilityStatus } from './compatibility.ts'
import type { RequirementsVerdict } from './evaluation.ts'
import type { GamePath } from './graphics-path.ts'
import type { AntiCheatStatus } from './literals.ts'
import { libraryReadiness, outOfReach } from './readiness.ts'

const game = (
  title: string,
  status: CompatibilityStatus,
  flags: { anti_cheat?: boolean; regressed?: boolean; stale?: boolean; out_of_reach?: boolean; awacy?: AntiCheatStatus } = {},
) => ({
  title,
  status,
  no_recent_confirmation: flags.stale ?? false,
  regressed: flags.regressed ?? false,
  blocked_by_anti_cheat: flags.anti_cheat ?? false,
  out_of_reach: flags.out_of_reach ?? false,
  awacy: flags.awacy ?? null,
})

const titles = (games: ReadonlyArray<{ readonly title: string }>) => games.map((g) => g.title)

describe('libraryReadiness', () => {
  const library = [
    game('Funciona', 'funciona'),
    game('Con ajustes', 'funciona_con_ajustes'),
    game('Variable', 'resultados_variables'),
    game('Variable con anti-cheat', 'resultados_variables', { anti_cheat: true }),
    game('Dejó de funcionar', 'resultados_variables', { regressed: true }),
    game('No inicia', 'no_inicia', { anti_cheat: true }),
    game('Falla', 'falla_en_ejecucion'),
    game('Nadie lo probó', 'sin_evidencia'),
  ]

  it('counts the catalog games by computed state, the ones that work, and the anti-cheat blocks', () => {
    expect(libraryReadiness(library, 12)).toMatchObject({
      installed: 12,
      in_catalog: 8,
      by_status: { funciona: 1, funciona_con_ajustes: 1, resultados_variables: 3, no_inicia: 1, falla_en_ejecucion: 1, sin_evidencia: 1 },
      working: 2,
      working_out_of_reach: 0,
      working_stale: 0,
      blocked_by_anti_cheat: 2,
    })
  })

  it('holds back what fails, stopped working or is blocked; mixed results alone do not', () => {
    const r = libraryReadiness(library, 12)
    expect(titles(r.holding_back)).toEqual(['Variable con anti-cheat', 'Dejó de funcionar', 'No inicia', 'Falla'])
    expect(titles(r.no_evidence)).toEqual(['Nadie lo probó'])
  })

  it('a machine that falls short holds a game back but keeps its evidence in the count', () => {
    const r = libraryReadiness(
      [game('Funciona lejos', 'funciona', { out_of_reach: true }), game('Funciona', 'funciona'), game('Nadie lo probó, y no llega', 'sin_evidencia', { out_of_reach: true })],
      3,
    )
    expect([r.working, r.working_out_of_reach]).toEqual([2, 1])
    expect(titles(r.holding_back)).toEqual(['Funciona lejos', 'Nadie lo probó, y no llega'])
    expect(r.no_evidence).toEqual([])
  })

  it('a working state outweighs an old break on another edition, as the year window does', () => {
    expect(libraryReadiness([game('Funciona hoy', 'funciona', { regressed: true })], 1)).toMatchObject({ working: 1, holding_back: [] })
  })

  it("AreWeAntiCheatYet's block holds a game back without touching its state or the anti-cheat count", () => {
    const r = libraryReadiness([game('Funciona solo', 'funciona', { awacy: 'Denied' }), game('Sin probar', 'sin_evidencia', { awacy: 'Broken' })], 2)
    expect(r).toMatchObject({ working: 1, blocked_by_anti_cheat: 0, by_status: { funciona: 1, sin_evidencia: 1 }, no_evidence: [] })
    expect(titles(r.holding_back)).toEqual(['Funciona solo', 'Sin probar'])
  })

  it('evidence older than a year still counts as working, and says so', () => {
    expect(libraryReadiness([game('Viejo', 'funciona', { stale: true })], 1)).toMatchObject({ working: 1, working_stale: 1, holding_back: [] })
  })

  it('a library with no catalog game counts only what is installed', () => {
    expect(libraryReadiness([], 5)).toMatchObject({ installed: 5, in_catalog: 0, working: 0, holding_back: [], no_evidence: [] })
  })
})

describe('outOfReach', () => {
  const profile = (verdict: RequirementsVerdict) => ({ evaluation: { verdict, checks: [], advisory_only: false } })
  const runs: GamePath = { status: 'con_ruta', path: 'dxvk' }

  it('a graphics path or CPU level the game cannot get rules it out, with or without profiles', () => {
    expect(outOfReach({ status: 'sin_ruta', reason: 'cpu' }, [])).toBe(true)
    expect(outOfReach({ status: 'sin_ruta', reason: 'grafica' }, [profile('cumple')])).toBe(true)
  })

  it('only when every approved profile fails: the suggested one failing is not enough', () => {
    expect(outOfReach(runs, [profile('no_cumple'), profile('cumple')])).toBe(false)
    expect(outOfReach(runs, [profile('no_cumple'), profile('no_cumple')])).toBe(true)
  })

  it('what the machine does not know never rules a game out', () => {
    expect(outOfReach({ status: 'sin_datos', missing: ['grafica'], at_least: null }, [profile('informacion_insuficiente')])).toBe(false)
    expect(outOfReach({ status: 'sin_apis' }, [])).toBe(false)
    expect(outOfReach(runs, [profile('no_cumple'), profile('informacion_insuficiente')])).toBe(false)
  })
})
