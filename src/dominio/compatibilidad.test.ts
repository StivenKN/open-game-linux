// Pure core, no DB. Fixture: prototypes/veredicto (GTA V, Valorant, ETS2) in muestras.ts.
import { describe, expect, it } from '@effect/vitest'
import { type EstadoCompatibilidad, enDistribucion, estadoDe, type PruebaAprobada, type Resultado, resumir } from './compatibilidad.ts'
import { DistribucionId } from './ids.ts'
import { ets2, gtaV, valorant } from './muestras.ts'

describe('estadoDe', () => {
  const casos: ReadonlyArray<readonly [ReadonlyArray<Resultado>, EstadoCompatibilidad]> = [
    [[], 'sin_evidencia'],
    [['funciona', 'funciona'], 'funciona'],
    [['funciona_con_ajustes'], 'funciona_con_ajustes'],
    [['no_inicia', 'no_inicia'], 'no_inicia'],
    [['falla_en_ejecucion'], 'falla_en_ejecucion'],
    [['funciona', 'funciona_con_ajustes'], 'resultados_variables'], // strict 8.10 (open decision 5)
    [['no_inicia', 'falla_en_ejecucion'], 'resultados_variables'],
    [['funciona', 'no_inicia', 'funciona'], 'resultados_variables'],
  ]
  it.each(casos)('%o -> %s', (resultados, estado) => {
    expect(estadoDe(resultados)).toBe(estado)
  })
})

describe('resumir on the veredicto fixture', () => {
  it('GTA V: three environments with different results give resultados_variables', () => {
    const r = resumir(gtaV.pruebas)
    expect(r.estado).toBe('resultados_variables')
    expect(r.pruebas).toBe(4)
    expect(r.ultima_prueba).toEqual(new Date('2026-10-02T12:00:00Z'))
    expect(r.entornos.map((e) => [e.distribucion, e.capa, e.perfil, e.estado, e.pruebas])).toEqual([
      ['Fedora 40', 'Proton 9.0-3', null, 'falla_en_ejecucion', 1],
      ['Linux Mint 21.3', 'Proton 8.0-5', 'GTAV-BAJO r2', 'funciona', 2],
      ['Arch Linux', 'GE-Proton 9-4', null, 'funciona_con_ajustes', 1],
    ])
    expect(r.fallos).toEqual([{ codigo: 'lanzador', reportes: 1 }])
  })

  it('GTA V: an environment counts its results and keeps its newest test date', () => {
    const mint = resumir(gtaV.pruebas).entornos.find((e) => e.distribucion === 'Linux Mint 21.3')
    expect(mint?.por_resultado).toEqual({ funciona: 2 })
    expect(mint?.ultima_prueba).toEqual(new Date('2026-09-28T12:00:00Z'))
    expect(mint?.fps).toEqual([{ resolucion: '1280x720', calidad: 'Bajo', promedio: 54, mediciones: 1 }])
  })

  it('Valorant: every approved report fails to start, so no_inicia, with anti_cheat counted per report', () => {
    const r = resumir(valorant.pruebas)
    expect(r.estado).toBe('no_inicia')
    expect(r.entornos).toHaveLength(2)
    expect(r.fallos).toEqual([{ codigo: 'anti_cheat', reportes: 2 }])
  })

  it('ETS2: pending reports never reach the summary, so sin_evidencia', () => {
    expect(resumir(ets2.pruebas)).toEqual({ estado: 'sin_evidencia', pruebas: 0, ultima_prueba: null, entornos: [], fallos: [] })
  })
})

describe('resumir FPS', () => {
  const base = gtaV.pruebas[0]
  const medida = (fps: number, resolucion: string, calidad_grafica: string): PruebaAprobada =>
    ({ ...base, fps_promedio: fps, resolucion, calidad_grafica })

  it('averages per (resolucion, calidad) inside one environment, never one mixed average', () => {
    const pruebas = [medida(50, '1280x720', 'Bajo'), medida(60, '1280x720', 'Bajo'), medida(30, '1920x1080', 'Alto')]
    const [unico, ...otros] = resumir(pruebas).entornos
    expect(otros).toEqual([])
    expect(unico?.fps).toEqual([
      { resolucion: '1280x720', calidad: 'Bajo', promedio: 55, mediciones: 2 },
      { resolucion: '1920x1080', calidad: 'Alto', promedio: 30, mediciones: 1 },
    ])
  })

  it('the same resolution at another quality is another group', () => {
    const fps = resumir([medida(50, '1280x720', 'Bajo'), medida(40, '1280x720', 'Medio')]).entornos[0]?.fps
    expect(fps?.map((f) => f.calidad)).toEqual(['Bajo', 'Medio'])
  })
})

describe('enDistribucion', () => {
  it('the Linux Mint 21.3 slice of GTA V is funciona with its two tests', () => {
    const r = enDistribucion(resumir(gtaV.pruebas), DistribucionId.make(1))
    expect(r.estado).toBe('funciona')
    expect(r.pruebas).toBe(2)
    expect(r.entornos.map((e) => e.distribucion)).toEqual(['Linux Mint 21.3'])
    expect(r.fallos).toEqual([])
  })

  it('a distribution with no approved tests is sin_evidencia', () => {
    expect(enDistribucion(resumir(gtaV.pruebas), DistribucionId.make(99)).estado).toBe('sin_evidencia')
  })

  it('slices by distribution partition the tests', () => {
    const r = resumir(valorant.pruebas)
    const arch = enDistribucion(r, DistribucionId.make(2))
    const mint = enDistribucion(r, DistribucionId.make(1))
    expect([arch.estado, mint.estado]).toEqual(['no_inicia', 'no_inicia'])
    expect(arch.pruebas + mint.pruebas).toBe(r.pruebas)
  })
})
