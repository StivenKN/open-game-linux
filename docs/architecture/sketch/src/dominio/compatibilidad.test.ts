// Pure core, no DB. Fixture: prototypes/veredicto (GTA V, Valorant, ETS2).
import { describe, expect, it } from '@effect/vitest'
import { estadoDe } from './compatibilidad.ts'

describe('estadoDe', () => {
  it('maps the result set to one of six states', () => {
    expect(estadoDe([])).toBe('sin_evidencia')
    expect(estadoDe(['funciona', 'funciona'])).toBe('funciona')
    expect(estadoDe(['funciona', 'funciona_con_ajustes'])).toBe('resultados_variables') // strict 8.10 (round 1 open decision 5)
    expect(estadoDe(['no_inicia'])).toBe('no_inicia')
  })
  it.todo('resumir: GTA V fixture -> resultados_variables with 3 entornos; Valorant -> no_inicia; ETS2 (pending only) -> sin_evidencia')
  it.todo('resumir: FPS grouped by (resolucion, calidad), never one mixed average')
  it.todo('enDistribucion: Linux Mint 21.3 slice of GTA V -> funciona')
})
