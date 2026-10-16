import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { mismatches, type NewSolution, type NewGame, type NewReport, TargetProfile } from '../../domain/contributions.ts'
import { type Unauthenticated, IncomparableProfile, type Rule, RuleViolated, type Forbidden } from '../../domain/errors.ts'
import { GameId, ReportId, SolutionId, LayerVersionId } from '../../domain/ids.ts'
import { activeStatuses } from '../../domain/review.ts'
import { Diagnostic, Machine, Profile, Report } from '../../domain/tables.ts'
import { requireReviewer, requireUser, type Visitor } from '../auth.ts'
import { withDbRules } from '../schema/constraints.ts'
import { rows, type Infra, oneRow } from '../rows.ts'

export type Write<A, E> = Effect.Effect<A, E | Unauthenticated | Infra, SqlClient.SqlClient | Visitor>

const violate = (rule: Rule) => Effect.fail(new RuleViolated({ rule }))

const ReportDiagnostic = Schema.Struct({
  user_id: Machine.fields.user_id,
  ...Diagnostic.mapFields(Struct.pick(['operating_system', 'distribution_id', 'architecture', 'captured_at'])).fields,
})

const ReportIdRow = Schema.Struct({ id: ReportId })

export const submitReport = (n: NewReport): Write<{ readonly id: ReportId }, RuleViolated | IncomparableProfile> =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient

    const [d] = yield* rows(
      ReportDiagnostic,
      sql`SELECT e.user_id, d.operating_system, d.distribution_id, d.architecture, d.captured_at
          FROM diagnostic d JOIN machine e ON e.id = d.machine_id WHERE d.id = ${n.diagnostico_id}`,
    )
    if (d === undefined || d.user_id !== user.id) return yield* violate('equipo_ajeno')
    if (d.operating_system !== 'Linux' || d.distribution_id === null) return yield* violate('diagnostico_no_linux')
    if (n.fecha_prueba < d.captured_at) return yield* violate('fecha_antes_del_diagnostico')

    const layer_version_id = yield* resolveLayerVersion(n.version_capa)

    if (n.perfil_id !== null) {
      const [profile] = yield* rows(
        TargetProfile,
        sql`SELECT edition_id, layer_version_id, distribution_id, architecture, target_game_version
            FROM profile WHERE id = ${n.perfil_id} AND review_status IN ${sql.in(activeStatuses)}`,
      )
      if (profile === undefined) return yield* violate('perfil_no_disponible')
      const found = mismatches(
        { edition_id: n.edicion_id, layer_version_id, distribution_id: d.distribution_id, architecture: d.architecture, game_version: n.version_juego },
        profile,
      )
      if (Arr.isReadonlyArrayNonEmpty(found)) return yield* Effect.fail(new IncomparableProfile({ mismatches: found }))
    }

    const created = yield* oneRow(
      ReportIdRow,
      sql`INSERT INTO report ${sql.insert({
        edition_id: n.edicion_id,
        diagnostic_id: n.diagnostico_id,
        layer_version_id,
        profile_id: n.perfil_id,
        game_version: n.version_juego,
        launcher_version: n.version_lanzador,
        tested_at: n.fecha_prueba,
        outcome: n.resultado,
        avg_fps: n.medicion?.fps_promedio ?? null,
        resolution: n.medicion?.resolucion ?? null,
        graphics_quality: n.medicion?.calidad_grafica ?? null,
        measurement_method: n.medicion?.metodo_medicion ?? null,
        observations: n.observaciones,
      })} RETURNING id`,
    )
    if (Arr.isReadonlyArrayNonEmpty(n.fallos))
      yield* withDbRules(
        sql`INSERT INTO report_failure ${sql.insert(n.fallos.map((f) => ({ report_id: created.id, failure_type_id: f.tipo_fallo_id, detail: f.detalle })))}`,
      )
    return { id: created.id }
  })

const LayerVersionIdRow = Schema.Struct({ id: LayerVersionId })

const resolveLayerVersion = (ref: NewReport['version_capa']) =>
  Effect.gen(function* () {
    if (ref._tag === 'existente') return ref.id
    const sql = yield* SqlClient.SqlClient
    // DO UPDATE instead of DO NOTHING so RETURNING also yields the id of a row that already existed.
    const layer = yield* withDbRules(
      oneRow(
        LayerVersionIdRow,
        sql`INSERT INTO layer_version (family, variant, version) VALUES (${ref.familia}, ${ref.variante}, ${ref.version})
            ON CONFLICT ON CONSTRAINT layer_version_uq DO UPDATE SET family = EXCLUDED.family RETURNING id`,
      ),
    )
    return layer.id
  })

const SolutionOrigin = Report.mapFields(Struct.pick(['edition_id']))
const RecommendedProfile = Profile.mapFields(Struct.pick(['edition_id']))
const SolutionIdRow = Schema.Struct({ id: SolutionId })

export const submitSolution = (s: NewSolution): Write<{ readonly id: SolutionId }, RuleViolated> =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient

    const [origin] = yield* rows(
      SolutionOrigin,
      sql`SELECT r.edition_id FROM report_failure f JOIN report r ON r.id = f.report_id
          WHERE f.report_id = ${s.reporte_id} AND f.failure_type_id = ${s.tipo_fallo_id} AND r.review_status IN ${sql.in(activeStatuses)}`,
    )
    if (origin === undefined) return yield* violate('solucion_sin_fallo')

    if (s.perfil_id !== null) {
      const [profile] = yield* rows(
        RecommendedProfile,
        sql`SELECT edition_id FROM profile WHERE id = ${s.perfil_id} AND review_status IN ${sql.in(activeStatuses)}`,
      )
      if (profile === undefined) return yield* violate('perfil_no_disponible')
      if (profile.edition_id !== origin.edition_id) return yield* violate('solucion_perfil_otra_edicion')
    }

    const created = yield* oneRow(
      SolutionIdRow,
      sql`INSERT INTO solution ${sql.insert({
        report_id: s.reporte_id,
        failure_type_id: s.tipo_fallo_id,
        author_id: user.id,
        profile_id: s.perfil_id,
        title: s.titulo,
        instructions: s.instrucciones,
      })} RETURNING id`,
    )
    return { id: created.id }
  })

const GameIdRow = Schema.Struct({ id: GameId })

export const createGame = (j: NewGame): Write<{ readonly id: GameId }, RuleViolated | Forbidden> =>
  Effect.gen(function* () {
    yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    const created = yield* oneRow(
      GameIdRow,
      sql`INSERT INTO game ${sql.insert({ title: j.titulo, description: j.descripcion, x86_level_min: j.nivel_x86_min })} RETURNING id`,
    )
    yield* withDbRules(
      sql`INSERT INTO game_edition ${sql.insert(j.ediciones.map((e) => ({ game_id: created.id, launcher_id: e.lanzador_id, external_id: e.identificador_externo })))}`,
    )
    yield* sql`INSERT INTO game_api ${sql.insert(Arr.dedupe(j.apis).map((api) => ({ game_id: created.id, api })))}`
    return { id: created.id }
  })
