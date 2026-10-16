import { Clock, Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { onDistribution, ApprovedTest, summarize } from '../../domain/compatibility.ts'
import { requirements, evaluate, suggestProfile } from '../../domain/evaluation.ts'
import { NotFound } from '../../domain/errors.ts'
import { GameId, UserId } from '../../domain/ids.ts'
import { GraphicsApi } from '../../domain/literals.ts'
import { ReviewStatus, activeStatuses } from '../../domain/review.ts'
import { gamePath } from '../../domain/graphics-path.ts'
import { Diagnostic, GameEdition, Machine, Game, GameApi, Launcher, Profile, Solution, FailureType } from '../../domain/tables.ts'
import { Visitor } from '../auth.ts'
import { rows, oneRow } from '../rows.ts'
import { machineOnLinux } from '../gpu/capability.ts'
import { isDemo, layerLabel, distributionLabel, profileLabel } from './labels.ts'
import { protonDbSummaries } from './protondb.ts'

const GameTest = Schema.Struct({ ...ApprovedTest.fields, juego_id: GameId, ejemplo: Schema.Boolean })

export const approvedTests = (game: GameId | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* rows(
      GameTest,
      sql`
      SELECT e.juego_id, r.id AS reporte_id, r.estado_revision, r.edicion_id, l.nombre AS lanzador, r.version_juego,
             d.distribucion_id, ${sql.literal(distributionLabel('dist'))} AS distribucion,
             r.version_capa_id, ${sql.literal(layerLabel('vc'))} AS capa,
             r.perfil_id, ${sql.literal(profileLabel('p'))} AS perfil,
             r.resultado, r.fecha_prueba, r.fps_promedio, r.resolucion, r.calidad_grafica, r.metodo_medicion,
             COALESCE(array_agg(tf.codigo ORDER BY tf.codigo) FILTER (WHERE tf.id IS NOT NULL), '{}') AS fallos,
             ${sql.literal(isDemo('u'))} AS ejemplo
      FROM reporte r
      JOIN edicion_juego e ON e.id = r.edicion_id
      JOIN lanzador l ON l.id = e.lanzador_id
      JOIN diagnostico d ON d.id = r.diagnostico_id
      JOIN distribucion dist ON dist.id = d.distribucion_id
      JOIN equipo eq ON eq.id = d.equipo_id
      JOIN usuario u ON u.id = eq.usuario_id
      JOIN version_capa vc ON vc.id = r.version_capa_id
      LEFT JOIN perfil_configuracion p ON p.id = r.perfil_id
      LEFT JOIN reporte_fallo rf ON rf.reporte_id = r.id
      LEFT JOIN tipo_fallo tf ON tf.id = rf.tipo_fallo_id
      WHERE ${sql.and([sql`r.estado_revision = 'aprobado'`, ...(game === null ? [] : [sql`e.juego_id = ${game}`])])}
      GROUP BY r.id, e.id, l.id, d.id, dist.id, u.id, vc.id, p.id
      ORDER BY r.fecha_prueba DESC, r.id`,
    )
  })

const MyDiagnostic = Diagnostic.mapFields(
  Struct.pick([
    'id',
    'capturado_en',
    'sistema',
    'distribucion_id',
    'arquitectura',
    'ram_mb',
    'vram_mb',
    'soporte_vulkan',
    'version_vulkan',
    'controlador',
    'gpu_pci_id',
    'nivel_x86',
  ]),
).mapFields(Struct.assign({ equipo: Machine.fields.alias, distribucion: Schema.NullOr(Schema.String) }))

export const latestDiagnostic = (user: UserId) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    SqlSchema.findOneOption({
      Request: UserId,
      Result: MyDiagnostic,
      execute: (id) => sql`
        SELECT d.id, d.capturado_en, d.sistema, d.distribucion_id, d.arquitectura, d.ram_mb, d.vram_mb, d.soporte_vulkan,
               d.version_vulkan, d.controlador, d.gpu_pci_id, d.nivel_x86, eq.alias AS equipo, ${sql.literal(distributionLabel('dist'))} AS distribucion
        FROM diagnostico d
        JOIN equipo eq ON eq.id = d.equipo_id
        LEFT JOIN distribucion dist ON dist.id = d.distribucion_id
        WHERE eq.usuario_id = ${id}
        ORDER BY d.capturado_en DESC, d.id DESC
        LIMIT 1`,
    })(user),
  )

export const visitorDiagnostic = Effect.flatMap(Visitor, (visitor) =>
  Option.match(visitor, { onNone: () => Effect.succeedNone, onSome: (u) => latestDiagnostic(u.id) }),
)

const GameRow = Game.mapFields(Struct.pick(['id', 'titulo', 'descripcion', 'nivel_x86_min']))

const EditionRow = GameEdition.mapFields(Struct.pick(['id', 'identificador_externo'])).mapFields(
  Struct.assign({ lanzador: Launcher.fields.nombre }),
)

const ProfileRow = Profile.mapFields(
  Struct.pick(['id', 'titulo', 'revision', 'distribucion_id', 'arquitectura', 'ram_min_mb', 'vram_min_mb', 'requiere_vulkan', 'version_vulkan_min']),
).mapFields(
  Struct.assign({
    estado_revision: ReviewStatus.pick(activeStatuses),
    lanzador: Schema.String,
    distribucion: Schema.String,
    capa: Schema.String,
    ejemplo: Schema.Boolean,
  }),
)

const SolutionRow = Solution.mapFields(Struct.pick(['id', 'titulo', 'instrucciones'])).mapFields(
  Struct.assign({ codigo: FailureType.fields.codigo, autor: Schema.String, perfil: Schema.NullOr(Schema.String), ejemplo: Schema.Boolean }),
)

const Count = Schema.Struct({ n: Schema.Int })

export const gamePage = (gameId: GameId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const game = yield* SqlSchema.findOneOption({
      Request: GameId,
      Result: GameRow,
      execute: (id) => sql`SELECT id, titulo, descripcion, nivel_x86_min FROM juego WHERE id = ${id}`,
    })(gameId)
    if (Option.isNone(game)) return yield* new NotFound()

    const declared = yield* SqlSchema.findAll({
      Request: GameId,
      Result: GameApi.mapFields(Struct.pick(['api'])),
      execute: (id) => sql`SELECT api FROM juego_api WHERE juego_id = ${id}`,
    })(gameId)
    const apis = GraphicsApi.literals.filter((api) => declared.some((d) => d.api === api))

    const editions = yield* SqlSchema.findAll({
      Request: GameId,
      Result: EditionRow,
      execute: (id) => sql`
        SELECT e.id, e.identificador_externo, l.nombre AS lanzador
        FROM edicion_juego e JOIN lanzador l ON l.id = e.lanzador_id
        WHERE e.juego_id = ${id}
        ORDER BY l.nombre`,
    })(gameId)

    const now = new Date(yield* Clock.currentTimeMillis)
    const tests = yield* approvedTests(gameId)
    const summary = summarize(tests, now)

    const pending = yield* oneRow(
      Count,
      sql`
        SELECT count(*)::int AS n
        FROM reporte r JOIN edicion_juego e ON e.id = r.edicion_id
        WHERE e.juego_id = ${gameId} AND r.estado_revision = 'pendiente'`,
    )

    const profileRows = yield* SqlSchema.findAll({
      Request: GameId,
      Result: ProfileRow,
      execute: (id) => sql`
        SELECT p.id, p.titulo, p.revision, p.distribucion_id, p.arquitectura, p.ram_min_mb, p.vram_min_mb, p.requiere_vulkan,
               p.version_vulkan_min, p.estado_revision, l.nombre AS lanzador,
               ${sql.literal(distributionLabel('dist'))} AS distribucion, ${sql.literal(layerLabel('vc'))} AS capa,
               ${sql.literal(isDemo('u'))} AS ejemplo
        FROM perfil_configuracion p
        JOIN edicion_juego e ON e.id = p.edicion_id
        JOIN lanzador l ON l.id = e.lanzador_id
        JOIN distribucion dist ON dist.id = p.distribucion_id
        JOIN version_capa vc ON vc.id = p.version_capa_id
        JOIN usuario u ON u.id = p.autor_id
        WHERE e.juego_id = ${id} AND p.estado_revision IN ${sql.in(activeStatuses)}
        ORDER BY p.estado_revision = 'aprobado' DESC, p.titulo, p.revision DESC`,
    })(gameId)

    const solutions = yield* SqlSchema.findAll({
      Request: GameId,
      Result: SolutionRow,
      execute: (id) => sql`
        SELECT s.id, s.titulo, s.instrucciones, tf.codigo, u.alias AS autor, ${sql.literal(profileLabel('p'))} AS perfil,
               ${sql.literal(isDemo('u'))} AS ejemplo
        FROM solucion s
        JOIN reporte r ON r.id = s.reporte_id
        JOIN edicion_juego e ON e.id = r.edicion_id
        JOIN tipo_fallo tf ON tf.id = s.tipo_fallo_id
        JOIN usuario u ON u.id = s.autor_id
        LEFT JOIN perfil_configuracion p ON p.id = s.perfil_id
        WHERE e.juego_id = ${id} AND s.estado_revision = 'aprobado' AND r.estado_revision = 'aprobado'
          AND (s.perfil_id IS NULL OR p.estado_revision = 'aprobado')
        ORDER BY s.revisado_en DESC, s.id`,
    })(gameId)
    const failureTypes = yield* SqlSchema.findAll({
      Request: Schema.Void,
      Result: FailureType.mapFields(Struct.pick(['id', 'codigo', 'descripcion'])),
      execute: () => sql`SELECT id, codigo, descripcion FROM tipo_fallo`,
    })(undefined)
    const typeByCode = new Map(failureTypes.map((t) => [t.codigo, t]))
    const causes = summary.failures.map((f) => {
      const type = typeByCode.get(f.code)
      const report = tests.find((p) => p.fallos.includes(f.code))
      return {
        ...f,
        descripcion: type?.descripcion ?? null,
        solutions: solutions.filter((s) => s.codigo === f.code),
        reply: type && report ? { reporte_id: report.reporte_id, tipo_fallo_id: type.id } : null,
      }
    })

    const [protondb = null] = yield* protonDbSummaries(gameId)
    const diagnostic = yield* visitorDiagnostic
    const machine = Option.map(diagnostic, machineOnLinux)

    const profiles = profileRows.map(({ ram_min_mb, vram_min_mb, requiere_vulkan, version_vulkan_min, ...p }) => ({
      ...p,
      evaluation:
        Option.isSome(machine) && p.estado_revision === 'aprobado'
          ? evaluate(machine.value, requirements({ ram_min_mb, vram_min_mb, requiere_vulkan, version_vulkan_min }))
          : null,
    }))

    const personal = Option.match(Option.all({ d: diagnostic, machine }), {
      onNone: () => null,
      onSome: ({ d, machine: equipo }) => ({
        path: gamePath(equipo, d.nivel_x86, { apis, nivel_x86_min: game.value.nivel_x86_min }),
        nivel_x86_min: game.value.nivel_x86_min,
        approximate: d.sistema === 'Windows',
        on_my_distribution:
          d.distribucion_id === null || d.distribucion === null
            ? null
            : { name: d.distribucion, summary: onDistribution(tests, d.distribucion_id, now) },
        profile: suggestProfile(
          profiles.flatMap((p) => (p.evaluation === null ? [] : [{ ...p, evaluation: p.evaluation }])),
          d,
        ),
      }),
    })

    return {
      game: { ...game.value, apis },
      editions,
      summary,
      protondb,
      ejemplo: tests.some((p) => p.ejemplo),
      pending: pending.n,
      profiles,
      causes,
      diagnostic: Option.match(diagnostic, {
        onNone: () => null,
        onSome: (d) => ({ equipo: d.equipo, capturado_en: d.capturado_en, distribucion_id: d.distribucion_id }),
      }),
      personal,
    }
  })
