import { describe, expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { Unauthenticated } from '../src/domain/errors.ts'
import { FollowChange } from '../src/domain/follow.ts'
import { GameId, UserId } from '../src/domain/ids.ts'
import { type SignedInUser, Visitor } from '../src/server/auth.ts'
import { changeFollow } from '../src/server/commands/follow.ts'
import { myFollows, session } from '../src/server/queries/follow.ts'
import { gamePage } from '../src/server/queries/game.ts'
import { inRollback, idOf, onDay, PgTest } from './support.ts'

type Value = string | number | boolean | Date | null

const today = new Date('2026-10-15T00:00:00Z')

const scenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insert = (table: string, row: Record<string, Value>) => idOf(sql`INSERT INTO ${sql(table)} ${sql.insert(row)} RETURNING id`)
  // Ids and names no other test file uses: db files run in parallel, and two transactions inserting the same keys deadlock.
  const insertUser = (alias: string, role: SignedInUser['role']) =>
    Effect.as(
      sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES (${alias}, ${alias}, ${`${alias}@opengame.test`}, false, ${role}, true)`,
      { id: UserId.make(alias), alias, role } satisfies SignedInUser,
    )
  const ana = yield* insertUser('fo_ana', 'usuario')
  const author = yield* insertUser('fo_autor', 'usuario')
  yield* insertUser('fo_rita', 'revisor')

  const launcher = yield* insert('launcher', { name: 'fo_lanzador' })
  const game = GameId.make(yield* insert('game', { title: 'fo_juego', description: 'd' }))
  const edition = yield* insert('game_edition', { game_id: game, launcher_id: launcher })
  const distribution = yield* insert('distribution', { name: 'fo_distro', version: '1' })
  const layerVersion = yield* insert('layer_version', { family: 'Proton', variant: 'fo', version: '1.0' })
  const machine = yield* insert('machine', { user_id: author.id, alias: 'torre' })
  const diagnostic = yield* insert('diagnostic', {
    machine_id: machine,
    captured_at: new Date('2026-09-01T00:00:00Z'),
    operating_system: 'Linux',
    os_version: '6.8',
    distribution_id: distribution,
    architecture: 'x86_64',
    cpu_model: 'cpu',
    gpu_model: 'gpu',
    ram_mb: 8192,
    vulkan_support: 'desconocido',
  })
  const approvedReport = (outcome: string, reviewed_at: string) =>
    insert('report', {
      edition_id: edition,
      diagnostic_id: diagnostic,
      layer_version_id: layerVersion,
      game_version: '1.0',
      tested_at: new Date('2026-10-02T12:00:00Z'),
      outcome,
      observations: 'o',
      created_at: new Date('2026-10-03T00:00:00Z'),
      review_status: 'aprobado',
      reviewer_id: 'fo_rita',
      reviewed_at: new Date(reviewed_at),
      review_reason: 'probado',
      review_evidence: 'captura',
    })
  const seenAt = (at: string) => sql`UPDATE game_follow SET seen_at = ${new Date(at)} WHERE user_id = ${ana.id} AND game_id = ${game}`
  const follows = Effect.map(
    sql`SELECT seen_at FROM game_follow WHERE user_id = ${ana.id} AND game_id = ${game}`,
    Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ seen_at: Schema.Date }))),
  )
  return { sql, ana, game, approvedReport, seenAt, follows }
})

/** Runs `program` as `user` (null: a guest) in a savepoint, so a refused write leaves the test transaction usable. */
const asUser =
  (user: SignedInUser | null) =>
  <A, E>(program: Effect.Effect<A, E, SqlClient.SqlClient | Visitor>) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(program)).pipe(Effect.provideService(Visitor, Option.fromNullOr(user)))

const change = (input: unknown) => changeFollow(Schema.decodeUnknownSync(FollowChange)(input))

layer(PgTest)('seguir un juego', (it) => {
  describe('changeFollow', () => {
    it.effect('seguir dos veces deja una fila con el primer visto; dejar de seguir la borra', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          expect(yield* asUser(e.ana)(change({ _tag: 'Seguir', game_id: e.game }))).toEqual({ changed: true })
          yield* e.seenAt('2026-10-01T00:00:00Z')
          expect(yield* asUser(e.ana)(change({ _tag: 'Seguir', game_id: e.game }))).toEqual({ changed: false })
          expect(yield* e.follows).toEqual([{ seen_at: new Date('2026-10-01T00:00:00Z') }])
          expect(yield* asUser(e.ana)(change({ _tag: 'Dejar', game_id: e.game }))).toEqual({ changed: true })
          expect(yield* asUser(e.ana)(change({ _tag: 'Dejar', game_id: e.game }))).toEqual({ changed: false })
          expect(yield* e.follows).toEqual([])
        }),
      ))

    it.effect('marcar como visto solo avanza, y nunca más allá de ahora', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          yield* asUser(e.ana)(change({ _tag: 'Seguir', game_id: e.game }))
          yield* e.seenAt('2026-10-01T00:00:00Z')
          const visto = (seen_at: string) => asUser(e.ana)(change({ _tag: 'Visto', game_id: e.game, seen_at }))
          expect(yield* visto('2026-09-01T00:00:00.000Z')).toEqual({ changed: false })
          expect(yield* visto('2026-10-05T00:00:00.000Z')).toEqual({ changed: true })
          expect(yield* e.follows).toEqual([{ seen_at: new Date('2026-10-05T00:00:00Z') }])
          expect(yield* visto('2999-01-01T00:00:00.000Z')).toEqual({ changed: true })
          expect(yield* e.sql`SELECT seen_at = now() AS clamped FROM game_follow WHERE game_id = ${e.game}`).toEqual([{ clamped: true }])
        }),
      ))

    it.effect('un invitado no sigue nada, y seguir un juego que no existe no cambia nada', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          expect(yield* Effect.flip(asUser(null)(change({ _tag: 'Seguir', game_id: e.game })))).toEqual(new Unauthenticated())
          expect(yield* asUser(e.ana)(change({ _tag: 'Seguir', game_id: 999999 }))).toEqual({ changed: false })
          expect(yield* e.follows).toEqual([])
        }),
      ))
  })

  describe('novedades', () => {
    it.effect('lo aprobado después de visto es novedad en la ficha, en Seguidos y en la cabecera; lo retirado deja de contar', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          yield* e.approvedReport('funciona', '2026-10-04T00:00:00Z')
          yield* asUser(e.ana)(change({ _tag: 'Seguir', game_id: e.game }))
          yield* e.seenAt('2026-10-05T00:00:00Z')
          const later = yield* e.approvedReport('no_inicia', '2026-10-08T00:00:00Z')
          const news = { approved: 1, previous_status: 'funciona' }

          const asAna = <A, E>(program: Effect.Effect<A, E, SqlClient.SqlClient | Visitor>) =>
            Effect.provideService(program, Visitor, Option.some(e.ana)).pipe(onDay(today))
          const page = yield* asAna(gamePage(e.game))
          expect([page.summary.status, page.follow?.news, page.as_of]).toEqual(['resultados_variables', news, today])
          expect((yield* asAna(myFollows)).games.map((g) => [g.title, g.status, g.news])).toEqual([['fo_juego', 'resultados_variables', news]])
          expect((yield* asAna(session)).followed_news).toBe(1)

          yield* e.sql`UPDATE report SET review_status = 'retirado', reviewed_at = ${new Date('2026-10-09T00:00:00Z')} WHERE id = ${later}`
          expect((yield* asAna(gamePage(e.game))).follow?.news).toEqual({ approved: 0, previous_status: null })
          expect((yield* asAna(session)).followed_news).toBe(0)
          expect((yield* Effect.provideService(gamePage(e.game), Visitor, Option.none())).follow).toBeNull()
        }),
      ))
  })
})
