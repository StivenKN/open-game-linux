import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { User } from '../../domain/tables.ts'
import { requireAdmin } from '../auth.ts'
import { rows } from '../rows.ts'

const SHOWN = 50

const AccountRow = Schema.Struct({
  ...User.mapFields(Struct.pick(['id', 'alias', 'email', 'role', 'active', 'created_at'])).fields,
  is_self: Schema.Boolean,
})

/**
 * /admin/usuarios: the newest accounts, or those whose alias or email contains `search`. `strpos`, not
 * ILIKE, so `%` and `_` match themselves. `more` says that the search would find accounts past the first 50.
 */
export const accounts = (search: string) =>
  Effect.gen(function* () {
    const admin = yield* requireAdmin
    const sql = yield* SqlClient.SqlClient
    const q = search.trim()
    const found = yield* rows(
      AccountRow,
      sql`SELECT id, alias, email, role, active, created_at, id = ${admin.id} AS is_self
          FROM app_user
          WHERE ${q === '' ? sql`true` : sql`strpos(lower(alias), lower(${q})) > 0 OR strpos(email, lower(${q})) > 0`}
          ORDER BY created_at DESC, id
          LIMIT ${SHOWN + 1}`,
    )
    return { accounts: found.slice(0, SHOWN), more: found.length > SHOWN }
  })
