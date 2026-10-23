import { Array as Arr, Schema } from 'effect'
import type { CompatibilityStatus } from './compatibility.ts'
import type { Evaluation } from './evaluation.ts'
import type { GamePath } from './graphics-path.ts'
import { FailingOutcome, WorkingOutcome } from './literals.ts'

/**
 * The machine certainly cannot run the game: no graphics path for its APIs or too low an x86-64 level,
 * or below a known condition of every approved profile. One failing profile is not enough, because
 * another may fit. An unknown never counts, and a pass never adds evidence.
 */
export const outOfReach = (path: GamePath, profiles: ReadonlyArray<{ readonly evaluation: Evaluation }>): boolean =>
  path.status === 'sin_ruta' || (Arr.isReadonlyArrayNonEmpty(profiles) && profiles.every((p) => p.evaluation.verdict === 'no_cumple'))

/** What the summary reads from one library game the catalog knows: the diagnosis matrix row fits it. */
type RatedGame = {
  readonly status: CompatibilityStatus
  /** Every approved test is older than a year (`summarize`'s `no_recent_confirmation`). */
  readonly no_recent_confirmation: boolean
  /** An edition's newest approved test fails after an earlier one worked: "Dejó de funcionar", which ignores the year window. */
  readonly regressed: boolean
  readonly blocked_by_anti_cheat: boolean
  readonly out_of_reach: boolean
}

const isWorking = Schema.is(WorkingOutcome)
const isFailing = Schema.is(FailingOutcome)

/**
 * "Can I switch to Linux?" for a Steam library, computed on each request. `games` are the library games
 * in the catalog, `installed` counts every installed game. `working` is evidence only; the machine and
 * stale evidence qualify it (`working_out_of_reach`, `working_stale`), never take games out of it.
 */
export const libraryReadiness = <G extends RatedGame>(games: ReadonlyArray<G>, installed: number) => {
  const countOf = (status: CompatibilityStatus) => games.filter((g) => g.status === status).length
  const working = games.filter((g) => isWorking(g.status))
  return {
    installed,
    in_catalog: games.length,
    by_status: {
      sin_evidencia: countOf('sin_evidencia'),
      funciona: countOf('funciona'),
      funciona_con_ajustes: countOf('funciona_con_ajustes'),
      no_inicia: countOf('no_inicia'),
      falla_en_ejecucion: countOf('falla_en_ejecucion'),
      resultados_variables: countOf('resultados_variables'),
    } satisfies Record<CompatibilityStatus, number>,
    working: working.length,
    working_out_of_reach: working.filter((g) => g.out_of_reach).length,
    working_stale: working.filter((g) => g.no_recent_confirmation).length,
    blocked_by_anti_cheat: games.filter((g) => g.blocked_by_anti_cheat).length,
    /**
     * "Te frenan": the approved evidence fails or is blocked, or the machine falls short. A regression
     * counts only when the state is not working, so a stale break on another store cannot contradict it.
     */
    holding_back: games.filter((g) => isFailing(g.status) || (g.regressed && !isWorking(g.status)) || g.blocked_by_anti_cheat || g.out_of_reach),
    /** "Sin evidencia": nobody has an approved test yet, and the machine does not rule the game out. */
    no_evidence: games.filter((g) => g.status === 'sin_evidencia' && !g.out_of_reach),
  }
}

export type LibraryReadiness<G extends RatedGame> = ReturnType<typeof libraryReadiness<G>>
