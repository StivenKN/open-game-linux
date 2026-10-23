import { describe, expect, it } from '@effect/vitest'
import type { CompatibilityStatus } from './compatibility.ts'
import type { RequirementsVerdict } from './evaluation.ts'
import type { GamePath } from './graphics-path.ts'
import { libraryReadiness } from './readiness.ts'

const game = (
  title: string,
  status: CompatibilityStatus,
  { anti_cheat = false, path = 'con_ruta', verdict = null }: { anti_cheat?: boolean; path?: GamePath['status']; verdict?: RequirementsVerdict | null } = {},
) => ({ title, status, blocked_by_anti_cheat: anti_cheat, path: { status: path }, profile: verdict === null ? null : { evaluation: { verdict } } })

const titles = (games: ReadonlyArray<{ readonly title: string }>) => games.map((g) => g.title)

describe('libraryReadiness', () => {
  const library = [
    game('Funciona', 'funciona'),
    game('Con ajustes', 'funciona_con_ajustes', { verdict: 'cumple' }),
    game('Variable', 'resultados_variables'),
    game('Variable con anti-cheat', 'resultados_variables', { anti_cheat: true }),
    game('No inicia', 'no_inicia', { anti_cheat: true }),
    game('Falla', 'falla_en_ejecucion'),
    game('Nadie lo probó', 'sin_evidencia'),
  ]

  it('counts the catalog games by computed state, the ones that work, and the anti-cheat blocks', () => {
    const r = libraryReadiness(library, 12)
    expect(r).toMatchObject({
      installed: 12,
      in_catalog: 7,
      by_status: { funciona: 1, funciona_con_ajustes: 1, resultados_variables: 2, no_inicia: 1, falla_en_ejecucion: 1, sin_evidencia: 1 },
      working: 2,
      working_out_of_reach: 0,
      blocked_by_anti_cheat: 2,
    })
  })

  it('holds back what fails or is blocked; mixed results alone do not', () => {
    const r = libraryReadiness(library, 12)
    expect(titles(r.holding_back)).toEqual(['Variable con anti-cheat', 'No inicia', 'Falla'])
    expect(titles(r.no_evidence)).toEqual(['Nadie lo probó'])
  })

  it('a machine that certainly falls short holds a game back but keeps its evidence in the count', () => {
    const r = libraryReadiness(
      [
        game('Sin ruta gráfica', 'funciona', { path: 'sin_ruta' }),
        game('Perfil exigente', 'funciona_con_ajustes', { verdict: 'no_cumple' }),
        game('Sin pruebas y sin ruta', 'sin_evidencia', { path: 'sin_ruta' }),
      ],
      3,
    )
    expect([r.working, r.working_out_of_reach]).toEqual([2, 2])
    expect(titles(r.holding_back)).toEqual(['Sin ruta gráfica', 'Perfil exigente', 'Sin pruebas y sin ruta'])
    expect(r.no_evidence).toEqual([])
  })

  it('what the machine does not know never changes the answer', () => {
    const r = libraryReadiness(
      [game('Faltan datos', 'funciona', { path: 'sin_datos', verdict: 'informacion_insuficiente' }), game('Sin APIs', 'sin_evidencia', { path: 'sin_apis' })],
      2,
    )
    expect([r.working, r.working_out_of_reach, r.holding_back]).toEqual([1, 0, []])
    expect(titles(r.no_evidence)).toEqual(['Sin APIs'])
  })

  it('a library with no catalog game counts only what is installed', () => {
    expect(libraryReadiness([], 5)).toMatchObject({ installed: 5, in_catalog: 0, working: 0, holding_back: [], no_evidence: [] })
  })
})
