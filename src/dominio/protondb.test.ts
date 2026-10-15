import { describe, expect, it } from '@effect/vitest'
import { Option } from 'effect'
import { EdicionId } from './ids.ts'
import { interpretarReporte, type ReporteProtonDb, resumirProtonDb } from './protondb.ts'

const registro = (cambios: { app?: unknown; timestamp?: unknown; systemInfo?: object; responses?: object } = {}) =>
  JSON.stringify({
    app: { steam: { appId: '1000' }, title: 'Juego de prueba' },
    timestamp: 1767225600,
    systemInfo: { gpu: 'NVIDIA GeForce GTX 1060', ram: '16 GB', os: 'Distro de prueba' },
    responses: { verdict: 'yes', variant: 'official', notes: { extra: 'nada' } },
    ...cambios,
  })

describe('interpretarReporte', () => {
  it('reads a GE report on an integrated Intel GPU', () => {
    const texto = registro({
      systemInfo: { gpu: 'Intel Mesa Intel UHD 620 (KBL GT2)', ram: '16 GB' },
      responses: { verdict: 'yes', variant: 'ge', customProtonVersion: ' GE-Proton9-20 ', protonVersion: null },
    })
    expect(interpretarReporte(texto)).toEqual(
      Option.some({
        app_id: '1000',
        reportado_en: new Date('2026-01-01T00:00:00Z'),
        funciona: true,
        equipo_modesto: true,
        capa: { variante: 'ge', version: 'GE-Proton9-20' },
        huella: '1767225600|Intel Mesa Intel UHD 620 (KBL GT2)',
      }),
    )
  })

  it('reads a numeric appId, an official layer without version and 8 GB of RAM as modest', () => {
    const r = interpretarReporte(registro({ app: { steam: { appId: 2000 } }, systemInfo: { ram: '8 GB' }, responses: { verdict: 'no', variant: 'official' } }))
    expect(r).toEqual(
      Option.some({
        app_id: '2000',
        reportado_en: new Date('2026-01-01T00:00:00Z'),
        funciona: false,
        equipo_modesto: true,
        capa: { variante: 'official', version: null },
        huella: '1767225600|',
      }),
    )
  })

  it('decides "equipo modesto" from RAM in GB or MB, or an Intel GPU that is not Arc', () => {
    const modesto = (systemInfo: object) => Option.map(interpretarReporte(registro({ systemInfo })), (r) => r.equipo_modesto)
    expect(modesto({ ram: '6144 MB', gpu: 'AMD Radeon RX 580' })).toEqual(Option.some(true))
    expect(modesto({ ram: '7GB' })).toEqual(Option.some(true))
    expect(modesto({ ram: '12GB', gpu: 'AMD Radeon RX 580' })).toEqual(Option.some(false))
    expect(modesto({ ram: '32 GB', gpu: 'Intel Mesa Intel Arc A750 (DG2)' })).toEqual(Option.some(false))
    expect(modesto({ ram: 'None detected', gpu: 'NVIDIA GeForce RTX 3060' })).toEqual(Option.some(false))
  })

  it('a layer ProtonDB does not name, or a version longer than the column, is left out', () => {
    const capa = (responses: object) => Option.map(interpretarReporte(registro({ responses: { verdict: 'yes', ...responses } })), (r) => r.capa)
    expect(capa({ variant: 'notListed' })).toEqual(Option.some(null))
    expect(capa({})).toEqual(Option.some(null))
    expect(capa({ variant: 'experimental', protonVersion: 'x'.repeat(61) })).toEqual(Option.some({ variante: 'experimental', version: null }))
  })

  it('anything that is not a usable report is none', () => {
    expect(interpretarReporte(registro({ timestamp: 'ayer' }))).toEqual(Option.none())
    expect(interpretarReporte(registro({ responses: { verdict: 'quizás' } }))).toEqual(Option.none())
    expect(interpretarReporte(registro({ app: { title: 'sin Steam' } }))).toEqual(Option.none())
    expect(interpretarReporte('{"app":')).toEqual(Option.none())
    expect(interpretarReporte('')).toEqual(Option.none())
  })
})

describe('resumirProtonDb', () => {
  const exportado_en = new Date('2026-10-01T00:00:00Z')
  const reporte = (huella: string, fecha: string, funciona: boolean, equipo_modesto: boolean, capa: ReporteProtonDb['capa']): ReporteProtonDb => ({
    app_id: '1000',
    reportado_en: new Date(fecha),
    funciona,
    equipo_modesto,
    capa,
    huella,
  })
  const ge = { variante: 'ge', version: 'GE-Proton10-34' } as const
  const oficial = { variante: 'official', version: null } as const

  it('counts the year before the export, its modest machines and the most used working layer, once per report', () => {
    const a = reporte('a', '2026-09-01T00:00:00Z', true, false, ge)
    const r = resumirProtonDb(
      EdicionId.make(7),
      [
        a,
        a,
        reporte('b', '2026-08-01T00:00:00Z', true, true, ge),
        reporte('c', '2026-07-01T00:00:00Z', true, true, oficial),
        reporte('d', '2026-06-01T00:00:00Z', false, true, oficial),
        reporte('e', '2025-09-30T23:59:59Z', true, false, oficial),
        reporte('f', '2024-01-01T00:00:00Z', false, false, null),
      ],
      exportado_en,
    )
    expect(r).toEqual({
      edicion_id: EdicionId.make(7),
      exportado_en,
      reportes_total: 6,
      recientes: 4,
      recientes_funcionan: 3,
      modestos_recientes: 3,
      modestos_funcionan: 2,
      ultimo_reporte: new Date('2026-09-01T00:00:00Z'),
      capa_variante: 'ge',
      capa_version: 'GE-Proton10-34',
      capa_reportes: 2,
    })
  })

  it('two layers with the same count: the alphabetically first one, so a rerun stores the same row', () => {
    const r = resumirProtonDb(
      EdicionId.make(7),
      [reporte('a', '2026-09-01T00:00:00Z', true, false, oficial), reporte('b', '2026-09-02T00:00:00Z', true, false, { variante: 'experimental', version: null })],
      exportado_en,
    )
    expect([r.capa_variante, r.capa_version, r.capa_reportes]).toEqual(['experimental', null, 1])
  })

  it('with no working report in the year there is no layer to name', () => {
    const r = resumirProtonDb(EdicionId.make(7), [reporte('a', '2026-09-01T00:00:00Z', false, false, ge), reporte('b', '2023-01-01T00:00:00Z', true, false, ge)], exportado_en)
    expect(r).toMatchObject({ reportes_total: 2, recientes: 1, recientes_funcionan: 0, capa_variante: null, capa_version: null, capa_reportes: 0 })
  })
})
