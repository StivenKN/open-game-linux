import { Schema } from 'effect'
import { ApprovedTest } from './compatibility.ts'

const approvedTests = Schema.decodeUnknownSync(Schema.Array(ApprovedTest))

const noFps = { avg_fps: null, resolution: null, graphics_quality: null, measurement_method: null }

export type Sample = {
  readonly game: string
  readonly tests: ReadonlyArray<ApprovedTest>
  readonly pending: number
}

export const gtaV: Sample = {
  game: 'Grand Theft Auto V',
  pending: 1,
  tests: approvedTests([
    {
      report_id: 1, review_status: 'aprobado', edition_id: 1, launcher: 'Steam', game_version: '1.0.3179',
      distribution_id: 1, distribution: 'Linux Mint 21.3', layer_version_id: 1, layer: 'Proton 8.0-5',
      profile_id: 1, profile: 'GTAV-BAJO r2', outcome: 'funciona', tested_at: new Date('2026-09-28T12:00:00Z'), reviewed_at: new Date('2026-09-28T18:00:00Z'),
      avg_fps: '54.00', resolution: '1280x720', graphics_quality: 'Bajo', measurement_method: 'MangoHud · misión Prólogo · 5 min',
      failures: [],
    },
    {
      report_id: 2, review_status: 'aprobado', edition_id: 1, launcher: 'Steam', game_version: '1.0.3179',
      distribution_id: 1, distribution: 'Linux Mint 21.3', layer_version_id: 1, layer: 'Proton 8.0-5',
      profile_id: 1, profile: 'GTAV-BAJO r2', outcome: 'funciona', tested_at: new Date('2026-09-14T12:00:00Z'), reviewed_at: new Date('2026-09-14T18:00:00Z'),
      ...noFps, failures: [],
    },
    {
      report_id: 3, review_status: 'aprobado', edition_id: 2, launcher: 'Epic (Heroic)', game_version: '1.0.3179',
      distribution_id: 2, distribution: 'Arch Linux', layer_version_id: 2, layer: 'GE-Proton 9-4',
      profile_id: null, profile: null, outcome: 'funciona_con_ajustes', tested_at: new Date('2026-09-02T12:00:00Z'), reviewed_at: new Date('2026-09-02T18:00:00Z'),
      avg_fps: '60.00', resolution: '1920x1080', graphics_quality: 'Medio', measurement_method: 'MangoHud · conducción en ciudad · 10 min',
      failures: [],
    },
    {
      report_id: 4, review_status: 'aprobado', edition_id: 1, launcher: 'Steam', game_version: '1.0.3258',
      distribution_id: 3, distribution: 'Fedora 40', layer_version_id: 3, layer: 'Proton 9.0-3',
      profile_id: null, profile: null, outcome: 'falla_en_ejecucion', tested_at: new Date('2026-10-02T12:00:00Z'), reviewed_at: new Date('2026-10-02T18:00:00Z'),
      ...noFps, failures: ['lanzador'],
    },
  ]),
}

export const valorant: Sample = {
  game: 'Valorant',
  pending: 0,
  tests: approvedTests([
    {
      report_id: 5, review_status: 'aprobado', edition_id: 3, launcher: 'Riot Client', game_version: '9.07',
      distribution_id: 1, distribution: 'Linux Mint 21.3', layer_version_id: 4, layer: 'Wine 9.0',
      profile_id: null, profile: null, outcome: 'no_inicia', tested_at: new Date('2026-07-11T12:00:00Z'), reviewed_at: new Date('2026-07-11T18:00:00Z'),
      ...noFps, failures: ['anti_cheat'],
    },
    {
      report_id: 6, review_status: 'aprobado', edition_id: 3, launcher: 'Riot Client', game_version: '9.07',
      distribution_id: 2, distribution: 'Arch Linux', layer_version_id: 2, layer: 'GE-Proton 9-4',
      profile_id: null, profile: null, outcome: 'no_inicia', tested_at: new Date('2026-08-03T12:00:00Z'), reviewed_at: new Date('2026-08-03T18:00:00Z'),
      ...noFps, failures: ['anti_cheat'],
    },
  ]),
}

export const ets2: Sample = { game: 'Euro Truck Simulator 2', pending: 2, tests: [] }
