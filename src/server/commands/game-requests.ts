import { Effect, Schema, Struct } from 'effect'
import { SqlClient, type Statement } from 'effect/sql'
import type { RejectRequest, RequestGame } from '../../domain/contributions.ts'
import { NotFound, RuleViolated, type Forbidden } from '../../domain/errors.ts'
import type { GameRequestStatus } from '../../domain/game-requests.ts'
import type { GameId, GameRequestId } from '../../domain/ids.ts'
import { STEAM_LAUNCHER, type SteamAppId } from '../../domain/library.ts'
import { Game, GameRequest } from '../../domain/tables.ts'
import { requireReviewer, requireUser, type Reviewer } from '../auth.ts'
import { oneRow, rows } from '../rows.ts'
import type { Write } from './contributions.ts'

const open: GameRequestStatus = 'abierto'
const fulfilled: GameRequestStatus = 'cumplido'
const rejected: GameRequestStatus = 'rechazado'

const RequestRow = GameRequest.mapFields(Struct.pick(['id', 'title']))
const RequestStatus = GameRequest.mapFields(Struct.pick(['id', 'title', 'status']))
const CatalogGame = Game.mapFields(Struct.pick(['id', 'title']))
const Requesters = Schema.Struct({ requesters: Schema.Int })

export type RequestOutcome =
  | { readonly _tag: 'en_catalogo'; readonly game: typeof CatalogGame.Type }
  | { readonly _tag: 'pedido'; readonly request: typeof RequestRow.Type; readonly requesters: number }

/** Two titles name the same game when their letters and digits match, ignoring case, spaces and punctuation. */
const titleKey = (sql: SqlClient.SqlClient, title: string | Statement.Fragment) => sql`lower(regexp_replace(${title}, '[^[:alnum:]]+', '', 'g'))`

/** The catalog game aliased `game` has a Steam edition where `edition` (on alias `e`) holds. */
const steamEdition = (sql: SqlClient.SqlClient, edition: Statement.Fragment) =>
  sql`EXISTS (SELECT 1 FROM game_edition e JOIN launcher l ON l.id = e.launcher_id WHERE e.game_id = game.id AND l.name = ${STEAM_LAUNCHER} AND ${edition})`

/**
 * A request with this title and App ID (values, or columns of a request row) asks for the catalog game aliased
 * `game` when its Steam edition has that App ID, or when the titles match and one of the two has no App ID.
 */
const asksFor = (sql: SqlClient.SqlClient, title: string | Statement.Fragment, appid: SteamAppId | null | Statement.Fragment) =>
  sql`(${steamEdition(sql, sql`e.external_id = (${appid})::integer::text`)}
       OR (${titleKey(sql, sql`game.title`)} = ${titleKey(sql, title)}
           AND ((${appid})::integer IS NULL OR NOT ${steamEdition(sql, sql`e.external_id IS NOT NULL`)})))`

// Every writer takes this lock first, so two first requests for one game cannot both create it, and a join,
// a withdrawal and a close never interleave.
const lockRequests = Effect.flatMap(SqlClient.SqlClient, (sql) => sql`LOCK TABLE game_request IN SHARE ROW EXCLUSIVE MODE`)

const openRequest = (id: GameRequestId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* lockRequests
    const [request] = yield* rows(RequestStatus, sql`SELECT id, title, status FROM game_request WHERE id = ${id}`)
    if (request === undefined) return yield* Effect.fail(new NotFound())
    if (request.status !== open) return yield* Effect.fail(new RuleViolated({ rule: 'pedido_cerrado' }))
    return Struct.pick(request, ['id', 'title'])
  })

/**
 * The catalog game a new request asks for, else the open request it joins (same App ID, or same title when either
 * has no App ID; an App ID it brings is kept), else a new request.
 */
const matchOrCreate = (title: string, appid: SteamAppId | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* lockRequests
    const [game] = yield* rows(CatalogGame, sql`SELECT game.id, game.title FROM game WHERE ${asksFor(sql, title, appid)} ORDER BY game.id LIMIT 1`)
    if (game !== undefined) return { _tag: 'en_catalogo', game } as const
    const [existing] = yield* rows(
      RequestRow,
      sql`SELECT id, title FROM game_request
          WHERE status = ${open}
            AND (steam_app_id = (${appid})::integer
                 OR (${titleKey(sql, sql`title`)} = ${titleKey(sql, title)} AND (steam_app_id IS NULL OR (${appid})::integer IS NULL)))
          ORDER BY (steam_app_id = (${appid})::integer) IS TRUE DESC, id LIMIT 1`,
    )
    if (existing === undefined)
      return { _tag: 'pedido', request: yield* oneRow(RequestRow, sql`INSERT INTO game_request ${sql.insert({ title, steam_app_id: appid })} RETURNING id, title`) } as const
    if (appid !== null) yield* sql`UPDATE game_request SET steam_app_id = ${appid} WHERE id = ${existing.id} AND steam_app_id IS NULL`
    return { _tag: 'pedido', request: existing } as const
  })

/**
 * The single writer of game_request and game_request_user. One open request per game: a new request joins the
 * open one with its Steam App ID, or with its title when either has no App ID. A game already in the catalog,
 * matched the same way against its Steam edition, is pointed to instead. Requesting twice changes nothing.
 */
export const requestGame = (input: RequestGame): Write<RequestOutcome, RuleViolated | NotFound> =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const target = input._tag === 'existente' ? { _tag: 'pedido', request: yield* openRequest(input.id) } as const : yield* matchOrCreate(input.title, input.steam_app_id)
    if (target._tag === 'en_catalogo') return target
    yield* sql`INSERT INTO game_request_user ${sql.insert({ request_id: target.request.id, user_id: user.id })} ON CONFLICT DO NOTHING`
    const { requesters } = yield* oneRow(Requesters, sql`SELECT count(*)::int AS requesters FROM game_request_user WHERE request_id = ${target.request.id}`)
    return { ...target, requesters }
  })

/** "Ya no lo pido": the visitor leaves an open request. A request nobody asks for any more is deleted. */
export const withdrawRequest = (id: GameRequestId): Write<{ readonly id: GameRequestId }, RuleViolated | NotFound> =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    yield* openRequest(id)
    yield* sql`DELETE FROM game_request_user WHERE request_id = ${id} AND user_id = ${user.id}`
    yield* sql`DELETE FROM game_request r WHERE r.id = ${id} AND NOT EXISTS (SELECT 1 FROM game_request_user u WHERE u.request_id = r.id)`
    return { id }
  })

export const rejectRequest = (r: RejectRequest): Write<{ readonly id: GameRequestId }, RuleViolated | NotFound | Forbidden> =>
  Effect.gen(function* () {
    const reviewer = yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    yield* openRequest(r.id)
    yield* sql`UPDATE game_request SET status = ${rejected}, resolved_by = ${reviewer.id}, resolved_at = now(), rejection_reason = ${r.reason} WHERE id = ${r.id}`
    return { id: r.id }
  })

/**
 * Called by createGame, inside its transaction, once the game and its editions exist. The request it started from,
 * which must still be open, and every other open request that asks for the game become cumplido and link to it.
 */
export const fulfillRequests = (reviewer: Reviewer, game_id: GameId, from: GameRequestId | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* from === null ? lockRequests : openRequest(from)
    yield* sql`UPDATE game_request r SET status = ${fulfilled}, resolved_by = ${reviewer.id}, resolved_at = now(), game_id = ${game_id}
               FROM game
               WHERE game.id = ${game_id} AND r.status = ${open} AND (r.id = ${from} OR ${asksFor(sql, sql`r.title`, sql`r.steam_app_id`)})`
  })
