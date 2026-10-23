import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { User } from '../../domain/tables.ts'
import { requireAdmin } from '../auth.ts'
import { rows } from '../rows.ts'
import { isDemo } from './labels.ts'

const SHOWN = 50

const AccountRow = Schema.Struct({
  ...User.mapFields(Struct.pick(['id', 'alias', 'email', 'role', 'active', 'created_at'])).fields,
  is_self: Schema.Boolean,
})

/**
 * /admin/usuarios: the newest accounts, or those whose alias or email contains `search`. `strpos`, not
 * ILIKE, so `%` and `_` match themselves. `more` says that the search would find accounts past the first 50.
 * A demo administrador sees only demo accounts, like `changeAccess` lets it change only those.
 */
export const accounts = (search: string) =>
  Effect.gen(function* () {
    const admin = yield* requireAdmin
    const sql = yield* SqlClient.SqlClient
    const q = search.trim()
    const demo = (u: string) => sql.literal(isDemo(u))
    const found = yield* rows(
      AccountRow,
      sql`SELECT u.id, u.alias, u.email, u.role, u.active, u.created_at, u.id = ${admin.id} AS is_self
          FROM app_user u
          WHERE (${demo('u')} OR NOT EXISTS (SELECT 1 FROM app_user me WHERE me.id = ${admin.id} AND ${demo('me')}))
            ${q === '' ? sql`` : sql`AND (strpos(lower(u.alias), lower(${q})) > 0 OR strpos(u.email, lower(${q})) > 0)`}
          ORDER BY u.created_at DESC, u.id
          LIMIT ${SHOWN + 1}`,
    )
    return { accounts: found.slice(0, SHOWN), more: found.length > SHOWN }
  })
