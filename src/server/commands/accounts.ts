import { Effect, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { type Access, isActiveAdmin } from '../../domain/accounts.ts'
import { NotFound, RuleViolated } from '../../domain/errors.ts'
import type { UserId } from '../../domain/ids.ts'
import type { Role } from '../../domain/review.ts'
import { User } from '../../domain/tables.ts'
import type { Admin } from '../auth.ts'
import { rows } from '../rows.ts'

const administrador: Role = 'administrador'

const Locked = User.mapFields(Struct.pick(['id', 'alias', 'role', 'active']))

/**
 * The single writer of `app_user.role` and `app_user.active`, shared by /admin/usuarios, `pnpm set-role` and
 * the seed. `by` is the administrator acting on the page; the command line passes null, which is how the
 * first administrador is made. Either way the last active administrador keeps that access, and an
 * administrator never takes their own. Sessions are read from the database on every request, so the change
 * applies on the target's next one.
 */
export const changeAccess = (target: UserId, change: Partial<Access>, by: Admin | null) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(
      Effect.gen(function* () {
        // The target and every active administrador, locked in id order: two administrators demoting each
        // other at once serialize here, and the second one sees that it would leave none.
        const locked = yield* rows(
          Locked,
          sql`SELECT id, alias, role, active FROM app_user
              WHERE id = ${target} OR (role = ${administrador} AND active)
              ORDER BY id FOR UPDATE`,
        )
        const before = locked.find((u) => u.id === target)
        if (before === undefined) return yield* Effect.fail(new NotFound())
        const after = { role: change.role ?? before.role, active: change.active ?? before.active }
        if (isActiveAdmin(before) && !isActiveAdmin(after)) {
          if (by?.id === target) return yield* Effect.fail(new RuleViolated({ rule: 'acceso_propio' }))
          if (!locked.some((u) => u.id !== target && isActiveAdmin(u))) return yield* Effect.fail(new RuleViolated({ rule: 'ultimo_administrador' }))
        }
        const changed = after.role !== before.role || after.active !== before.active
        if (changed) yield* sql`UPDATE app_user SET role = ${after.role}, active = ${after.active}, updated_at = now() WHERE id = ${target}`
        return { alias: before.alias, ...after, changed }
      }),
    ),
  )
