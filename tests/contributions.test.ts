import { describe, expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { NewSolution, NewGame, NewReport } from '../src/domain/contributions.ts'
import { ApprovalBlocked, Unauthenticated, IncomparableProfile, RuleViolated, Forbidden, InvalidTransition } from '../src/domain/errors.ts'
import { UserId } from '../src/domain/ids.ts'
import { ContributionRef, Decision, type Role } from '../src/domain/review.ts'
import { createGame, submitReport, submitSolution } from '../src/server/commands/contributions.ts'
import { approvalBlockers, decide } from '../src/server/commands/review.ts'
import { type SignedInUser, Visitor } from '../src/server/auth.ts'
import { gamePage } from '../src/server/queries/game.ts'
import { inRollback, idOf, PgTest } from './support.ts'

const Rows = Schema.Array(Schema.Record(Schema.String, Schema.Unknown))

const scenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertUser = (alias: string, role: Role) =>
    Effect.as(
      sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES (${alias}, ${alias}, ${`${alias}@demo.opengame.test`}, false, ${role}, true)`,
      { id: Schema.decodeSync(UserId)(alias), alias, rol: role } satisfies SignedInUser,
    )
  const ana = yield* insertUser('ana', 'usuario')
  const bruno = yield* insertUser('bruno', 'usuario')
  const rita = yield* insertUser('rita', 'revisor')

  const lanzador = yield* idOf(sql`INSERT INTO lanzador (nombre) VALUES ('Steam') RETURNING id`)
  const lanzador2 = yield* idOf(sql`INSERT INTO lanzador (nombre) VALUES ('GOG') RETURNING id`)
  const juego = yield* idOf(sql`INSERT INTO juego (titulo, descripcion) VALUES ('Juego', 'd') RETURNING id`)
  const ed = yield* idOf(sql`INSERT INTO edicion_juego (juego_id, lanzador_id) VALUES (${juego}, ${lanzador}) RETURNING id`)
  const edGog = yield* idOf(sql`INSERT INTO edicion_juego (juego_id, lanzador_id) VALUES (${juego}, ${lanzador2}) RETURNING id`)
  const mint = yield* idOf(sql`INSERT INTO distribucion (nombre, version) VALUES ('Linux Mint', '22') RETURNING id`)
  const fedora = yield* idOf(sql`INSERT INTO distribucion (nombre, version) VALUES ('Fedora', '40') RETURNING id`)
  const capa = yield* idOf(sql`INSERT INTO version_capa (familia, variante, version) VALUES ('Proton', 'Valve', '9.0-4') RETURNING id`)
  const capa8 = yield* idOf(sql`INSERT INTO version_capa (familia, variante, version) VALUES ('Proton', 'Valve', '8.0-5') RETURNING id`)
  const otro = yield* idOf(sql`INSERT INTO tipo_fallo (codigo, descripcion) VALUES ('otro', 'Causa no identificada') RETURNING id`)
  const lanzadorFallo = yield* idOf(sql`INSERT INTO tipo_fallo (codigo, descripcion) VALUES ('lanzador', 'El lanzador no abre') RETURNING id`)

  const insertMachine = (owner: SignedInUser) => idOf(sql`INSERT INTO equipo (usuario_id, alias) VALUES (${owner.id}, 'equipo') RETURNING id`)
  const diagnostico = (equipo_id: number, capturado_en: string, overrides: Record<string, string | number | null> = {}) =>
    idOf(sql`INSERT INTO diagnostico ${sql.insert({
      equipo_id,
      capturado_en: new Date(capturado_en),
      sistema: 'Linux',
      version_sistema: '6.8',
      distribucion_id: mint,
      arquitectura: 'x86_64',
      cpu_modelo: 'cpu',
      gpu_modelo: 'gpu',
      ram_mb: 16384,
      soporte_vulkan: 'desconocido',
      ...overrides,
    })} RETURNING id`)
  const equipoAna = yield* insertMachine(ana)
  const diagAna = yield* diagnostico(equipoAna, '2026-10-01T10:00:00Z')
  const diagAnaWindows = yield* diagnostico(equipoAna, '2026-10-02T10:00:00Z', { sistema: 'Windows', version_sistema: '11', distribucion_id: null })
  const diagBruno = yield* diagnostico(yield* insertMachine(bruno), '2026-10-01T10:00:00Z')

  const perfil = (overrides: Record<string, string | number | null> = {}) =>
    idOf(sql`INSERT INTO perfil_configuracion ${sql.insert({
      edicion_id: ed,
      distribucion_id: mint,
      version_capa_id: capa,
      autor_id: bruno.id,
      arquitectura: 'x86_64',
      revision: 1,
      titulo: 'perfil',
      ...overrides,
    })} RETURNING id`)
  const perfilMint = yield* perfil()

  return { sql, ana, bruno, rita, lanzador, lanzador2, ed, edGog, mint, fedora, capa, capa8, otro, lanzadorFallo, equipoAna, diagAna, diagAnaWindows, diagBruno, perfil, perfilMint, diagnostico }
})
type Scenario = Effect.Success<typeof scenario>

/** Runs `programa` as `quien` (null: a guest) in a savepoint, so a refused write leaves the test transaction usable. */
const asUser =
  (user: SignedInUser | null) =>
  <A, E>(program: Effect.Effect<A, E, SqlClient.SqlClient | Visitor>) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(program)).pipe(Effect.provideService(Visitor, Option.fromNullOr(user)))

const newReport = (e: Scenario, overrides: Record<string, unknown> = {}) =>
  Schema.decodeUnknownSync(NewReport)({
    edicion_id: e.ed,
    diagnostico_id: e.diagAna,
    version_capa: { _tag: 'existente', id: e.capa },
    perfil_id: null,
    version_juego: '1.0',
    version_lanzador: null,
    fecha_prueba: '2026-10-03T10:00:00.000Z',
    resultado: 'funciona',
    medicion: null,
    observaciones: 'Probado una hora sin problemas',
    ...overrides,
  })

const fileReport = (e: Scenario, overrides: Record<string, unknown> = {}, user: SignedInUser = e.ana) => asUser(user)(submitReport(newReport(e, overrides)))

const ref = (type: 'perfil' | 'reporte' | 'solucion', id: number) => Schema.decodeUnknownSync(ContributionRef)({ _tag: type, id })
const approve = Schema.decodeUnknownSync(Decision)({ _tag: 'Aprobar', motivo: 'Coincide con la evidencia', evidencia: 'Captura de MangoHud #7' })
const reject = Schema.decodeUnknownSync(Decision)({ _tag: 'Rechazar', motivo: 'Sin datos suficientes' })
const withdraw = Schema.decodeUnknownSync(Decision)({ _tag: 'Retirar', motivo: 'Versión obsoleta' })

const fileSolution = (e: Scenario, reporte_id: number, overrides: Record<string, unknown> = {}, user: SignedInUser = e.bruno) =>
  asUser(user)(
    submitSolution(
      Schema.decodeUnknownSync(NewSolution)({
        reporte_id,
        tipo_fallo_id: e.lanzadorFallo,
        perfil_id: null,
        titulo: 'Reinstalar el lanzador',
        instrucciones: 'Borra la carpeta del lanzador y vuelve a instalarlo.',
        ...overrides,
      }),
    ),
  )

const newGame = (
  titulo: string,
  ediciones: ReadonlyArray<{ lanzador_id: number; identificador_externo: string }>,
  graphics: { apis: ReadonlyArray<string>; nivel_x86_min: string | null } = { apis: ['d3d11'], nivel_x86_min: null },
) => Schema.decodeUnknownSync(NewGame)({ titulo, descripcion: 'Un juego de prueba', ediciones, ...graphics })

const withFailure = (e: Scenario) => ({ resultado: 'no_inicia', fallos: [{ tipo_fallo_id: e.lanzadorFallo, detalle: 'El lanzador se cierra' }] })

const inScenario = (test: (e: Scenario) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () =>
  inRollback(Effect.flatMap(scenario, test))

const incomparable = (mismatches: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownSync(IncomparableProfile)({ _tag: 'PerfilNoComparable', mismatches })

const rule = (r: RuleViolated['rule']) => new RuleViolated({ rule: r })

layer(PgTest)('aportes', (it) => {
  describe('la aplicación rechaza', () => {
    it.effect('un reporte desde el diagnóstico de un equipo ajeno', inScenario((e) =>
      Effect.gen(function* () {
        expect(yield* Effect.flip(fileReport(e, { diagnostico_id: e.diagBruno }))).toEqual(rule('equipo_ajeno'))
        // A missing diagnosis answers the same, so ids reveal nothing.
        expect(yield* Effect.flip(fileReport(e, { diagnostico_id: 999999 }))).toEqual(rule('equipo_ajeno'))
      })))

    it.effect('un reporte desde un diagnóstico de Windows', inScenario((e) =>
      Effect.gen(function* () {
        expect(yield* Effect.flip(fileReport(e, { diagnostico_id: e.diagAnaWindows }))).toEqual(rule('diagnostico_no_linux'))
      })))

    it.effect('una prueba anterior al diagnóstico', inScenario((e) =>
      Effect.gen(function* () {
        expect(yield* Effect.flip(fileReport(e, { fecha_prueba: '2026-10-01T09:59:00.000Z' }))).toEqual(rule('fecha_antes_del_diagnostico'))
        // The capture instant itself is allowed: "no anterior al diagnóstico".
        yield* fileReport(e, { fecha_prueba: '2026-10-01T10:00:00.000Z' })
      })))

    it.effect('un perfil de otra edición, antes de que lo note la FK', inScenario((e) =>
      Effect.gen(function* () {
        expect(yield* Effect.flip(fileReport(e, { edicion_id: e.edGog, perfil_id: e.perfilMint }))).toEqual(
          incomparable([{ aspect: 'edicion', expected: e.ed, actual: e.edGog }]),
        )
      })))

    it.effect('un perfil de otro entorno: capa, distribución, arquitectura y versión del juego', inScenario((e) =>
      Effect.gen(function* () {
        const fedora = yield* e.perfil({ distribucion_id: e.fedora, arquitectura: 'aarch64', version_juego_objetivo: '2.0' })
        const failure = yield* Effect.flip(fileReport(e, { perfil_id: fedora, version_capa: { _tag: 'existente', id: e.capa8 } }))
        expect(failure).toEqual(
          incomparable([
            { aspect: 'capa', expected: e.capa, actual: e.capa8 },
            { aspect: 'distribucion', expected: e.fedora, actual: e.mint },
            { aspect: 'arquitectura', expected: 'aarch64', actual: 'x86_64' },
            { aspect: 'version_juego', expected: '2.0', actual: '1.0' },
          ]),
        )
      })))

    it.effect('un perfil rechazado o inexistente', inScenario((e) =>
      Effect.gen(function* () {
        yield* asUser(e.rita)(decide(ref('perfil', e.perfilMint), reject))
        expect(yield* Effect.flip(fileReport(e, { perfil_id: e.perfilMint }))).toEqual(rule('perfil_no_disponible'))
        expect(yield* Effect.flip(fileReport(e, { perfil_id: 999999 }))).toEqual(rule('perfil_no_disponible'))
      })))

    it.effect('una versión de capa nueva escrita como «latest»', inScenario((e) =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(fileReport(e, { version_capa: { _tag: 'nueva', familia: 'Proton', variante: 'GE', version: ' Latest ' } }))
        expect(failure).toEqual(rule('version_capa_no_exacta'))
      })))

    it.effect('el mismo tipo de fallo dos veces, sin dejar el reporte a medias', inScenario((e) =>
      Effect.gen(function* () {
        const fallos = [
          { tipo_fallo_id: e.otro, detalle: 'pantalla negra' },
          { tipo_fallo_id: e.otro, detalle: 'se cierra' },
        ]
        expect(yield* Effect.flip(fileReport(e, { resultado: 'no_inicia', fallos }))).toEqual(rule('fallo_duplicado'))
        expect(yield* e.sql`SELECT count(*)::int AS n FROM reporte`).toEqual([{ n: 0 }])
      })))

    it.effect('una solución con un perfil de otra edición', inScenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* fileReport(e, withFailure(e))
        const gog = yield* e.perfil({ edicion_id: e.edGog })
        expect(yield* Effect.flip(fileSolution(e, id, { perfil_id: gog }))).toEqual(rule('solucion_perfil_otra_edicion'))
      })))

    it.effect('una solución para un fallo que el reporte no tiene', inScenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* fileReport(e, withFailure(e))
        expect(yield* Effect.flip(fileSolution(e, id, { tipo_fallo_id: e.otro }))).toEqual(rule('solucion_sin_fallo'))
      })))

    it.effect('que un revisor apruebe su propio reporte, perfil o solución', inScenario((e) =>
      Effect.gen(function* () {
        // rita reviews, but she is also a user: her own equipo, report, profile and solution.
        const diagRita = yield* e.diagnostico(yield* idOf(e.sql`INSERT INTO equipo (usuario_id, alias) VALUES ('rita', 'r') RETURNING id`), '2026-10-01T10:00:00Z')
        const { id: report } = yield* fileReport(e, { diagnostico_id: diagRita, ...withFailure(e) }, e.rita)
        const profile = yield* e.perfil({ autor_id: 'rita', revision: 2 })
        const { id: solution } = yield* fileSolution(e, report, {}, e.rita)
        for (const r of [ref('reporte', report), ref('perfil', profile), ref('solucion', solution)])
          expect(yield* Effect.flip(asUser(e.rita)(decide(r, approve)))).toEqual(rule('autorrevision'))
      })))

    it.effect('aprobar un perfil sin un reporte funcional aprobado que lo use', inScenario((e) =>
      Effect.gen(function* () {
        const blocked = new ApprovalBlocked({ blockers: ['perfil_sin_reporte_funcional_aprobado'] })
        expect(yield* Effect.flip(asUser(e.rita)(decide(ref('perfil', e.perfilMint), approve)))).toEqual(blocked)

        const { id: failing } = yield* fileReport(e, { perfil_id: e.perfilMint, ...withFailure(e) })
        yield* asUser(e.rita)(decide(ref('reporte', failing), approve))
        expect(yield* Effect.flip(asUser(e.rita)(decide(ref('perfil', e.perfilMint), approve)))).toEqual(blocked)

        const { id: pending } = yield* fileReport(e, { perfil_id: e.perfilMint, fecha_prueba: '2026-10-04T10:00:00.000Z' })
        expect(yield* Effect.flip(asUser(e.rita)(decide(ref('perfil', e.perfilMint), approve)))).toEqual(blocked)

        yield* asUser(e.rita)(decide(ref('reporte', pending), approve))
        expect(yield* asUser(e.rita)(decide(ref('perfil', e.perfilMint), approve))).toEqual({ changed: true })
      })))

    it.effect('aprobar una solución con el fallo de origen pendiente o un perfil recomendado pendiente', inScenario((e) =>
      Effect.gen(function* () {
        const { id: report } = yield* fileReport(e, { perfil_id: e.perfilMint, ...withFailure(e) })
        const { id: solution } = yield* fileSolution(e, report, { perfil_id: e.perfilMint }, e.ana)
        expect(yield* approvalBlockers(ref('solucion', solution))).toEqual(['solucion_fallo_origen_no_aprobado', 'solucion_perfil_no_aprobado'])
        yield* asUser(e.rita)(decide(ref('reporte', report), approve))
        expect(yield* Effect.flip(asUser(e.rita)(decide(ref('solucion', solution), approve)))).toEqual(
          new ApprovalBlocked({ blockers: ['solucion_perfil_no_aprobado'] }),
        )
      })))

    it.effect('decidir sin rol de revisor o sin sesión', inScenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* fileReport(e)
        expect(yield* Effect.flip(asUser(e.bruno)(decide(ref('reporte', id), approve)))).toEqual(new Forbidden())
        expect(yield* Effect.flip(asUser(null)(decide(ref('reporte', id), approve)))).toEqual(new Unauthenticated())
        expect(yield* Effect.flip(asUser(null)(submitReport(newReport(e))))).toEqual(new Unauthenticated())
      })))

    it.effect('rechazar lo que ya está aprobado, o retirar lo que sigue pendiente', inScenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* fileReport(e)
        expect(yield* Effect.flip(asUser(e.rita)(decide(ref('reporte', id), withdraw)))).toEqual(
          new InvalidTransition({ from: 'pendiente', to: 'retirado' }),
        )
        yield* asUser(e.rita)(decide(ref('reporte', id), approve))
        expect(yield* Effect.flip(asUser(e.rita)(decide(ref('reporte', id), reject)))).toEqual(
          new InvalidTransition({ from: 'aprobado', to: 'rechazado' }),
        )
      })))

    it.effect('que un usuario o un invitado registre un juego, sin escribir nada', inScenario((e) =>
      Effect.gen(function* () {
        const game = newGame('Hades', [{ lanzador_id: e.lanzador, identificador_externo: '1145360' }])
        expect(yield* Effect.flip(asUser(e.ana)(createGame(game)))).toEqual(new Forbidden())
        expect(yield* Effect.flip(asUser(null)(createGame(game)))).toEqual(new Unauthenticated())
        expect(yield* e.sql`SELECT titulo FROM juego WHERE titulo = 'Hades'`).toEqual([])
      })))

    it.effect('dos ediciones en el mismo lanzador, o un identificador de tienda que ya usa otro juego', inScenario((e) =>
      Effect.gen(function* () {
        const duplicate = newGame('Hades', [
          { lanzador_id: e.lanzador, identificador_externo: '' },
          { lanzador_id: e.lanzador, identificador_externo: '' },
        ])
        expect(yield* Effect.flip(asUser(e.rita)(createGame(duplicate)))).toEqual(rule('edicion_repetida'))
        yield* asUser(e.rita)(createGame(newGame('Hades', [{ lanzador_id: e.lanzador, identificador_externo: '1145360' }])))
        const foreign = newGame('Hades II', [{ lanzador_id: e.lanzador, identificador_externo: '1145360' }])
        expect(yield* Effect.flip(asUser(e.rita)(createGame(foreign)))).toEqual(rule('identificador_en_uso'))
        expect(yield* e.sql`SELECT titulo FROM juego WHERE titulo LIKE 'Hades%' ORDER BY titulo`).toEqual([{ titulo: 'Hades' }])
      })))
  })

  describe('la aplicación permite', () => {
    it.effect('que un revisor registre un juego con sus APIs gráficas y CPU mínima, y la ficha las devuelve en orden', inScenario((e) =>
      Effect.gen(function* () {
        const game = newGame('Hades', [{ lanzador_id: e.lanzador, identificador_externo: '1145360' }], { apis: ['vulkan', 'd3d11', 'd3d11'], nivel_x86_min: 'v2' })
        const { id } = yield* asUser(e.rita)(createGame(game))
        const page = yield* asUser(null)(gamePage(id))
        expect(page.game).toMatchObject({ apis: ['d3d11', 'vulkan'], nivel_x86_min: 'v2' })
      })))

    it.effect('que un revisor registre un juego con dos ediciones', inScenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* asUser(e.rita)(
          createGame(
            newGame('  Hades  ', [
              { lanzador_id: e.lanzador, identificador_externo: '1145360' },
              { lanzador_id: e.lanzador2, identificador_externo: '   ' },
            ]),
          ),
        )
        expect(yield* e.sql`SELECT titulo, descripcion FROM juego WHERE id = ${id}`).toEqual([{ titulo: 'Hades', descripcion: 'Un juego de prueba' }])
        expect(yield* e.sql`SELECT lanzador_id, identificador_externo FROM edicion_juego WHERE juego_id = ${id} ORDER BY lanzador_id`).toEqual([
          { lanzador_id: e.lanzador, identificador_externo: '1145360' },
          { lanzador_id: e.lanzador2, identificador_externo: null },
        ])
      })))

    it.effect('reportar desde varios diagnósticos históricos del mismo equipo', inScenario((e) =>
      Effect.gen(function* () {
        const later = yield* e.diagnostico(e.equipoAna, '2026-10-05T10:00:00Z', { ram_mb: 32768 })
        yield* fileReport(e)
        yield* fileReport(e, { diagnostico_id: later, fecha_prueba: '2026-10-06T10:00:00.000Z' })
        const rows = yield* e.sql`SELECT diagnostico_id FROM reporte ORDER BY fecha_prueba`
        expect(rows).toEqual([{ diagnostico_id: e.diagAna }, { diagnostico_id: later }])
      })))

    it.effect('un reporte sin perfil, con su medición y sus fallos', inScenario((e) =>
      Effect.gen(function* () {
        const medicion = { fps_promedio: 54.5, resolucion: '1280x720', calidad_grafica: 'Bajo', metodo_medicion: 'MangoHud, 5 min' }
        const { id } = yield* fileReport(e, { resultado: 'falla_en_ejecucion', medicion, fallos: [{ tipo_fallo_id: e.otro, detalle: 'Se cierra a los 10 min' }] })
        const report = Schema.decodeUnknownSync(Rows)(yield* e.sql`SELECT perfil_id, fps_promedio, resolucion, estado_revision FROM reporte WHERE id = ${id}`)
        expect(report).toEqual([{ perfil_id: null, fps_promedio: '54.50', resolucion: '1280x720', estado_revision: 'pendiente' }])
        expect(yield* e.sql`SELECT tipo_fallo_id, detalle FROM reporte_fallo WHERE reporte_id = ${id}`).toEqual([
          { tipo_fallo_id: e.otro, detalle: 'Se cierra a los 10 min' },
        ])
      })))

    it.effect('una versión de capa nueva se crea una sola vez', inScenario((e) =>
      Effect.gen(function* () {
        const newLayer = { _tag: 'nueva', familia: 'Proton', variante: 'GE', version: '9-20' }
        yield* fileReport(e, { version_capa: newLayer })
        yield* fileReport(e, { version_capa: newLayer, fecha_prueba: '2026-10-04T10:00:00.000Z' })
        const layers = yield* e.sql`SELECT count(*)::int AS n, count(DISTINCT r.version_capa_id)::int AS usadas
                                   FROM version_capa c JOIN reporte r ON r.version_capa_id = c.id WHERE c.variante = 'GE'`
        expect(layers).toEqual([{ n: 2, usadas: 1 }])
      })))

    it.effect('decidir dos veces lo mismo no cambia nada la segunda vez', inScenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* fileReport(e)
        expect(yield* asUser(e.rita)(decide(ref('reporte', id), approve))).toEqual({ changed: true })
        const before = yield* e.sql`SELECT revisor_id, revisado_en, motivo_revision, evidencia_revision FROM reporte WHERE id = ${id}`
        const otherDecision = Schema.decodeUnknownSync(Decision)({ _tag: 'Aprobar', motivo: 'otro motivo', evidencia: 'otra evidencia' })
        expect(yield* asUser(e.rita)(decide(ref('reporte', id), otherDecision))).toEqual({ changed: false })
        expect(yield* e.sql`SELECT revisor_id, revisado_en, motivo_revision, evidencia_revision FROM reporte WHERE id = ${id}`).toEqual(before)
      })))

    it.effect('probar un perfil pendiente y aprobarlo con ese reporte; luego publicar una solución', inScenario((e) =>
      Effect.gen(function* () {
        const { id: working } = yield* fileReport(e, { perfil_id: e.perfilMint })
        const { id: failing } = yield* fileReport(e, { perfil_id: e.perfilMint, fecha_prueba: '2026-10-04T10:00:00.000Z', ...withFailure(e) })
        yield* asUser(e.rita)(decide(ref('reporte', working), approve))
        yield* asUser(e.rita)(decide(ref('perfil', e.perfilMint), approve))
        yield* asUser(e.rita)(decide(ref('reporte', failing), approve))
        const { id: solution } = yield* fileSolution(e, failing, { perfil_id: e.perfilMint })
        expect(yield* asUser(e.rita)(decide(ref('solucion', solution), approve))).toEqual({ changed: true })
        const statuses = yield* e.sql`SELECT estado_revision, revisor_id, evidencia_revision FROM solucion WHERE id = ${solution}`
        expect(statuses).toEqual([{ estado_revision: 'aprobado', revisor_id: 'rita', evidencia_revision: 'Captura de MangoHud #7' }])
      })))

    it.effect('retirar lo aprobado conserva la evidencia', inScenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* fileReport(e)
        yield* asUser(e.rita)(decide(ref('reporte', id), approve))
        yield* asUser(e.rita)(decide(ref('reporte', id), withdraw))
        expect(yield* e.sql`SELECT estado_revision, motivo_revision, evidencia_revision FROM reporte WHERE id = ${id}`).toEqual([
          { estado_revision: 'retirado', motivo_revision: 'Versión obsoleta', evidencia_revision: 'Captura de MangoHud #7' },
        ])
      })))
  })
})
