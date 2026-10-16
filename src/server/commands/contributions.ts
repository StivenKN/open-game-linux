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
  usuario_id: Machine.fields.usuario_id,
  ...Diagnostic.mapFields(Struct.pick(['sistema', 'distribucion_id', 'arquitectura', 'capturado_en'])).fields,
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
    if (d === undefined || d.usuario_id !== user.id) return yield* violate('equipo_ajeno')
    if (d.sistema !== 'Linux' || d.distribucion_id === null) return yield* violate('diagnostico_no_linux')
    if (n.fecha_prueba < d.capturado_en) return yield* violate('fecha_antes_del_diagnostico')

    const version_capa_id = yield* resolveLayerVersion(n.version_capa)

    if (n.perfil_id !== null) {
      const [profile] = yield* rows(
        TargetProfile,
        sql`SELECT edition_id, layer_version_id, distribution_id, architecture, target_game_version
            FROM profile WHERE id = ${n.perfil_id} AND review_status IN ${sql.in(activeStatuses)}`,
      )
      if (profile === undefined) return yield* violate('perfil_no_disponible')
      const found = mismatches(
        { edicion_id: n.edicion_id, version_capa_id, distribucion_id: d.distribucion_id, arquitectura: d.arquitectura, version_juego: n.version_juego },
        profile,
      )
      if (Arr.isReadonlyArrayNonEmpty(found)) return yield* Effect.fail(new IncomparableProfile({ mismatches: found }))
    }

    const created = yield* oneRow(
      ReportIdRow,
      sql`INSERT INTO report ${sql.insert({
        edicion_id: n.edicion_id,
        diagnostico_id: n.diagnostico_id,
        version_capa_id,
        perfil_id: n.perfil_id,
        version_juego: n.version_juego,
        version_lanzador: n.version_lanzador,
        fecha_prueba: n.fecha_prueba,
        resultado: n.resultado,
        fps_promedio: n.medicion?.fps_promedio ?? null,
        resolucion: n.medicion?.resolucion ?? null,
        calidad_grafica: n.medicion?.calidad_grafica ?? null,
        metodo_medicion: n.medicion?.metodo_medicion ?? null,
        observaciones: n.observaciones,
      })} RETURNING id`,
    )
    if (Arr.isReadonlyArrayNonEmpty(n.fallos))
      yield* withDbRules(
        sql`INSERT INTO report_failure ${sql.insert(n.fallos.map((f) => ({ reporte_id: created.id, tipo_fallo_id: f.tipo_fallo_id, detalle: f.detalle })))}`,
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

const SolutionOrigin = Report.mapFields(Struct.pick(['edicion_id']))
const RecommendedProfile = Profile.mapFields(Struct.pick(['edicion_id']))
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
      if (profile.edicion_id !== origin.edicion_id) return yield* violate('solucion_perfil_otra_edicion')
    }

    const created = yield* oneRow(
      SolutionIdRow,
      sql`INSERT INTO solution ${sql.insert({
        reporte_id: s.reporte_id,
        tipo_fallo_id: s.tipo_fallo_id,
        autor_id: user.id,
        perfil_id: s.perfil_id,
        titulo: s.titulo,
        instrucciones: s.instrucciones,
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
      sql`INSERT INTO game ${sql.insert({ titulo: j.titulo, descripcion: j.descripcion, nivel_x86_min: j.nivel_x86_min })} RETURNING id`,
    )
    yield* withDbRules(sql`INSERT INTO game_edition ${sql.insert(j.ediciones.map((e) => ({ juego_id: created.id, ...e })))}`)
    yield* sql`INSERT INTO game_api ${sql.insert(Arr.dedupe(j.apis).map((api) => ({ juego_id: created.id, api })))}`
    return { id: created.id }
  })
