import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { DistributionId } from '../../domain/ids.ts'
import { WorkingOutcome } from '../../domain/literals.ts'
import { type ContributionRef, type Blocker, activeStatuses, type ContributionType } from '../../domain/review.ts'
import { Diagnostic, Game, Launcher, Profile, Report, Solution, FailureType, User } from '../../domain/tables.ts'
import { approvalBlockers } from '../commands/review.ts'
import { requireReviewer } from '../auth.ts'
import { rows } from '../rows.ts'
import { isDemo, layerLabel, distributionLabel, profileLabel } from './labels.ts'

const Name = Schema.String

const Common = {
  creado_en: Schema.Date,
  estado_revision: Profile.fields.estado_revision,
  autor: User.fields.alias,
  demo: Schema.Boolean,
  es_propio: Schema.Boolean,
  juego: Game.fields.titulo,
  lanzador: Launcher.fields.nombre,
}

const ProfileQueueItem = Schema.Struct({
  ...Common,
  ...Profile.mapFields(Struct.pick(['id', 'titulo', 'revision', 'arquitectura', 'version_juego_objetivo', 'parametros_lanzamiento'])).fields,
  distribucion: Name,
  capa: Name,
  pasos: Schema.Int,
  reportes_funcionales: Schema.Int,
})

const ReportQueueItem = Schema.Struct({
  ...Common,
  ...Report.mapFields(
    Struct.pick(['id', 'resultado', 'version_juego', 'fecha_prueba', 'fps_promedio', 'resolucion', 'calidad_grafica', 'metodo_medicion', 'observaciones']),
  ).fields,
  distribucion: Name,
  distribucion_id: DistributionId,
  arquitectura: Diagnostic.fields.arquitectura,
  capa: Name,
  perfil: Schema.NullOr(Name),
  fallos: Schema.Array(Schema.Struct({ codigo: FailureType.fields.codigo, detalle: Schema.String })),
})

const SolutionQueueItem = Schema.Struct({
  ...Common,
  ...Solution.mapFields(Struct.pick(['id', 'titulo', 'instrucciones', 'reporte_id'])).fields,
  tipo_fallo: FailureType.fields.codigo,
  fallo: Schema.String,
  estado_reporte: Report.fields.estado_revision,
  perfil: Schema.NullOr(Name),
})

const withBlockers = <A extends { readonly estado_revision: string }>(items: ReadonlyArray<A>, refOf: (a: A) => ContributionRef) =>
  Effect.forEach(items, (e) =>
    Effect.map(e.estado_revision === 'pendiente' ? approvalBlockers(refOf(e)) : Effect.succeed([]), (blockers: ReadonlyArray<Blocker>) => ({ ...e, blockers })),
  )

export const queue = (type: ContributionType) =>
  Effect.gen(function* () {
    const reviewer = yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    const active = sql.in(activeStatuses)
    const demo = sql.literal(isDemo('u'))
    const order = sql`(review_status = 'pendiente') DESC, created_at`

    switch (type) {
      case 'perfil': {
        const items = yield* rows(
          ProfileQueueItem,
          sql`SELECT * FROM (
                SELECT p.id, p.title, p.revision, p.architecture, p.target_game_version, p.launch_options, p.created_at, p.review_status,
                       u.alias AS author, ${demo} AS demo, p.author_id = ${reviewer.id} AS is_own,
                       j.title AS game, l.name AS launcher, ${sql.literal(distributionLabel('di'))} AS distribution,
                       ${sql.literal(layerLabel('c'))} AS layer,
                       (SELECT count(*)::int FROM profile_step WHERE profile_id = p.id) AS steps,
                       (SELECT count(*)::int FROM report r WHERE r.profile_id = p.id AND r.review_status = 'aprobado'
                          AND r.outcome IN ${sql.in(WorkingOutcome.literals)}) AS working_reports
                FROM profile p JOIN app_user u ON u.id = p.author_id
                  JOIN game_edition e ON e.id = p.edition_id JOIN game j ON j.id = e.game_id JOIN launcher l ON l.id = e.launcher_id
                  JOIN distribution di ON di.id = p.distribution_id JOIN layer_version c ON c.id = p.layer_version_id
                WHERE p.review_status IN ${active}) q
              ORDER BY ${order}`,
        )
        return { type, items: yield* withBlockers(items, (e) => ({ _tag: 'perfil', id: e.id })) }
      }
      case 'reporte': {
        const items = yield* rows(
          ReportQueueItem,
          sql`SELECT * FROM (
                SELECT r.id, r.outcome, r.game_version, r.tested_at, r.avg_fps, r.resolution, r.graphics_quality, r.measurement_method,
                       r.observations, r.created_at, r.review_status,
                       u.alias AS author, ${demo} AS demo, eq.user_id = ${reviewer.id} AS is_own,
                       j.title AS game, l.name AS launcher, ${sql.literal(distributionLabel('di'))} AS distribution, d.distribution_id, d.architecture,
                       ${sql.literal(layerLabel('c'))} AS layer,
                       ${sql.literal(profileLabel('p'))} AS profile,
                       COALESCE((SELECT json_agg(json_build_object('codigo', t.code, 'detalle', f.detail) ORDER BY t.id)
                                 FROM report_failure f JOIN failure_type t ON t.id = f.failure_type_id WHERE f.report_id = r.id), '[]') AS failures
                FROM report r JOIN diagnostic d ON d.id = r.diagnostic_id JOIN machine eq ON eq.id = d.machine_id JOIN app_user u ON u.id = eq.user_id
                  JOIN game_edition e ON e.id = r.edition_id JOIN game j ON j.id = e.game_id JOIN launcher l ON l.id = e.launcher_id
                  JOIN distribution di ON di.id = d.distribution_id JOIN layer_version c ON c.id = r.layer_version_id
                  LEFT JOIN profile p ON p.id = r.profile_id
                WHERE r.review_status IN ${active}) q
              ORDER BY ${order}`,
        )
        return { type, items: yield* withBlockers(items, (e) => ({ _tag: 'reporte', id: e.id })) }
      }
      case 'solucion': {
        const items = yield* rows(
          SolutionQueueItem,
          sql`SELECT * FROM (
                SELECT s.id, s.title, s.instructions, s.report_id, s.created_at, s.review_status,
                       u.alias AS author, ${demo} AS demo, s.author_id = ${reviewer.id} AS is_own,
                       j.title AS game, l.name AS launcher, t.code AS failure_type, f.detail AS failure, r.review_status AS report_status,
                       ${sql.literal(profileLabel('p'))} || ' (' || p.review_status || ')' AS profile
                FROM solution s JOIN app_user u ON u.id = s.author_id
                  JOIN report_failure f ON f.report_id = s.report_id AND f.failure_type_id = s.failure_type_id JOIN failure_type t ON t.id = s.failure_type_id
                  JOIN report r ON r.id = s.report_id JOIN game_edition e ON e.id = r.edition_id
                  JOIN game j ON j.id = e.game_id JOIN launcher l ON l.id = e.launcher_id
                  LEFT JOIN profile p ON p.id = s.profile_id
                WHERE s.review_status IN ${active}) q
              ORDER BY ${order}`,
        )
        return { type, items: yield* withBlockers(items, (e) => ({ _tag: 'solucion', id: e.id })) }
      }
    }
  })
