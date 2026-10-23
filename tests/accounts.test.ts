import { expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { Forbidden, NotFound, RuleViolated, Unauthenticated } from '../src/domain/errors.ts'
import { UserId } from '../src/domain/ids.ts'
import type { Role } from '../src/domain/review.ts'
import { requireAdmin, type SignedInUser, Visitor } from '../src/server/auth.ts'
import { administerAccess, changeAccess } from '../src/server/commands/accounts.ts'
import { accounts } from '../src/server/queries/accounts.ts'
import { myContributions } from '../src/server/queries/contributions.ts'
import { idOf, inRollback, PgTest } from './support.ts'

type Value = string | number | boolean | Date | null

const scenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insert = (table: string, row: Record<string, Value>) => idOf(sql`INSERT INTO ${sql(table)} ${sql.insert(row)} RETURNING id`)
  // Ids and values no other test file uses: db files run in parallel, and two transactions inserting the
  // same keys block or deadlock. Launcher "Steam" is the exception, needed for the Valve report link.
  const insertUser = (alias: string, role: Role, domain = 'cuentas.test') =>
    Effect.as(
      sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES (${alias}, ${alias}, ${`${alias}@${domain}`}, false, ${role}, true)`,
      { id: UserId.make(alias), alias, role } satisfies SignedInUser,
    )
  const admin = yield* insertUser('acc_admin', 'administrador')
  const admin2 = yield* insertUser('acc_admin2', 'administrador')
  const reviewer = yield* insertUser('acc_rev', 'revisor')
  const ana = yield* insertUser('acc_ana', 'usuario')
  const bruno = yield* insertUser('acc_bruno', 'usuario')

  const steam = yield* insert('launcher', { name: 'Steam' })
  const game = yield* insert('game', { title: 'Juego de cuentas', description: 'd' })
  const edition = yield* insert('game_edition', { game_id: game, launcher_id: steam, external_id: '424242' })
  const debian = yield* insert('distribution', { name: 'Debian', version: '13' })
  const proton = yield* insert('layer_version', { family: 'Proton', variant: 'Valve', version: '9.0-cuentas' })
  const diagnosticOf = (user: SignedInUser) =>
    Effect.flatMap(insert('machine', { user_id: user.id, alias: 'torre' }), (machine) =>
      insert('diagnostic', {
        machine_id: machine,
        captured_at: new Date('2026-09-20T18:00:00Z'),
        operating_system: 'Linux',
        os_version: '6.12',
        distribution_id: debian,
        architecture: 'x86_64',
        cpu_model: 'cpu',
        gpu_model: 'AMD Radeon RX 6600',
        ram_mb: 16384,
        vulkan_support: 'si',
      }),
    )
  const reviewed = (status: 'aprobado' | 'rechazado' | 'retirado', reason: string) => ({
    review_status: status,
    reviewer_id: reviewer.id,
    reviewed_at: new Date('2026-10-10T00:00:00Z'),
    review_reason: reason,
    review_evidence: status === 'rechazado' ? null : 'reporte #1',
  })
  const pending = { review_status: 'pendiente', reviewer_id: null, reviewed_at: null, review_reason: null, review_evidence: null }
  const anaDiagnostic = yield* diagnosticOf(ana)
  const report = (day: number, outcome: string, review: Record<string, Value>, diagnostic = anaDiagnostic) =>
    insert('report', {
      edition_id: edition,
      diagnostic_id: diagnostic,
      layer_version_id: proton,
      game_version: '1.0',
      tested_at: new Date('2026-10-01T19:00:00Z'),
      outcome,
      observations: 'o',
      created_at: new Date(`2026-10-0${day}T12:00:00Z`),
      ...review,
    })
  const approved = yield* report(1, 'funciona_con_ajustes', reviewed('aprobado', 'Coherente con su entorno.'))
  const rejected = yield* report(2, 'funciona', reviewed('rechazado', 'Las capturas no coinciden con el diagnóstico.'))
  const failing = yield* report(3, 'no_inicia', pending)
  yield* report(4, 'funciona', pending, yield* diagnosticOf(bruno))
  const failure = yield* insert('failure_type', { code: 'acc_fallo', description: 'd' })
  yield* sql`INSERT INTO report_failure (report_id, failure_type_id, detail) VALUES (${failing}, ${failure}, 'Pantalla negra.')`
  const solution = yield* insert('solution', {
    report_id: failing,
    failure_type_id: failure,
    author_id: ana.id,
    title: 'Borrar el prefijo',
    instructions: 'i',
    created_at: new Date('2026-10-05T12:00:00Z'),
    ...reviewed('retirado', 'Ya no hace falta con Proton 9.'),
  })
  const profile = yield* insert('profile', {
    edition_id: edition,
    distribution_id: debian,
    layer_version_id: proton,
    author_id: ana.id,
    architecture: 'x86_64',
    revision: 1,
    title: 'perfil de Ana',
    created_at: new Date('2026-10-05T12:00:00Z'),
    ...reviewed('rechazado', 'Faltan los pasos del lanzador.'),
  })
  return { sql, insertUser, admin, admin2, reviewer, ana, approved, rejected, failing, solution, profile, game }
})
type Scenario = Effect.Success<typeof scenario>

const inScenario = (test: (e: Scenario) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () => inRollback(Effect.flatMap(scenario, test))

const as =
  (user: SignedInUser | null) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.provideService(program, Visitor, Option.fromNullOr(user))

const adminOf = (user: SignedInUser) => as(user)(requireAdmin)
const rule = (r: RuleViolated['rule']) => new RuleViolated({ rule: r })

const AccessRow = Schema.Struct({ role: Schema.String, active: Schema.Boolean })
const accessOf = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(sql`SELECT role, active FROM app_user WHERE id = ${id}`, Schema.decodeUnknownEffect(Schema.Array(AccessRow)))
const sessionsOf = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(sql`SELECT count(*)::int AS n FROM session WHERE "userId" = ${id}`, Schema.decodeUnknownEffect(Schema.Tuple([Schema.Struct({ n: Schema.Int })])))

layer(PgTest)('changeAccess', (it) => {
  it.effect('un administrador cambia el rol y desactiva otra cuenta, que pierde sus sesiones; repetirlo no cambia nada', inScenario((e) =>
    Effect.gen(function* () {
      yield* e.sql`INSERT INTO session (id, "expiresAt", token, "updatedAt", "userId") VALUES ('acc_s', now() + interval '1 day', 'acc_t', now(), ${e.ana.id})`
      const admin = yield* adminOf(e.admin)
      expect(yield* changeAccess(e.ana.id, { role: 'revisor', active: false }, admin)).toEqual({ alias: 'acc_ana', role: 'revisor', active: false, changed: true })
      expect([yield* accessOf(e.sql, e.ana.id), yield* sessionsOf(e.sql, e.ana.id)]).toEqual([[{ role: 'revisor', active: false }], [{ n: 0 }]])
      expect(yield* changeAccess(e.ana.id, { role: 'revisor', active: false }, admin)).toMatchObject({ changed: false })
    })))

  it.effect('nadie se quita su propio acceso de administrador, aunque haya otro administrador', inScenario((e) =>
    Effect.gen(function* () {
      const admin = yield* adminOf(e.admin)
      expect(yield* Effect.flip(changeAccess(e.admin.id, { role: 'revisor' }, admin))).toEqual(rule('acceso_propio'))
      expect(yield* Effect.flip(changeAccess(e.admin.id, { active: false }, admin))).toEqual(rule('acceso_propio'))
      expect(yield* changeAccess(e.admin.id, { role: 'administrador', active: true }, admin)).toMatchObject({ changed: false })
      expect(yield* changeAccess(e.admin2.id, { role: 'revisor' }, admin)).toMatchObject({ changed: true })
    })))

  it.effect('la última cuenta de administrador activa conserva su acceso, también desde pnpm set-role', inScenario((e) =>
    Effect.gen(function* () {
      yield* changeAccess(e.admin2.id, { active: false }, yield* adminOf(e.admin))
      // An inactive administrador does not count: acc_admin is the last active one.
      expect(yield* Effect.flip(changeAccess(e.admin.id, { role: 'usuario' }, null))).toEqual(rule('ultimo_administrador'))
      expect(yield* Effect.flip(changeAccess(e.admin.id, { active: false }, null))).toEqual(rule('ultimo_administrador'))
      expect(yield* accessOf(e.sql, e.admin.id)).toEqual([{ role: 'administrador', active: true }])
      yield* changeAccess(e.ana.id, { role: 'administrador' }, null)
      expect(yield* changeAccess(e.admin.id, { role: 'usuario' }, null)).toMatchObject({ role: 'usuario', changed: true })
    })))

  it.effect('una cuenta que no existe', inScenario(() =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(changeAccess(UserId.make('acc_nadie'), { role: 'revisor' }, null))).toEqual(new NotFound())
    })))

  it.effect('desde la página, solo un administrador cambia cuentas', inScenario((e) =>
    Effect.gen(function* () {
      const change = { user_id: e.ana.id, role: 'administrador', active: true } as const
      expect(yield* Effect.flip(as(e.reviewer)(administerAccess(change)))).toEqual(new Forbidden())
      expect(yield* Effect.flip(as(null)(administerAccess(change)))).toEqual(new Unauthenticated())
      expect(yield* as(e.admin)(administerAccess(change))).toMatchObject({ role: 'administrador', changed: true })
    })))

  it.effect('un administrador de ejemplo, cuya contraseña es pública, solo ve y cambia cuentas de ejemplo', inScenario((e) =>
    Effect.gen(function* () {
      const demo = yield* e.insertUser('acc_demo_admin', 'administrador', 'demo.opengame.test')
      const sample = yield* e.insertUser('acc_demo_ana', 'usuario', 'demo.opengame.test')
      const seen = (user: SignedInUser) => Effect.map(as(user)(accounts('acc_')), (r) => r.accounts.map((a) => a.alias).sort())
      expect(yield* seen(demo)).toEqual(['acc_demo_admin', 'acc_demo_ana'])
      expect((yield* seen(e.admin)).length).toBe(7)
      expect(yield* Effect.flip(changeAccess(e.admin.id, { active: false }, yield* adminOf(demo)))).toEqual(new NotFound())
      expect(yield* changeAccess(sample.id, { role: 'revisor' }, yield* adminOf(demo))).toMatchObject({ changed: true })
    })))
})

layer(PgTest)('accounts', (it) => {
  it.effect('busca por alias o correo sin comodines y marca la cuenta propia', inScenario((e) =>
    Effect.gen(function* () {
      const found = (q: string) => Effect.map(as(e.admin)(accounts(q)), (r) => r.accounts.map((a) => [a.alias, a.is_self]))
      expect(yield* found('ACC_AN')).toEqual([['acc_ana', false]])
      expect(yield* found('acc_admin@cuentas')).toEqual([['acc_admin', true]])
      expect(yield* found('a%a')).toEqual([])
      expect((yield* found('cuentas.test')).length).toBe(5)
    })))

  it.effect('solo un administrador lista las cuentas', inScenario((e) =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(as(e.reviewer)(accounts('')))).toEqual(new Forbidden())
      expect(yield* Effect.flip(as(null)(accounts('')))).toEqual(new Unauthenticated())
    })))
})

layer(PgTest)('myContributions', (it) => {
  it.effect('lista solo lo propio, con el motivo solo de lo rechazado o retirado y sin el revisor', inScenario((e) =>
    Effect.gen(function* () {
      const mine = yield* as(e.ana)(myContributions)
      expect(mine.reports.map((r) => [r.id, r.review, r.valve])).toEqual([
        [e.failing, { status: 'pendiente' }, true],
        [e.rejected, { status: 'rechazado', reason: 'Las capturas no coinciden con el diagnóstico.' }, false],
        [e.approved, { status: 'aprobado' }, true],
      ])
      expect(mine.solutions).toMatchObject([{ id: e.solution, game_id: e.game, review: { status: 'retirado', reason: 'Ya no hace falta con Proton 9.' } }])
      expect(mine.profiles).toMatchObject([{ id: e.profile, review: { status: 'rechazado', reason: 'Faltan los pasos del lanzador.' } }])
      expect(mine.machines.map((m) => m.diagnostics.length)).toEqual([1])
      const sent = JSON.stringify(mine)
      expect([sent.includes(e.reviewer.id), sent.includes('Coherente')]).toEqual([false, false])
    })))

  it.effect('un invitado va a entrar', inScenario(() =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(as(null)(myContributions))).toEqual(new Unauthenticated())
    })))
})
