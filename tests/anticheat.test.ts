import { describe, expect, layer } from '@effect/vitest'
import { Effect, Option } from 'effect'
import { SqlClient } from 'effect/sql'
import { EditionId, GameId } from '../src/domain/ids.ts'
import { AntiCheatEntry } from '../src/domain/tables.ts'
import { Visitor } from '../src/server/auth.ts'
import { importAntiCheat } from '../src/server/external/anticheat.ts'
import { alreadyImported } from '../src/server/external/sources.ts'
import { catalog } from '../src/server/queries/catalog.ts'
import { gamePage } from '../src/server/queries/game.ts'
import { rows } from '../src/server/rows.ts'
import { inRollback, idOf, PgTest } from './support.ts'

async function* chunks(text: string) {
  for (let i = 0; i < text.length; i += 7) yield text.slice(i, i + 7)
}

type Entry = { slug: string; status: string; steam?: string; date?: string; anticheats?: ReadonlyArray<string> }

const entry = ({ slug, status, steam, date = '2025-01-01T00:00:00.000Z', anticheats = ['Easy Anti-Cheat'] }: Entry) =>
  JSON.stringify({ name: slug, status, anticheats, notes: [], updates: [], storeIds: steam === undefined ? {} : { steam }, slug, dateChanged: date })

const listOf = (...elements: ReadonlyArray<string>) => `[\n${elements.join(',\n')}\n]`

const list = listOf(
  entry({ slug: 'uno-antes', status: 'Running', steam: '1000', date: '2024-09-22T22:18:43.803Z' }),
  entry({ slug: 'uno', status: 'Denied', steam: '1000', date: '2025-08-07T20:28:01.0000000-04:00', anticheats: ['BattlEye', 'FairFight'] }),
  entry({ slug: 'dos', status: 'Supported', steam: '2000' }),
  entry({ slug: 'fuera-del-catalogo', status: 'Broken', steam: '3000' }),
  entry({ slug: 'solo-epic', status: 'Broken' }),
  '{"status":"Quizás"}',
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
  return {
    one: GameId.make(one),
    three: GameId.make(three),
    oneSteam: EditionId.make(oneSteam),
    twoSteam: EditionId.make(twoSteam),
    addSteamGame: Effect.gen(function* () {
      const four = yield* insert('game', { title: 'Juego Cuatro', description: 'd' })
      yield* insert('game_edition', { game_id: four, launcher_id: steam, external_id: '3000' })
    }),
  }
})

const saved = Effect.flatMap(SqlClient.SqlClient, (sql) => rows(AntiCheatEntry, sql`SELECT * FROM anticheat_entry ORDER BY edition_id`))

const importText = (text: string, file: string | null = null) => importAntiCheat(chunks(text), file)
const reasonOf = (text: string) => Effect.map(Effect.flip(importText(text)), (e) => ('reason' in e ? e.reason : e._tag))

const sha = (n: number) => n.toString(16).padStart(40, '0')

layer(PgTest)('importAntiCheat', (it) => {
  describe('una lista de AreWeAntiCheatYet', () => {
    it.effect('guarda una entrada por edición de Steam del catálogo, la más reciente si dos nombran la misma app', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          expect(yield* importText(list)).toEqual({ read: 6, discarded: 1, matched: 3, saved: 2 })
          expect(yield* saved).toEqual([
            {
              edition_id: e.oneSteam,
              status: 'Denied',
              anticheats: ['BattlEye', 'FairFight'],
              changed_at: new Date('2025-08-08T00:28:01Z'),
              slug: 'uno',
            },
            { edition_id: e.twoSteam, status: 'Supported', anticheats: ['Easy Anti-Cheat'], changed_at: new Date('2025-01-01T00:00:00Z'), slug: 'dos' },
          ])
        }),
      ),
    )

    it.effect('importar la misma lista otra vez deja las mismas filas', () =>
      inRollback(
        Effect.gen(function* () {
          yield* scenario
          yield* importText(list)
          const first = yield* saved
          yield* importText(list)
          expect(yield* saved).toEqual(first)
        }),
      ),
    )
  })

  describe('después de importar una lista', () => {
    it.effect('una lista nueva reemplaza todo y quita el juego que ya no aparece', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          yield* importText(list)
          yield* importText(listOf(entry({ slug: 'dos', status: 'Broken', steam: '2000' })))
          expect((yield* saved).map((r) => [r.edition_id, r.status])).toEqual([[e.twoSteam, 'Broken']])
        }),
      ),
    )

    it.effect('una entrada vacía, truncada o sin juegos válidos falla y conserva lo importado', () =>
      inRollback(
        Effect.gen(function* () {
          yield* scenario
          yield* importText(list)
          const before = yield* saved
          expect(yield* reasonOf('')).toBe('la entrada está vacía')
          expect(yield* reasonOf(list.slice(0, list.length - 40))).toBe('el archivo está truncado')
          expect(yield* reasonOf('{"games":[]}')).toBe('no es un arreglo JSON')
          expect(yield* reasonOf('[]')).toBe('ningún juego válido')
          expect(yield* reasonOf('[{"status":"Denied"}]')).toBe('ningún juego válido')
          expect(yield* saved).toEqual(before)
        }),
      ),
    )
  })

  describe('--latest', () => {
    it.effect('salta un archivo ya importado, salvo que el catálogo gane un juego de Steam o lo último fuera un archivo local', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          expect(yield* alreadyImported('anticheat', sha(1))).toBe(false)
          yield* importText(list, sha(1))
          expect(yield* alreadyImported('anticheat', sha(1))).toBe(true)
          expect(yield* alreadyImported('anticheat', sha(2))).toBe(false)
          expect(yield* alreadyImported('protondb', sha(1))).toBe(false)

          yield* e.addSteamGame
          expect(yield* alreadyImported('anticheat', sha(1))).toBe(false)
          yield* importText(list, sha(1))
          expect(yield* alreadyImported('anticheat', sha(1))).toBe(true)

          yield* importText(list)
          expect(yield* alreadyImported('anticheat', sha(1))).toBe(false)
        }),
      ),
    )

    it.effect('un import que falla no cambia lo que --latest recuerda', () =>
      inRollback(
        Effect.gen(function* () {
          yield* scenario
          yield* importText(list, sha(1))
          yield* Effect.flip(importText('[]', sha(2)))
          expect(yield* alreadyImported('anticheat', sha(1))).toBe(true)
        }),
      ),
    )
  })

  describe('lectura', () => {
    const guest = Visitor.of(Option.none())

    it.effect('«sin bloqueo anti-cheat» oculta lo roto o denegado y la tarjeta lo dice, sin tocar el estado calculado', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const before = yield* catalog({})
          yield* importText(list)
          const after = yield* catalog({})
          expect(after.counters).toEqual(before.counters)
          expect(after.games.map((j) => [j.title, j.summary.status, j.anticheat])).toEqual([
            ['Juego Dos', 'sin_evidencia', null],
            ['Juego Tres', 'sin_evidencia', null],
            ['Juego Uno', 'sin_evidencia', 'Denied'],
          ])
          expect((yield* catalog({ sin_anti_cheat: true })).games.map((j) => j.title)).toEqual(['Juego Dos', 'Juego Tres'])

          const page = yield* Effect.provideService(gamePage(e.one), Visitor, guest)
          expect(page.summary.status).toBe('sin_evidencia')
          expect(page.anticheat).toEqual({
            game_id: e.one,
            edition_id: e.oneSteam,
            status: 'Denied',
            anticheats: ['BattlEye', 'FairFight'],
            changed_at: new Date('2025-08-08T00:28:01Z'),
            slug: 'uno',
          })
          expect((yield* Effect.provideService(gamePage(e.three), Visitor, guest)).anticheat).toBeNull()
        }),
      ),
    )
  })
})
