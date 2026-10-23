// `pnpm set-role <email> <usuario|revisor|administrador>`: bootstraps the first administrador, who then
// manages roles at /admin/usuarios, and recovers a deactivated account, which it reactivates. Both go
// through `changeAccess`, so the last active administrador cannot be demoted from here either.
import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { UserId } from '../src/domain/ids.ts'
import { Role } from '../src/domain/review.ts'
import { changeAccess } from '../src/server/commands/accounts.ts'
import { rows } from '../src/server/rows.ts'
import { PgLive } from '../src/server/runtime.ts'
// The rule's words from the English dictionary's plain-.ts area: Node cannot load the .tsx areas en.ts assembles.
import { common } from '../src/ui/i18n/en/common.ts'

const [email = '', role] = process.argv.slice(2)

const program = Effect.gen(function* () {
  const r = yield* Schema.decodeUnknownEffect(Role)(role).pipe(
    Effect.catchTag('SchemaError', () => Effect.die(`Usage: pnpm set-role <email> <${Role.literals.join('|')}>`)),
  )
  const sql = yield* SqlClient.SqlClient
  const [user] = yield* rows(Schema.Struct({ id: UserId }), sql`SELECT id FROM app_user WHERE email = lower(btrim(${email}))`)
  if (user === undefined) return yield* Effect.die(`No account has the email ${email}`)
  const c = yield* changeAccess(user.id, { role: r, active: true }, null).pipe(Effect.catchTag('ReglaIncumplida', (e) => Effect.die(common.rules[e.rule])))
  yield* Effect.log(c.changed ? `${c.alias} is now an active ${c.role}` : `${c.alias} was already an active ${c.role}; nothing to change`)
}).pipe(Effect.provide(PgLive))

Effect.runPromise(program).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
