import { describe, expect, layer } from '@effect/vitest'
import { Effect, Option } from 'effect'
import { SqlClient } from 'effect/sql'
import { EditionId, GameId } from '../src/domain/ids.ts'
import { ProtonDbSummary } from '../src/domain/tables.ts'
import { Visitor } from '../src/server/auth.ts'
import { catalog } from '../src/server/queries/catalog.ts'
import { gamePage } from '../src/server/queries/game.ts'
import { importProtonDb } from '../src/server/external/protondb.ts'
import { alreadyImported } from '../src/server/external/sources.ts'
import { rows } from '../src/server/rows.ts'
import { onDay, inRollback, idOf, PgTest } from './support.ts'

async function* chunks(text: string) {
  for (let i = 0; i < text.length; i += 7) yield text.slice(i, i + 7)
}

type Entry = { appId: string | number; date: string; works: boolean; ram?: string; variant?: string; version?: string }

const entry = ({ appId, date, works, ram = '16 GB', variant = 'official', version }: Entry) =>
  JSON.stringify({
    app: { steam: { appId }, title: 'Juego inventado' },
    timestamp: Date.parse(date) / 1000,
    systemInfo: { gpu: 'NVIDIA GeForce GTX 1060', ram },
    responses: { verdict: works ? 'yes' : 'no', variant, ...(version === undefined ? {} : { customProtonVersion: version }) },
  })

const exportOf = (...elements: ReadonlyArray<string>) => `[\n${elements.join(',\n')}\n]`

const ge = { variant: 'ge', version: 'GE-Proton10-34' }
const repeated = entry({ appId: '1000', date: '2026-09-01T00:00:00Z', works: true, ...ge })
const october = exportOf(
  repeated,
  repeated,
  entry({ appId: '1000', date: '2026-08-01T00:00:00Z', works: true, ram: '8 GB', ...ge }),
  entry({ appId: '1000', date: '2026-07-01T00:00:00Z', works: false, ram: '8 GB' }),
  entry({ appId: '1000', date: '2024-05-01T00:00:00Z', works: true }),
  entry({ appId: 2000, date: '2026-10-01T00:00:00Z', works: true }),
  entry({ appId: '3000', date: '2026-09-15T00:00:00Z', works: true }),
  entry({ appId: '1000', date: '2027-01-01T00:00:00Z', works: true }),
  '{"timestamp":"ayer"}',
)

const scenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insert = (table: string, row: Record<string, string | number | null>) =>
    idOf(sql`INSERT INTO ${sql(table)} ${sql.insert(row)} RETURNING id`)
  const steam = yield* insert('launcher', { name: 'Steam' })
  const epic = yield* insert('launcher', { name: 'Epic Games Store' })
  const one = yield* insert('game', { title: 'Juego Uno', description: 'd' })
  const two = yield* insert('game', { title: 'Juego Dos', description: 'd' })
  const three = yield* insert('game', { title: 'Juego Tres', description: 'd' })
  const oneSteam = yield* insert('game_edition', { game_id: one, launcher_id: steam, external_id: '1000' })
  yield* insert('game_edition', { game_id: one, launcher_id: epic, external_id: '2000' })
  const twoSteam = yield* insert('game_edition', { game_id: two, launcher_id: steam, external_id: '2000' })
  yield* insert('game_edition', { game_id: three, launcher_id: steam, external_id: null })
  return { one: GameId.make(one), three: GameId.make(three), oneSteam: EditionId.make(oneSteam), twoSteam: EditionId.make(twoSteam) }
})

const saved = Effect.flatMap(SqlClient.SqlClient, (sql) => rows(ProtonDbSummary, sql`SELECT * FROM protondb_summary ORDER BY edition_id`))

const importText = (text: string) => importProtonDb(chunks(text), null)
const reasonOf = (text: string) => Effect.map(Effect.flip(importText(text)), (e) => ('reason' in e ? e.reason : e._tag))

const today = new Date('2026-10-15T00:00:00Z')
const exportedAt = new Date('2026-10-01T00:00:00Z')

layer(PgTest)('importProtonDb', (it) => {
  describe('un export de octubre', () => {
    it.effect('guarda un resumen por edición de Steam del catálogo, sin duplicados ni reportes futuros', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          expect(yield* importText(october)).toEqual({ read: 9, discarded: 2, matched: 6, saved: 2, exported_at: exportedAt })
          expect(yield* saved).toEqual([
            {
              edition_id: e.oneSteam,
              exported_at: exportedAt,
              total_reports: 4,
              recent: 3,
              recent_working: 2,
              modest_recent: 2,
              modest_working: 1,
              latest_report: new Date('2026-09-01T00:00:00Z'),
              layer_variant: 'ge',
              layer_version: 'GE-Proton10-34',
              layer_reports: 2,
            },
            {
              edition_id: e.twoSteam,
              exported_at: exportedAt,
              total_reports: 1,
              recent: 1,
              recent_working: 1,
              modest_recent: 0,
              modest_working: 0,
              latest_report: exportedAt,
              layer_variant: 'official',
              layer_version: null,
              layer_reports: 1,
            },
          ])
        }),
      ).pipe(onDay(today)),
    )

    it.effect('importar el mismo export otra vez deja las mismas filas', () =>
      inRollback(
        Effect.gen(function* () {
          yield* scenario
          yield* importText(october)
          const first = yield* saved
          yield* importText(october)
          expect(yield* saved).toEqual(first)
        }),
      ).pipe(onDay(today)),
    )
  })

  describe('después de importar octubre', () => {
    it.effect('un export más nuevo reemplaza todo y quita la edición que ya no aparece', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          yield* importText(october)
          const november = exportOf(entry({ appId: '2000', date: '2026-11-01T00:00:00Z', works: false }))
          yield* importText(november).pipe(onDay(new Date('2026-11-15T00:00:00Z')))
          expect((yield* saved).map((r) => [r.edition_id, r.total_reports, r.recent_working, r.layer_variant])).toEqual([[e.twoSteam, 1, 0, null]])
        }),
      ).pipe(onDay(today)),
    )

    it.effect('una entrada vacía, truncada o sin reportes válidos falla y conserva lo importado', () =>
      inRollback(
        Effect.gen(function* () {
          yield* scenario
          yield* importText(october)
          const before = yield* saved
          expect(yield* reasonOf('')).toBe('la entrada está vacía')
          expect(yield* reasonOf(october.slice(0, october.length - 40))).toBe('el archivo está truncado')
          expect(yield* reasonOf('[{"app":{}}]')).toBe('ningún reporte válido')
          expect(yield* saved).toEqual(before)
        }),
      ).pipe(onDay(today)),
    )

    it.effect('--latest recuerda el export que descargó, y lo olvida si después se importa un archivo local', () =>
      inRollback(
        Effect.gen(function* () {
          yield* scenario
          const file = 'a'.repeat(40)
          yield* importProtonDb(chunks(october), file)
          expect(yield* alreadyImported('protondb', file)).toBe(true)
          yield* importText(october)
          expect(yield* alreadyImported('protondb', file)).toBe(false)
        }),
      ).pipe(onDay(today)),
    )

    it.effect('un export más antiguo que el importado se rechaza', () =>
      inRollback(
        Effect.gen(function* () {
          yield* scenario
          yield* importText(october)
          const before = yield* saved
          const september = exportOf(entry({ appId: '1000', date: '2026-09-01T00:00:00Z', works: false }))
          expect(yield* reasonOf(september)).toBe('exportación más antigua que la importada')
          expect(yield* saved).toEqual(before)
        }),
      ).pipe(onDay(today)),
    )
  })

  describe('lectura', () => {
    const guest = Visitor.of(Option.none())

    it.effect('la ficha y el catálogo muestran el resumen sin tocar el estado calculado ni los contadores', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const before = yield* catalog({})
          yield* importText(october)
          const after = yield* catalog({})
          expect(after.counters).toEqual(before.counters)
          expect(after.games.map((j) => [j.title, j.summary.status, j.protondb])).toEqual([
            ['Juego Dos', 'sin_evidencia', { recent: 1, recent_working: 1, total_reports: 1 }],
            ['Juego Tres', 'sin_evidencia', null],
            ['Juego Uno', 'sin_evidencia', { recent: 3, recent_working: 2, total_reports: 4 }],
          ])
          const page = yield* Effect.provideService(gamePage(e.one), Visitor, guest)
          expect(page.summary.status).toBe('sin_evidencia')
          expect(page.protondb).toEqual({
            game_id: e.one,
            app_id: '1000',
            edition_id: e.oneSteam,
            exported_at: exportedAt,
            total_reports: 4,
            recent: 3,
            recent_working: 2,
            modest_recent: 2,
            modest_working: 1,
            latest_report: new Date('2026-09-01T00:00:00Z'),
            layer_variant: 'ge',
            layer_version: 'GE-Proton10-34',
            layer_reports: 2,
          })
          expect((yield* Effect.provideService(gamePage(e.three), Visitor, guest)).protondb).toBeNull()
        }),
      ).pipe(onDay(today)),
    )
  })
})
