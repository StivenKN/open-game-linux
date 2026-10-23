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

const RequestRow = GameRequest.mapFields(Struct.pick(['id', 'title']))
const RequestStatus = GameRequest.mapFields(Struct.pick(['id', 'title', 'status']))
const CatalogGame = Game.mapFields(Struct.pick(['id', 'title']))
const Requesters = Schema.Struct({ requesters: Schema.Int })

export type RequestOutcome =
  | { readonly _tag: 'en_catalogo'; readonly game: typeof CatalogGame.Type }
  | { readonly _tag: 'pedido'; readonly request: typeof RequestRow.Type; readonly requesters: number }

/** Two titles name the same game when their letters and digits match, ignoring case, spaces and punctuation. */
const titleKey = (sql: SqlClient.SqlClient, title: string | Statement.Fragment) => sql`lower(regexp_replace(${title}, '[^[:alnum:]]+', '', 'g'))`

/** True when the catalog game aliased `game` has a Steam edition with this App ID, or with any App ID. */
const steamEdition = (sql: SqlClient.SqlClient, appid: SteamAppId | null) =>
  sql`EXISTS (SELECT 1 FROM game_edition e JOIN launcher l ON l.id = e.launcher_id
              WHERE e.game_id = game.id AND l.name = ${STEAM_LAUNCHER}
                AND ${appid === null ? sql`e.external_id IS NOT NULL` : sql`e.external_id = ${String(appid)}`})`

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

/** The catalog game or the open request a new request names, matched as `requestGame` describes, else a new request. */
const matchOrCreate = (title: string, appid: SteamAppId | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* lockRequests
    const sameTitle = (column: string) => sql`${titleKey(sql, sql.literal(column))} = ${titleKey(sql, title)}`
    const [game] = yield* rows(
      CatalogGame,
      sql`SELECT game.id, game.title FROM game
          WHERE ${appid === null ? sameTitle('game.title') : sql`${steamEdition(sql, appid)} OR (${sameTitle('game.title')} AND NOT ${steamEdition(sql, null)})`}
          ORDER BY game.id LIMIT 1`,
    )
    if (game !== undefined) return { _tag: 'en_catalogo', game } as const
    const [existing] = yield* rows(
      RequestRow,
      sql`SELECT id, title FROM game_request
          WHERE status = ${open} AND ${appid === null ? sameTitle('title') : sql`(steam_app_id = ${appid} OR (steam_app_id IS NULL AND ${sameTitle('title')}))`}
          ORDER BY id LIMIT 1`,
    )
    const request = existing ?? (yield* oneRow(RequestRow, sql`INSERT INTO game_request ${sql.insert({ title, steam_app_id: appid })} RETURNING id, title`))
    return { _tag: 'pedido', request } as const
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

type Resolution =
  | { readonly status: 'rechazado'; readonly rejection_reason: string; readonly game_id: null }
  | { readonly status: 'cumplido'; readonly rejection_reason: null; readonly game_id: GameId }

const close = (reviewer: Reviewer, id: GameRequestId, resolution: Resolution) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* openRequest(id)
    yield* sql`UPDATE game_request SET ${sql.update({ ...resolution, resolved_by: reviewer.id })}, resolved_at = now() WHERE id = ${id}`
    return { id }
  })

export const rejectRequest = (r: RejectRequest): Write<{ readonly id: GameRequestId }, RuleViolated | NotFound | Forbidden> =>
  Effect.flatMap(requireReviewer, (reviewer) => close(reviewer, r.id, { status: 'rechazado', rejection_reason: r.reason, game_id: null }))

/** Called by createGame, inside its transaction: the request becomes cumplido and links to the new game. */
export const fulfillRequest = (reviewer: Reviewer, id: GameRequestId, game_id: GameId) =>
  close(reviewer, id, { status: 'cumplido', rejection_reason: null, game_id })
