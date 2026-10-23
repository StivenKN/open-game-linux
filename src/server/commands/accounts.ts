import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { type Access, type AccessChange, isActiveAdmin } from '../../domain/accounts.ts'
import { NotFound, RuleViolated } from '../../domain/errors.ts'
import type { UserId } from '../../domain/ids.ts'
import type { Role } from '../../domain/review.ts'
import { User } from '../../domain/tables.ts'
import { type Admin, requireAdmin } from '../auth.ts'
import { isDemo } from '../queries/labels.ts'
import { rows } from '../rows.ts'

const administrador: Role = 'administrador'

const Locked = Schema.Struct({ ...User.mapFields(Struct.pick(['id', 'alias', 'role', 'active'])).fields, demo: Schema.Boolean })

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
        // The target, the actor and every active administrador, locked in id order: two administrators
        // demoting each other at once serialize here, and the second one sees that it would leave none.
        const locked = yield* rows(
          Locked,
          sql`SELECT u.id, u.alias, u.role, u.active, ${sql.literal(isDemo('u'))} AS demo FROM app_user u
              WHERE u.id IN ${sql.in(by === null ? [target] : [target, by.id])} OR (u.role = ${administrador} AND u.active)
              ORDER BY u.id FOR UPDATE`,
        )
        const before = locked.find((u) => u.id === target)
        // A demo account's password is in the README, so on a deployed site it manages only demo accounts.
        const sandboxed = by !== null && locked.some((u) => u.id === by.id && u.demo)
        if (before === undefined || (sandboxed && !before.demo)) return yield* Effect.fail(new NotFound())
        const after = { role: change.role ?? before.role, active: change.active ?? before.active }
        if (isActiveAdmin(before) && !isActiveAdmin(after)) {
          if (by?.id === target) return yield* Effect.fail(new RuleViolated({ rule: 'acceso_propio' }))
          if (!locked.some((u) => u.id !== target && isActiveAdmin(u))) return yield* Effect.fail(new RuleViolated({ rule: 'ultimo_administrador' }))
        }
        const changed = after.role !== before.role || after.active !== before.active
        if (changed) yield* sql`UPDATE app_user SET role = ${after.role}, active = ${after.active}, updated_at = now() WHERE id = ${target}`
        // visitorOf already ignores them, but better-auth's own endpoints (update-user, change-password) would not.
        if (!after.active) yield* sql`DELETE FROM session WHERE "userId" = ${target}`
        return { alias: before.alias, ...after, changed }
      }),
    ),
  )

/** /admin/usuarios: the signed-in administrator changes one account. */
export const administerAccess = (change: AccessChange) => Effect.flatMap(requireAdmin, (admin) => changeAccess(change.user_id, change, admin))
