import { describe, expect, it } from '@effect/vitest'
import { type ContextoPrueba, discrepancias, type PerfilObjetivo } from './aportes.ts'
import { DistribucionId, EdicionId, VersionCapaId } from './ids.ts'

describe('discrepancias (8.7 comparability)', () => {
  const perfil: PerfilObjetivo = {
    edicion_id: EdicionId.make(1),
    version_capa_id: VersionCapaId.make(1),
    distribucion_id: DistribucionId.make(1),
    arquitectura: 'x86_64',
    version_juego_objetivo: null,
  }
  const prueba: ContextoPrueba = { ...perfil, version_juego: '1.0.3179' }

  it('a test in the profile environment is comparable', () => {
    expect(discrepancias(prueba, perfil)).toEqual([])
  })

  it.each([
    [{ ...prueba, edicion_id: EdicionId.make(2) }, { de: 'edicion', esperado: 1, observado: 2 }],
    [{ ...prueba, version_capa_id: VersionCapaId.make(3) }, { de: 'capa', esperado: 1, observado: 3 }],
    [{ ...prueba, distribucion_id: DistribucionId.make(4) }, { de: 'distribucion', esperado: 1, observado: 4 }],
    [{ ...prueba, arquitectura: 'aarch64' }, { de: 'arquitectura', esperado: 'x86_64', observado: 'aarch64' }],
  ])('names the mismatching side: %o', (otra, discrepancia) => {
    expect(discrepancias(otra, perfil)).toEqual([discrepancia])
  })

  it('checks the game version only when the profile limits it, as exact text', () => {
    const limitado = { ...perfil, version_juego_objetivo: '1.0.3179' }
    expect(discrepancias(prueba, limitado)).toEqual([])
    expect(discrepancias({ ...prueba, version_juego: '1.0.3179.0' }, limitado)).toEqual([
      { de: 'version_juego', esperado: '1.0.3179', observado: '1.0.3179.0' },
    ])
  })

  it('reports every mismatch, not only the first', () => {
    const otra = { ...prueba, distribucion_id: DistribucionId.make(2), arquitectura: 'aarch64' }
    expect(discrepancias(otra, perfil).map((d) => d.de)).toEqual(['distribucion', 'arquitectura'])
  })
})
