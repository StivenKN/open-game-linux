import { expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { NewGame, RejectRequest, RequestGame } from '../src/domain/contributions.ts'
import { Forbidden, NotFound, RuleViolated, Unauthenticated } from '../src/domain/errors.ts'
import { UserId } from '../src/domain/ids.ts'
import type { Role } from '../src/domain/review.ts'
import { type SignedInUser, Visitor } from '../src/server/auth.ts'
import { createGame } from '../src/server/commands/contributions.ts'
import { rejectRequest, requestGame, withdrawRequest } from '../src/server/commands/game-requests.ts'
import { myContributions } from '../src/server/queries/contributions.ts'
import { gameRequests } from '../src/server/queries/game-requests.ts'
import { en } from '../src/ui/i18n/en.ts'
import { es } from '../src/ui/i18n/es.ts'
import { ruleErrors } from '../src/ui/useAction.ts'
import { constraintOf, idOf, inRollback, PgTest } from './support.ts'

const scenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertUser = (alias: string, email: string, role: Role) =>
    Effect.as(
      sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES (${alias}, ${alias}, ${email}, false, ${role}, true)`,
      { id: UserId.make(alias), alias, role } satisfies SignedInUser,
    )
  // Ids no other test file uses: db files run in parallel, and two transactions inserting the same ids deadlock.
  const ana = yield* insertUser('gr_ana', 'gr_ana@opengame.test', 'usuario')
  const bruno = yield* insertUser('gr_bruno', 'gr_bruno@opengame.test', 'usuario')
  const demo = yield* insertUser('gr_demo', 'gr_demo@demo.opengame.test', 'usuario')
  const rita = yield* insertUser('gr_rita', 'gr_rita@opengame.test', 'revisor')
  const steam = yield* idOf(sql`INSERT INTO launcher (name) VALUES ('Steam') RETURNING id`)
  const gog = yield* idOf(sql`INSERT INTO launcher (name) VALUES ('GOG') RETURNING id`)
  const eldenRing = yield* idOf(sql`INSERT INTO game (title, description) VALUES ('Elden Ring', 'd') RETURNING id`)
  yield* sql`INSERT INTO game_edition (game_id, launcher_id, external_id) VALUES (${eldenRing}, ${steam}, '1245620')`
  const witcher = yield* idOf(sql`INSERT INTO game (title, description) VALUES ('The Witcher 3: Wild Hunt', 'd') RETURNING id`)
  yield* sql`INSERT INTO game_edition (game_id, launcher_id) VALUES (${witcher}, ${gog})`
  return { sql, ana, bruno, demo, rita, steam, eldenRing, witcher }
})
type Scenario = Effect.Success<typeof scenario>

const inScenario = (test: (e: Scenario) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () => inRollback(Effect.flatMap(scenario, test))

/** Runs `program` as `user` (null: a guest) in a savepoint, so a refused write leaves the test transaction usable. */
const asUser =
  (user: SignedInUser | null) =>
  <A, E>(program: Effect.Effect<A, E, SqlClient.SqlClient | Visitor>) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(program)).pipe(Effect.provideService(Visitor, Option.fromNullOr(user)))

const ask = (title: string, steam_app_id: string | null = null) => requestGame(Schema.decodeUnknownSync(RequestGame)({ _tag: 'nuevo', title, steam_app_id }))
const join = (id: number) => requestGame(Schema.decodeUnknownSync(RequestGame)({ _tag: 'existente', id }))
const reject = (id: number) => rejectRequest(Schema.decodeUnknownSync(RejectRequest)({ id, reason: 'No es un juego de Windows' }))
/** Requests a game the catalog lacks and returns the request's id. */
const opened = (user: SignedInUser, title: string, steam_app_id: string | null = null) =>
  Effect.flatMap(asUser(user)(ask(title, steam_app_id)), (o) => (o._tag === 'pedido' ? Effect.succeed(o.request.id) : Effect.die(`${title} is in the catalog`)))

const requests = (e: Scenario) =>
  e.sql`SELECT r.title, r.steam_app_id, r.status, count(u.user_id)::int AS requesters
        FROM game_request r LEFT JOIN game_request_user u ON u.request_id = r.id GROUP BY r.id ORDER BY r.id`

layer(PgTest)('game requests', (it) => {
  it.effect('one open request per game: the same App ID, or the same title when one side has no App ID, joins it', inScenario((e) =>
    Effect.gen(function* () {
      const first = yield* asUser(e.ana)(ask('Cyberpunk 2077', 'https://store.steampowered.com/app/1091500/Cyberpunk_2077/'))
      expect(first).toMatchObject({ _tag: 'pedido', request: { title: 'Cyberpunk 2077' }, requesters: 1 })
      expect(yield* asUser(e.bruno)(ask('cyberpunk', '1091500'))).toMatchObject({ request: { title: 'Cyberpunk 2077' }, requesters: 2 })
      expect(yield* asUser(e.demo)(ask('CYBERPUNK 2077!'))).toMatchObject({ request: { title: 'Cyberpunk 2077' }, requesters: 3 })

      yield* asUser(e.ana)(ask('Hollow Knight'))
      expect(yield* asUser(e.bruno)(ask('hollow-knight', '367520'))).toMatchObject({ request: { title: 'Hollow Knight' }, requesters: 2 })

      // Same title, two App IDs: two games (DOOM 1993 and DOOM 2016).
      yield* asUser(e.ana)(ask('DOOM', '2280'))
      expect(yield* asUser(e.bruno)(ask('Doom', '379720'))).toMatchObject({ request: { title: 'Doom' }, requesters: 1 })

      expect(yield* requests(e)).toEqual([
        { title: 'Cyberpunk 2077', steam_app_id: 1091500, status: 'abierto', requesters: 3 },
        // bruno's App ID stays with the request he joined.
        { title: 'Hollow Knight', steam_app_id: 367520, status: 'abierto', requesters: 2 },
        { title: 'DOOM', steam_app_id: 2280, status: 'abierto', requesters: 1 },
        { title: 'Doom', steam_app_id: 379720, status: 'abierto', requesters: 1 },
      ])
    })))

  it.effect('requesting twice, or joining a request you are in, changes nothing', inScenario((e) =>
    Effect.gen(function* () {
      const first = yield* asUser(e.ana)(ask('Hades'))
      expect(first).toMatchObject({ _tag: 'pedido', requesters: 1 })
      expect(yield* asUser(e.ana)(ask('Hades'))).toEqual(first)
      expect(yield* asUser(e.ana)(join(yield* opened(e.ana, 'Hades')))).toEqual(first)
      expect(yield* requests(e)).toEqual([{ title: 'Hades', steam_app_id: null, status: 'abierto', requesters: 1 }])
    })))

  it.effect('a game already in the catalog, by its Steam App ID or by its title, is pointed to and nothing is written', inScenario((e) =>
    Effect.gen(function* () {
      const elden = { _tag: 'en_catalogo', game: { id: e.eldenRing, title: 'Elden Ring' } }
      expect(yield* asUser(e.ana)(ask('elden', '1245620'))).toEqual(elden)
      expect(yield* asUser(e.ana)(ask('ELDEN RING'))).toEqual(elden)
      // The Witcher 3 has no Steam App ID in the catalog, so its title decides.
      expect(yield* asUser(e.ana)(ask('The Witcher 3 - Wild Hunt', '292030'))).toMatchObject({ _tag: 'en_catalogo', game: { id: e.witcher } })
      // Elden Ring's Steam edition has another App ID: a game with the same title is another game.
      expect(yield* asUser(e.ana)(ask('Elden Ring', '999999'))).toMatchObject({ _tag: 'pedido' })
      expect((yield* requests(e)).length).toBe(1)
    })))

  it.effect('a guest cannot request, and a closed or unknown request cannot be joined', inScenario((e) =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(asUser(null)(ask('Hades')))).toEqual(new Unauthenticated())
      const hades = yield* opened(e.ana, 'Hades')
      yield* asUser(e.rita)(reject(hades))
      expect(yield* Effect.flip(asUser(e.bruno)(join(hades)))).toEqual(new RuleViolated({ rule: 'pedido_cerrado' }))
      expect(yield* Effect.flip(asUser(e.bruno)(join(999999)))).toEqual(new NotFound())
      // A rejected request no longer blocks a new one for the same game.
      expect(yield* asUser(e.bruno)(ask('Hades'))).toMatchObject({ _tag: 'pedido', requesters: 1 })
    })))

  it.effect('the writer sends a code, and each language words it under the field it names', inScenario((e) =>
    Effect.gen(function* () {
      const hades = yield* opened(e.ana, 'Hades')
      yield* asUser(e.rita)(reject(hades))
      const failure = yield* Effect.flip(asUser(e.bruno)(join(hades)))
      if (!Schema.is(RuleViolated)(failure)) return expect.fail(`expected a rule violation, got ${failure._tag}`)
      expect(ruleErrors(failure, es)).toEqual({ form: 'Ese pedido ya se cerró: un revisor lo cumplió o lo rechazó.' })
      expect(ruleErrors(failure, en)).toEqual({ form: 'That request is already closed: a reviewer fulfilled or rejected it.' })
    })))

  it.effect('withdrawing leaves the request to the others; the last requester out deletes it', inScenario((e) =>
    Effect.gen(function* () {
      const hades = yield* opened(e.ana, 'Hades')
      yield* asUser(e.bruno)(join(hades))
      yield* asUser(e.ana)(withdrawRequest(hades))
      expect(yield* requests(e)).toEqual([{ title: 'Hades', steam_app_id: null, status: 'abierto', requesters: 1 }])
      yield* asUser(e.bruno)(withdrawRequest(hades))
      expect(yield* requests(e)).toEqual([])
      expect(yield* Effect.flip(asUser(e.bruno)(withdrawRequest(hades)))).toEqual(new NotFound())
    })))

  it.effect('only a reviewer rejects, with a reason, and only an open request', inScenario((e) =>
    Effect.gen(function* () {
      const hades = yield* opened(e.ana, 'Hades')
      expect(yield* Effect.flip(asUser(e.ana)(reject(hades)))).toEqual(new Forbidden())
      yield* asUser(e.rita)(reject(hades))
      expect(yield* e.sql`SELECT status, resolved_by, rejection_reason, game_id FROM game_request WHERE id = ${hades}`).toEqual([
        { status: 'rechazado', resolved_by: 'gr_rita', rejection_reason: 'No es un juego de Windows', game_id: null },
      ])
      expect(yield* Effect.flip(asUser(e.rita)(reject(hades)))).toEqual(new RuleViolated({ rule: 'pedido_cerrado' }))
      expect(yield* Effect.flip(asUser(e.ana)(withdrawRequest(hades)))).toEqual(new RuleViolated({ rule: 'pedido_cerrado' }))
    })))

  it.effect('creating the game from a request fulfils it in the same transaction; a closed request writes no game', inScenario((e) =>
    Effect.gen(function* () {
      const newGame = (title: string, external_id: string, request_id: number) =>
        createGame(
          Schema.decodeUnknownSync(NewGame)({
            title,
            description: 'RPG de mundo abierto en Night City.',
            editions: [{ launcher_id: e.steam, external_id }],
            apis: ['d3d12'],
            x86_level_min: null,
            request_id,
          }),
        )
      const request = yield* opened(e.ana, 'Cyberpunk 2077', '1091500')
      const { id } = yield* asUser(e.rita)(newGame('Cyberpunk 2077', '1091500', request))
      expect(yield* e.sql`SELECT status, resolved_by, game_id FROM game_request WHERE id = ${request}`).toEqual([
        { status: 'cumplido', resolved_by: 'gr_rita', game_id: id },
      ])
      expect(yield* asUser(e.bruno)(ask('Cyberpunk 2077', '1091500'))).toEqual({ _tag: 'en_catalogo', game: { id, title: 'Cyberpunk 2077' } })

      const rejected = yield* opened(e.ana, 'Hades')
      yield* asUser(e.rita)(reject(rejected))
      expect(yield* Effect.flip(asUser(e.rita)(newGame('Hades', '1145360', rejected)))).toEqual(new RuleViolated({ rule: 'pedido_cerrado' }))
      expect(yield* e.sql`SELECT count(*)::int AS n FROM game WHERE title = 'Hades'`).toEqual([{ n: 0 }])
    })))

  it.effect('creating a game without its request still fulfils every open request that asks for it', inScenario((e) =>
    Effect.gen(function* () {
      const byAppId = yield* opened(e.ana, 'cyberpunk', '1091500')
      const byTitle = yield* opened(e.bruno, 'Hades')
      const other = yield* opened(e.bruno, 'Celeste')
      const { id } = yield* asUser(e.rita)(
        createGame(
          Schema.decodeUnknownSync(NewGame)({
            title: 'Cyberpunk 2077',
            description: 'd',
            editions: [{ launcher_id: e.steam, external_id: '1091500' }],
            apis: ['d3d12'],
            x86_level_min: null,
            request_id: null,
          }),
        ),
      )
      const { id: hades } = yield* asUser(e.rita)(
        createGame(Schema.decodeUnknownSync(NewGame)({ title: 'HADES', description: 'd', editions: [{ launcher_id: e.steam, external_id: '1145360' }], apis: ['vulkan'], x86_level_min: null, request_id: null })),
      )
      expect(yield* e.sql`SELECT id, status, game_id FROM game_request ORDER BY id`).toEqual([
        { id: byAppId, status: 'cumplido', game_id: id },
        { id: byTitle, status: 'cumplido', game_id: hades },
        { id: other, status: 'abierto', game_id: null },
      ])
    })))

  it.effect('/pedidos lists open requests by requester count, and Mis aportes shows each requester their requests in every state', inScenario((e) =>
    Effect.gen(function* () {
      const hades = yield* opened(e.demo, 'Hades')
      const celeste = yield* opened(e.demo, 'Celeste')
      yield* asUser(e.ana)(join(celeste))
      const tunic = yield* opened(e.ana, 'Tunic')
      yield* asUser(e.rita)(reject(tunic))

      const asAna = yield* Effect.provideService(gameRequests, Visitor, Option.some(e.ana))
      expect(asAna.map((r) => [r.title, r.requesters, r.mine, r.demo])).toEqual([
        ['Celeste', 2, true, false],
        ['Hades', 1, false, true],
      ])
      const asGuest = yield* Effect.provideService(gameRequests, Visitor, Option.none())
      expect(asGuest.map((r) => [r.id, r.mine])).toEqual([[celeste, false], [hades, false]])

      const { requests } = yield* Effect.provideService(myContributions, Visitor, Option.some(e.ana))
      expect(requests).toEqual([
        expect.objectContaining({ id: tunic, status: 'rechazado', rejection_reason: 'No es un juego de Windows' }),
        expect.objectContaining({ id: celeste, status: 'abierto', requesters: 2 }),
      ])
      // Decoding keeps only the members' columns: an open request carries no resolution.
      expect(Object.keys(requests[1] ?? {}).sort()).toEqual(['id', 'requested_at', 'requesters', 'status', 'title'])
    })))

  it.effect('the table shapes each state: an open request names no game and no reviewer', inScenario((e) =>
    Effect.gen(function* () {
      const hades = yield* opened(e.ana, 'Hades')
      expect(yield* constraintOf(e.sql`UPDATE game_request SET game_id = ${e.eldenRing} WHERE id = ${hades}`)).toEqual(Option.some('game_request_resolution'))
      expect(yield* constraintOf(e.sql`UPDATE game_request SET status = 'cumplido', resolved_by = 'gr_rita', resolved_at = now() WHERE id = ${hades}`)).toEqual(
        Option.some('game_request_resolution'),
      )
      expect(yield* constraintOf(e.sql`UPDATE game_request SET status = 'rechazado', resolved_by = 'gr_rita', resolved_at = now(), rejection_reason = ' ' WHERE id = ${hades}`)).toEqual(
        Option.some('game_request_resolution'),
      )
    })))
})
