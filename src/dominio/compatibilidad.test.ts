import { describe, expect, it } from '@effect/vitest'
import { type EstadoCompatibilidad, enDistribucion, estadoDe, type PruebaAprobada, resumir } from './compatibilidad.ts'
import { DistribucionId, EdicionId, ReporteId } from './ids.ts'
import type { Resultado } from './literales.ts'
import { ets2, gtaV, valorant } from './muestras.ts'
import { esVigente } from './vigencia.ts'

const ahora = new Date('2026-10-15T00:00:00Z')

describe('estadoDe', () => {
  const casos: ReadonlyArray<readonly [ReadonlyArray<Resultado>, EstadoCompatibilidad]> = [
    [[], 'sin_evidencia'],
    [['funciona', 'funciona'], 'funciona'],
    [['funciona_con_ajustes'], 'funciona_con_ajustes'],
    [['no_inicia', 'no_inicia'], 'no_inicia'],
    [['falla_en_ejecucion'], 'falla_en_ejecucion'],
    [['funciona', 'funciona_con_ajustes'], 'resultados_variables'],
    [['no_inicia', 'falla_en_ejecucion'], 'resultados_variables'],
    [['funciona', 'no_inicia', 'funciona'], 'resultados_variables'],
  ]
  it.each(casos)('%o -> %s', (resultados, estado) => {
    expect(estadoDe(resultados)).toBe(estado)
  })
})

describe('resumir on the veredicto fixture', () => {
  it('GTA V: three environments with different results give resultados_variables', () => {
    const r = resumir(gtaV.pruebas, ahora)
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
    const mint = resumir(gtaV.pruebas, ahora).entornos.find((e) => e.distribucion === 'Linux Mint 21.3')
    expect(mint?.por_resultado).toEqual({ funciona: 2 })
    expect(mint?.ultima_prueba).toEqual(new Date('2026-09-28T12:00:00Z'))
    expect(mint?.fps).toEqual([{ resolucion: '1280x720', calidad: 'Bajo', promedio: 54, mediciones: 1 }])
  })

  it('Valorant: every approved report fails to start, so no_inicia, with anti_cheat counted per report', () => {
    const r = resumir(valorant.pruebas, ahora)
    expect(r.estado).toBe('no_inicia')
    expect(r.entornos).toHaveLength(2)
    expect(r.fallos).toEqual([{ codigo: 'anti_cheat', reportes: 2 }])
  })

  it('ETS2: pending reports never reach the summary, so sin_evidencia', () => {
    expect(resumir(ets2.pruebas, ahora)).toEqual({
      estado: 'sin_evidencia',
      pruebas: 0,
      vigentes: 0,
      sin_confirmacion_reciente: false,
      ultima_prueba: null,
      entornos: [],
      fallos: [],
      regresiones: [],
    })
  })
})

describe('resumir FPS', () => {
  const base = gtaV.pruebas[0]
  const medida = (fps: number, resolucion: string, calidad_grafica: string): PruebaAprobada =>
    ({ ...base, fps_promedio: fps, resolucion, calidad_grafica })

  it('averages per (resolucion, calidad) inside one environment, never one mixed average', () => {
    const pruebas = [medida(50, '1280x720', 'Bajo'), medida(60, '1280x720', 'Bajo'), medida(30, '1920x1080', 'Alto')]
    const [unico, ...otros] = resumir(pruebas, ahora).entornos
    expect(otros).toEqual([])
    expect(unico?.fps).toEqual([
      { resolucion: '1280x720', calidad: 'Bajo', promedio: 55, mediciones: 2 },
      { resolucion: '1920x1080', calidad: 'Alto', promedio: 30, mediciones: 1 },
    ])
  })

  it('the same resolution at another quality is another group', () => {
    const fps = resumir([medida(50, '1280x720', 'Bajo'), medida(40, '1280x720', 'Medio')], ahora).entornos[0]?.fps
    expect(fps?.map((f) => f.calidad)).toEqual(['Bajo', 'Medio'])
  })
})

describe('enDistribucion', () => {
  it('the Linux Mint 21.3 slice of GTA V is funciona with its two tests', () => {
    const r = enDistribucion(gtaV.pruebas, DistribucionId.make(1), ahora)
    expect(r.estado).toBe('funciona')
    expect(r.pruebas).toBe(2)
    expect(r.entornos.map((e) => e.distribucion)).toEqual(['Linux Mint 21.3'])
    expect(r.fallos).toEqual([])
  })

  it('a distribution with no approved tests is sin_evidencia', () => {
    expect(enDistribucion(gtaV.pruebas, DistribucionId.make(99), ahora).estado).toBe('sin_evidencia')
  })

  it('slices by distribution partition the tests', () => {
    const r = resumir(valorant.pruebas, ahora)
    const arch = enDistribucion(valorant.pruebas, DistribucionId.make(2), ahora)
    const mint = enDistribucion(valorant.pruebas, DistribucionId.make(1), ahora)
    expect([arch.estado, mint.estado]).toEqual(['no_inicia', 'no_inicia'])
    expect(arch.pruebas + mint.pruebas).toBe(r.pruebas)
  })
})

const [gtaMint] = gtaV.pruebas
const prueba = (reporte_id: number, resultado: Resultado, fecha_prueba: string, cambios: Partial<PruebaAprobada> = {}): PruebaAprobada =>
  ({ ...gtaMint, ...cambios, reporte_id: ReporteId.make(reporte_id), resultado, fecha_prueba: new Date(fecha_prueba), fps_promedio: null, fallos: cambios.fallos ?? [] })

describe('esVigente', () => {
  it('a test exactly 365 days old is vigente, one millisecond older is not', () => {
    const referencia = new Date('2026-10-15T00:00:00Z')
    expect(esVigente(new Date('2025-10-15T00:00:00Z'), referencia)).toBe(true)
    expect(esVigente(new Date('2025-10-14T23:59:59.999Z'), referencia)).toBe(false)
  })
})

describe('resumir with the 365-day window', () => {
  it('state and causes come only from the tests of the last year; totals and dates from all', () => {
    const r = resumir(gtaV.pruebas, new Date('2027-10-01T00:00:00Z'))
    expect([r.estado, r.pruebas, r.vigentes, r.sin_confirmacion_reciente]).toEqual(['falla_en_ejecucion', 4, 1, false])
    expect(r.ultima_prueba).toEqual(new Date('2026-10-02T12:00:00Z'))
    expect(r.fallos).toEqual([{ codigo: 'lanzador', reportes: 1 }])
    expect(r.entornos.map((e) => [e.distribucion, e.pruebas, e.vigentes])).toEqual([
      ['Fedora 40', 1, 1],
      ['Linux Mint 21.3', 2, 0],
      ['Arch Linux', 1, 0],
    ])
  })

  it('a cause seen only in stale tests leaves the summary once a recent test exists', () => {
    const recuperado = prueba(7, 'funciona', '2027-09-01T12:00:00Z', { edicion_id: EdicionId.make(3) })
    const r = resumir([...valorant.pruebas, recuperado], new Date('2027-10-01T00:00:00Z'))
    expect([r.estado, r.vigentes, r.fallos]).toEqual(['funciona', 1, []])
  })

  it('with no test from the last year, the state comes from all of them and says so', () => {
    const r = resumir(gtaV.pruebas, new Date('2028-10-15T00:00:00Z'))
    expect([r.estado, r.pruebas, r.vigentes, r.sin_confirmacion_reciente]).toEqual(['resultados_variables', 4, 0, true])
    expect(r.fallos).toEqual([{ codigo: 'lanzador', reportes: 1 }])
  })

  it('an environment applies the same rule: its stale failure gives way to its recent success', () => {
    const [e, ...otros] = resumir(
      [prueba(1, 'no_inicia', '2025-01-10T12:00:00Z', { fallos: ['lanzador'] }), prueba(2, 'funciona', '2026-09-01T12:00:00Z')],
      ahora,
    ).entornos
    expect(otros).toEqual([])
    expect([e?.estado, e?.pruebas, e?.vigentes, e?.por_resultado, e?.fallos]).toEqual(['funciona', 2, 1, { funciona: 1 }, []])
  })
})

describe('resumir regresiones', () => {
  it('GTA V: the Steam edition newest test fails after earlier ones worked', () => {
    expect(resumir(gtaV.pruebas, ahora).regresiones).toEqual([
      {
        edicion_id: EdicionId.make(1),
        lanzador: 'Steam',
        fecha_prueba: new Date('2026-10-02T12:00:00Z'),
        version_juego: '1.0.3258',
        capa: 'Proton 9.0-3',
        resultado: 'falla_en_ejecucion',
      },
    ])
  })

  it('no window applies: a two-year-old regression is still reported', () => {
    expect(resumir(gtaV.pruebas, new Date('2028-10-15T00:00:00Z')).regresiones).toHaveLength(1)
  })

  it('an edition that never worked has no regression', () => {
    expect(resumir(valorant.pruebas, ahora).regresiones).toEqual([])
  })

  it('an edition whose newest test works has no regression', () => {
    const sinFedora = gtaV.pruebas.filter((p) => p.distribucion !== 'Fedora 40')
    expect(resumir(sinFedora, ahora).regresiones).toEqual([])
  })

  it('two tests on the same instant: the later registered one is the newest', () => {
    const mismoDia = '2026-10-01T12:00:00Z'
    expect(resumir([prueba(10, 'funciona', mismoDia), prueba(11, 'no_inicia', mismoDia)], ahora).regresiones).toEqual([
      {
        edicion_id: EdicionId.make(1),
        lanzador: 'Steam',
        fecha_prueba: new Date(mismoDia),
        version_juego: '1.0.3179',
        capa: 'Proton 8.0-5',
        resultado: 'no_inicia',
      },
    ])
    expect(resumir([prueba(10, 'no_inicia', mismoDia), prueba(11, 'funciona', mismoDia)], ahora).regresiones).toEqual([])
  })
})
