import { describe, expect, it } from '@effect/vitest'
import { Option } from 'effect'
import { EditionId } from './ids.ts'
import { parseReport, type ProtonDbReport, summarizeProtonDb } from './protondb.ts'

const record = (changes: { app?: unknown; timestamp?: unknown; systemInfo?: object; responses?: object } = {}) =>
  JSON.stringify({
    app: { steam: { appId: '1000' }, title: 'Juego de prueba' },
    timestamp: 1767225600,
    systemInfo: { gpu: 'NVIDIA GeForce GTX 1060', ram: '16 GB', os: 'Distro de prueba' },
    responses: { verdict: 'yes', variant: 'official', notes: { extra: 'nada' } },
    ...changes,
  })

describe('parseReport', () => {
  it('reads a GE report on an integrated Intel GPU', () => {
    const text = record({
      systemInfo: { gpu: 'Intel Mesa Intel UHD 620 (KBL GT2)', ram: '16 GB' },
      responses: { verdict: 'yes', variant: 'ge', customProtonVersion: ' GE-Proton9-20 ', protonVersion: null },
    })
    expect(parseReport(text)).toEqual(
      Option.some({
        app_id: '1000',
        reported_at: new Date('2026-01-01T00:00:00Z'),
        works: true,
        modest_machine: true,
        layer: { variant: 'ge', version: 'GE-Proton9-20' },
        fingerprint: '1767225600|Intel Mesa Intel UHD 620 (KBL GT2)',
      }),
    )
  })

  it('reads a numeric appId, an official layer without version and 8 GB of RAM as modest', () => {
    const r = parseReport(record({ app: { steam: { appId: 2000 } }, systemInfo: { ram: '8 GB' }, responses: { verdict: 'no', variant: 'official' } }))
    expect(r).toEqual(
      Option.some({
        app_id: '2000',
        reported_at: new Date('2026-01-01T00:00:00Z'),
        works: false,
        modest_machine: true,
        layer: { variant: 'official', version: null },
        fingerprint: '1767225600|',
      }),
    )
  })

  it('decides "equipo modesto" from RAM in GB or MB, or an Intel GPU that is not Arc', () => {
    const modest = (systemInfo: object) => Option.map(parseReport(record({ systemInfo })), (r) => r.modest_machine)
    expect(modest({ ram: '6144 MB', gpu: 'AMD Radeon RX 580' })).toEqual(Option.some(true))
    expect(modest({ ram: '7GB' })).toEqual(Option.some(true))
    expect(modest({ ram: '12GB', gpu: 'AMD Radeon RX 580' })).toEqual(Option.some(false))
    expect(modest({ ram: '32 GB', gpu: 'Intel Mesa Intel Arc A750 (DG2)' })).toEqual(Option.some(false))
    expect(modest({ ram: 'None detected', gpu: 'NVIDIA GeForce RTX 3060' })).toEqual(Option.some(false))
  })

  it('a layer ProtonDB does not name, or a version longer than the column, is left out', () => {
    const layer = (responses: object) => Option.map(parseReport(record({ responses: { verdict: 'yes', ...responses } })), (r) => r.layer)
    expect(layer({ variant: 'notListed' })).toEqual(Option.some(null))
    expect(layer({})).toEqual(Option.some(null))
    expect(layer({ variant: 'experimental', protonVersion: 'x'.repeat(61) })).toEqual(Option.some({ variant: 'experimental', version: null }))
  })

  it('anything that is not a usable report is none', () => {
    expect(parseReport(record({ timestamp: 'ayer' }))).toEqual(Option.none())
    expect(parseReport(record({ responses: { verdict: 'quizás' } }))).toEqual(Option.none())
    expect(parseReport(record({ app: { title: 'sin Steam' } }))).toEqual(Option.none())
    expect(parseReport('{"app":')).toEqual(Option.none())
    expect(parseReport('')).toEqual(Option.none())
  })
})

describe('summarizeProtonDb', () => {
  const exported_at = new Date('2026-10-01T00:00:00Z')
  const report = (fingerprint: string, date: string, works: boolean, modest_machine: boolean, layer: ProtonDbReport['layer']): ProtonDbReport => ({
    app_id: '1000',
    reported_at: new Date(date),
    works,
    modest_machine,
    layer,
    fingerprint,
  })
  const ge = { variant: 'ge', version: 'GE-Proton10-34' } as const
  const official = { variant: 'official', version: null } as const

  it('counts the year before the export, its modest machines and the most used working layer, once per report', () => {
    const a = report('a', '2026-09-01T00:00:00Z', true, false, ge)
    const r = summarizeProtonDb(
      EditionId.make(7),
      [
        a,
        a,
        report('b', '2026-08-01T00:00:00Z', true, true, ge),
        report('c', '2026-07-01T00:00:00Z', true, true, official),
        report('d', '2026-06-01T00:00:00Z', false, true, official),
        report('e', '2025-09-30T23:59:59Z', true, false, official),
        report('f', '2024-01-01T00:00:00Z', false, false, null),
      ],
      exported_at,
    )
    expect(r).toEqual({
      edition_id: EditionId.make(7),
      exported_at,
      total_reports: 6,
      recent: 4,
      recent_working: 3,
      modest_recent: 3,
      modest_working: 2,
      latest_report: new Date('2026-09-01T00:00:00Z'),
      layer_variant: 'ge',
      layer_version: 'GE-Proton10-34',
      layer_reports: 2,
    })
  })

  it('two layers with the same count: the alphabetically first one, so a rerun stores the same row', () => {
    const r = summarizeProtonDb(
      EditionId.make(7),
      [report('a', '2026-09-01T00:00:00Z', true, false, official), report('b', '2026-09-02T00:00:00Z', true, false, { variant: 'experimental', version: null })],
      exported_at,
    )
    expect([r.layer_variant, r.layer_version, r.layer_reports]).toEqual(['experimental', null, 1])
  })

  it('with no working report in the year there is no layer to name', () => {
    const r = summarizeProtonDb(EditionId.make(7), [report('a', '2026-09-01T00:00:00Z', false, false, ge), report('b', '2023-01-01T00:00:00Z', true, false, ge)], exported_at)
    expect(r).toMatchObject({ total_reports: 2, recent: 1, recent_working: 0, layer_variant: null, layer_version: null, layer_reports: 0 })
  })
})
