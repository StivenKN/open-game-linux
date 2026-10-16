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
      sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES (${alias}, ${alias}, ${email}, false, ${role}, true)`,
      { id: UserId.make(alias), alias, rol: role } satisfies SignedInUser,
    )
  // Ids no other test file uses: bd files run in parallel, and two transactions inserting the same ids deadlock.
  const rita = yield* insertUser('up_rita', 'up_rita@opengame.test', 'revisor')
  const ana = yield* insertUser('up_ana', 'up_ana@opengame.test', 'usuario')
  const bruno = yield* insertUser('up_bruno', 'up_bruno@opengame.test', 'usuario')
  yield* insertUser('up_demo', 'up_demo@demo.opengame.test', 'usuario')

  const steam = yield* insert('lanzador', { nombre: 'Steam' })
  const juego = yield* insert('juego', { titulo: 'The Witcher 3: Wild Hunt', descripcion: 'd' })
  const edicion = yield* insert('edicion_juego', { juego_id: juego, lanzador_id: steam, identificador_externo: '292030' })
  const fedora = yield* insert('distribucion', { nombre: 'Fedora', version: '40' })
  const proton = yield* insert('version_capa', { familia: 'Proton', variante: 'Valve', version: '9.0-3' })
  const wine = yield* insert('version_capa', { familia: 'Wine', variante: 'estable', version: '9.0' })

  const approved = {
    estado_revision: 'aprobado',
    creado_en: new Date('2026-10-03T00:00:00Z'),
    revisor_id: rita.id,
    revisado_en: new Date('2026-10-04T00:00:00Z'),
    motivo_revision: 'probado',
    evidencia_revision: 'reporte #1',
  }
  const insertProfile = (revision: number, overrides: Record<string, Value> = {}) =>
    Effect.map(
      insert('perfil_configuracion', {
        edicion_id: edicion,
        distribucion_id: fedora,
        version_capa_id: proton,
        autor_id: ana.id,
        arquitectura: 'x86_64',
        revision,
        titulo: 'perfil',
        parametros_lanzamiento: '%command% --launcher-skip',
        ...approved,
        ...overrides,
      }),
      ProfileId.make,
    )
  const equipo = yield* insert('equipo', { usuario_id: ana.id, alias: 'torre' })
  const diagnostico = yield* insert('diagnostico', {
    equipo_id: equipo,
    capturado_en: new Date('2026-09-20T18:00:00Z'),
    sistema: 'Linux',
    version_sistema: '6.10.6-200.fc40.x86_64',
    distribucion_id: fedora,
    arquitectura: 'x86_64',
    cpu_modelo: 'AMD Ryzen 7 5700X',
    gpu_modelo: 'AMD Radeon RX 6600',
    ram_mb: 32768,
    controlador: 'amdgpu',
    version_controlador: 'Mesa 24.1.7',
    soporte_vulkan: 'si',
  })
  const fallido = yield* insert('reporte', {
    edicion_id: edicion,
    diagnostico_id: diagnostico,
    version_capa_id: proton,
    version_juego: '4.04',
    fecha_prueba: new Date('2026-10-02T19:00:00Z'),
    resultado: 'no_inicia',
    observaciones: 'Pantalla negra al iniciar.',
  })
  const lanzadorFallo = yield* insert('tipo_fallo', { codigo: 'lanzador', descripcion: 'El lanzador no abre.' })
  yield* sql`INSERT INTO reporte_fallo (reporte_id, tipo_fallo_id, detalle) VALUES (${fallido}, ${lanzadorFallo}, 'El lanzador se cierra.')`

  return {
    sql,
    rita,
    ana,
    bruno,
    fallido: ReportId.make(fallido),
    exportable: yield* insertProfile(1),
    otroExportable: yield* insertProfile(2),
    pendiente: yield* insertProfile(3, { estado_revision: 'pendiente', revisor_id: null, revisado_en: null, motivo_revision: null, evidencia_revision: null }),
    conWine: yield* insertProfile(4, { version_capa_id: wine }),
    deEjemplo: yield* insertProfile(5, { autor_id: 'up_demo' }),
  }
})
type Scenario = Effect.Success<typeof scenario>

const inScenario = (test: (e: Scenario) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () => inRollback(Effect.flatMap(scenario, test))

const asUser =
  (user: SignedInUser | null) =>
  <A, E>(program: Effect.Effect<A, E, SqlClient.SqlClient | Visitor>) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(program)).pipe(Effect.provideService(Visitor, Option.fromNullOr(user)))

const accepted = (perfil_id: number, pr = 512) =>
  Schema.decodeUnknownSync(FixNote)({ _tag: 'Aceptado', perfil_id, pr: `https://github.com/Open-Wine-Components/umu-protonfixes/pull/${pr}/files` })
const cancel = (pr: number) => Schema.decodeUnknownSync(FixNote)({ _tag: 'Anular', pr })
const rule = (r: RuleViolated['rule']) => new RuleViolated({ rule: r })

const fixCount = Effect.map(
  Effect.provideService(catalog({}), Visitor, Option.none()),
  (c) => c.counters.arreglos_upstream,
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
      expect(yield* constraintOf(e.sql`UPDATE arreglo_upstream SET pr = 513`)).toEqual(Option.some('og_inmutable'))
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
