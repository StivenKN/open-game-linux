import { Schema } from 'effect'
import type { CompatibilityStatus } from './compatibility.ts'
import type { RequirementsVerdict } from './evaluation.ts'
import type { GamePath } from './graphics-path.ts'
import { FailingOutcome, WorkingOutcome } from './literals.ts'

/** What the summary reads from one library game the catalog knows: the diagnosis matrix row fits it. */
type RatedGame = {
  readonly status: CompatibilityStatus
  readonly blocked_by_anti_cheat: boolean
  readonly path: { readonly status: GamePath['status'] }
  readonly profile: { readonly evaluation: { readonly verdict: RequirementsVerdict } } | null
}

const isWorking = Schema.is(WorkingOutcome)
const isFailing = Schema.is(FailingOutcome)

/**
 * The machine certainly cannot run the game: no graphics path or too low an x86-64 level, or below a
 * known condition of the suggested profile. An unknown never counts, and a pass never adds evidence.
 */
export const outOfReach = (game: RatedGame): boolean => game.path.status === 'sin_ruta' || game.profile?.evaluation.verdict === 'no_cumple'

/**
 * "Can I switch to Linux?" for a Steam library, computed on each request. `games` are the library games
 * in the catalog, `installed` counts every installed game. `working` is evidence only; the machine
 * qualifies it (`working_out_of_reach`) and moves those games to `holding_back`, never out of the count.
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
    working_out_of_reach: working.filter(outOfReach).length,
    blocked_by_anti_cheat: games.filter((g) => g.blocked_by_anti_cheat).length,
    /** "Te frenan": the approved evidence fails or is blocked, or the machine falls short. */
    holding_back: games.filter((g) => isFailing(g.status) || g.blocked_by_anti_cheat || outOfReach(g)),
    /** "Sin evidencia": nobody has an approved test yet, and the machine does not rule the game out. */
    no_evidence: games.filter((g) => g.status === 'sin_evidencia' && !outOfReach(g)),
  }
}

export type LibraryReadiness<G extends RatedGame> = ReturnType<typeof libraryReadiness<G>>
