import { expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { Unauthenticated, NotFound, RuleViolated, Forbidden } from '../src/domain/errors.ts'
import { ProfileId, ReportId, UserId } from '../src/domain/ids.ts'
import type { Role } from '../src/domain/review.ts'
import { FixNote } from '../src/domain/upstream.ts'
import { noteFix } from '../src/server/commands/upstream.ts'
import { type SignedInUser, Visitor } from '../src/server/auth.ts'
import { catalog } from '../src/server/queries/catalog.ts'
import { profile } from '../src/server/queries/profile.ts'
import { myProtonReport } from '../src/server/queries/upstream.ts'
import { inRollback, idOf, PgTest, constraintOf } from './support.ts'

type Value = string | number | boolean | Date | null

const scenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insert = (table: string, row: Record<string, Value>) => idOf(sql`INSERT INTO ${sql(table)} ${sql.insert(row)} RETURNING id`)
  const insertUser = (alias: string, email: string, role: Role) =>
    Effect.as(
      sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES (${alias}, ${alias}, ${email}, false, ${role}, true)`,
      { id: UserId.make(alias), alias, role } satisfies SignedInUser,
    )
  // Ids no other test file uses: bd files run in parallel, and two transactions inserting the same ids deadlock.
  const rita = yield* insertUser('up_rita', 'up_rita@opengame.test', 'revisor')
  const ana = yield* insertUser('up_ana', 'up_ana@opengame.test', 'usuario')
  const bruno = yield* insertUser('up_bruno', 'up_bruno@opengame.test', 'usuario')
  yield* insertUser('up_demo', 'up_demo@demo.opengame.test', 'usuario')

  const steam = yield* insert('launcher', { name: 'Steam' })
  const game = yield* insert('game', { title: 'The Witcher 3: Wild Hunt', description: 'd' })
  const edicion = yield* insert('game_edition', { game_id: game, launcher_id: steam, external_id: '292030' })
  const fedora = yield* insert('distribution', { name: 'Fedora', version: '40' })
  const proton = yield* insert('layer_version', { family: 'Proton', variant: 'Valve', version: '9.0-3' })
  const wine = yield* insert('layer_version', { family: 'Wine', variant: 'estable', version: '9.0' })

  const approved = {
    review_status: 'aprobado',
    created_at: new Date('2026-10-03T00:00:00Z'),
    reviewer_id: rita.id,
    reviewed_at: new Date('2026-10-04T00:00:00Z'),
    review_reason: 'probado',
    review_evidence: 'reporte #1',
  }
  const insertProfile = (revision: number, overrides: Record<string, Value> = {}) =>
    Effect.map(
      insert('profile', {
        edition_id: edicion,
        distribution_id: fedora,
        layer_version_id: proton,
        author_id: ana.id,
        architecture: 'x86_64',
        revision,
        title: 'perfil',
        launch_options: '%command% --launcher-skip',
        ...approved,
        ...overrides,
      }),
      ProfileId.make,
    )
  const machine = yield* insert('machine', { user_id: ana.id, alias: 'torre' })
  const diagnostic = yield* insert('diagnostic', {
    machine_id: machine,
    captured_at: new Date('2026-09-20T18:00:00Z'),
    operating_system: 'Linux',
    os_version: '6.10.6-200.fc40.x86_64',
    distribution_id: fedora,
    architecture: 'x86_64',
    cpu_model: 'AMD Ryzen 7 5700X',
    gpu_model: 'AMD Radeon RX 6600',
    ram_mb: 32768,
    driver: 'amdgpu',
    driver_version: 'Mesa 24.1.7',
    vulkan_support: 'si',
  })
  const fallido = yield* insert('report', {
    edition_id: edicion,
    diagnostic_id: diagnostic,
    layer_version_id: proton,
    game_version: '4.04',
    tested_at: new Date('2026-10-02T19:00:00Z'),
    outcome: 'no_inicia',
    observations: 'Pantalla negra al iniciar.',
  })
  const lanzadorFallo = yield* insert('failure_type', { code: 'lanzador', description: 'El lanzador no abre.' })
  yield* sql`INSERT INTO report_failure (report_id, failure_type_id, detail) VALUES (${fallido}, ${lanzadorFallo}, 'El lanzador se cierra.')`

  return {
    sql,
    rita,
    ana,
    bruno,
    fallido: ReportId.make(fallido),
    exportable: yield* insertProfile(1),
    otroExportable: yield* insertProfile(2),
    pendiente: yield* insertProfile(3, { review_status: 'pendiente', reviewer_id: null, reviewed_at: null, review_reason: null, review_evidence: null }),
    conWine: yield* insertProfile(4, { layer_version_id: wine }),
    deEjemplo: yield* insertProfile(5, { author_id: 'up_demo' }),
  }
})
type Scenario = Effect.Success<typeof scenario>

const inScenario = (test: (e: Scenario) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () => inRollback(Effect.flatMap(scenario, test))

const asUser =
  (user: SignedInUser | null) =>
  <A, E>(program: Effect.Effect<A, E, SqlClient.SqlClient | Visitor>) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(program)).pipe(Effect.provideService(Visitor, Option.fromNullOr(user)))

const accepted = (profile_id: number, pr = 512) =>
  Schema.decodeUnknownSync(FixNote)({ _tag: 'Aceptado', profile_id, pr: `https://github.com/Open-Wine-Components/umu-protonfixes/pull/${pr}/files` })
const cancel = (pr: number) => Schema.decodeUnknownSync(FixNote)({ _tag: 'Anular', pr })
const rule = (r: RuleViolated['rule']) => new RuleViolated({ rule: r })

const fixCount = Effect.map(
  Effect.provideService(catalog({}), Visitor, Option.none()),
  (c) => c.counters.upstream_fixes,
)

layer(PgTest)('arreglo_upstream', (it) => {
  it.effect('un revisor registra un PR fusionado una vez; repetirlo no cambia nada', inScenario((e) =>
    Effect.gen(function* () {
      expect(yield* fixCount).toBe(0)
      expect(yield* asUser(e.rita)(noteFix(accepted(e.exportable)))).toEqual({ changed: true })
      expect(yield* asUser(e.rita)(noteFix(accepted(e.exportable)))).toEqual({ changed: false })
      expect(yield* fixCount).toBe(1)
      const page = yield* Effect.provideService(profile(e.exportable), Visitor, Option.none())
      expect({ exportacion: page.fixExport?._tag, arreglos: page.fixes.map((a) => a.pr) }).toEqual({ exportacion: 'archivo', arreglos: [512] })
    })))

  it.effect('el mismo PR no se registra para otro perfil', inScenario((e) =>
    Effect.gen(function* () {
      yield* asUser(e.rita)(noteFix(accepted(e.exportable)))
      expect(yield* Effect.flip(asUser(e.rita)(noteFix(accepted(e.otroExportable))))).toEqual(rule('arreglo_pr_de_otro_perfil'))
    })))

  it.effect('rechaza perfiles sin camino a gamefixes-steam: pendiente, con Wine o inexistente', inScenario((e) =>
    Effect.gen(function* () {
      for (const id of [e.pendiente, e.conWine, 999999])
        expect(yield* Effect.flip(asUser(e.rita)(noteFix(accepted(id))))).toEqual(rule('arreglo_no_exportable'))
      expect(yield* fixCount).toBe(0)
    })))

  it.effect('rechaza los datos de ejemplo: el contador público no cuenta demos', inScenario((e) =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(asUser(e.rita)(noteFix(accepted(e.deEjemplo))))).toEqual(rule('arreglo_datos_de_ejemplo'))
    })))

  it.effect('Anular borra el registro; anular de nuevo no cambia nada', inScenario((e) =>
    Effect.gen(function* () {
      yield* asUser(e.rita)(noteFix(accepted(e.exportable)))
      expect(yield* asUser(e.rita)(noteFix(cancel(512)))).toEqual({ changed: true })
      expect(yield* asUser(e.rita)(noteFix(cancel(512)))).toEqual({ changed: false })
      expect(yield* fixCount).toBe(0)
    })))

  it.effect('solo un revisor escribe', inScenario((e) =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(asUser(e.ana)(noteFix(accepted(e.exportable))))).toEqual(new Forbidden())
      expect(yield* Effect.flip(asUser(null)(noteFix(cancel(512))))).toEqual(new Unauthenticated())
    })))

  it.effect('un registro no se reescribe', inScenario((e) =>
    Effect.gen(function* () {
      yield* asUser(e.rita)(noteFix(accepted(e.exportable)))
      expect(yield* constraintOf(e.sql`UPDATE upstream_fix SET pr = 513`)).toEqual(Option.some('og_immutable'))
    })))
})

layer(PgTest)('informeProtonDe', (it) => {
  it.effect('su autora recibe el informe; nadie más sabe que existe', inScenario((e) =>
    Effect.gen(function* () {
      const own = yield* Effect.provideService(myProtonReport(e.fallido), Visitor, Option.some(e.ana))
      expect(own.protonReport).toMatchObject({ _tag: 'informe', title: 'The Witcher 3: Wild Hunt (292030)', body_in_link: true })
      expect(own.protonReport._tag === 'informe' && own.protonReport.body.split('\n').slice(5, 9)).toEqual([
        '- GPU: AMD Radeon RX 6600',
        '- Video driver version: Mesa 24.1.7 (amdgpu)',
        '- Kernel version: 6.10.6-200.fc40.x86_64',
        '- Distribution: Fedora 40',
      ])
      expect(yield* Effect.flip(Effect.provideService(myProtonReport(e.fallido), Visitor, Option.some(e.bruno)))).toEqual(new NotFound())
      expect(yield* Effect.flip(Effect.provideService(myProtonReport(e.fallido), Visitor, Option.none()))).toEqual(new Unauthenticated())
    })))
})
