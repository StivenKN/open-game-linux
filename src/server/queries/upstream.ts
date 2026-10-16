import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { NotFound } from '../../domain/errors.ts'
import type { ReportId } from '../../domain/ids.ts'
import { activeStatuses } from '../../domain/review.ts'
import { Diagnostic, GameEdition, Game, Launcher, Report, ReportFailure, LayerVersion } from '../../domain/tables.ts'
import { protonReport } from '../../domain/upstream.ts'
import { requireUser } from '../auth.ts'
import { rows } from '../rows.ts'
import { isDemo, distributionLabel } from './labels.ts'

const ProtonReportRow = Schema.Struct({
  juego_id: Game.fields.id,
  juego: Game.fields.titulo,
  lanzador: Launcher.fields.nombre,
  identificador_externo: GameEdition.fields.identificador_externo,
  ...LayerVersion.mapFields(Struct.pick(['familia', 'variante', 'version'])).fields,
  ...Report.mapFields(Struct.pick(['resultado', 'version_juego', 'fecha_prueba', 'observaciones'])).fields,
  ...Diagnostic.mapFields(Struct.pick(['gpu_modelo', 'controlador', 'version_controlador', 'version_sistema'])).fields,
  distribucion: Schema.String,
  ejemplo: Schema.Boolean,
})
const FailureRow = ReportFailure.mapFields(Struct.pick(['detalle']))

/**
 * The Proton report for one of the visitor's own reports. It embeds the diagnosis hardware, which only its
 * owner sees, and needs the steam-<appid>.log that only the tester has, so anyone else gets NoEncontrado.
 */
export const myProtonReport = (reportId: ReportId) =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* rows(
      ProtonReportRow,
      sql`SELECT j.id AS game_id, j.title AS game, l.name AS launcher, e.external_id,
                 vc.family, vc.variant, vc.version, r.outcome, r.game_version, r.tested_at, r.observations,
                 d.gpu_model, d.driver, d.driver_version, d.os_version,
                 ${sql.literal(distributionLabel('di'))} AS distribution, ${sql.literal(isDemo('u'))} AS demo
          FROM report r
          JOIN game_edition e ON e.id = r.edition_id
          JOIN game j ON j.id = e.game_id
          JOIN launcher l ON l.id = e.launcher_id
          JOIN layer_version vc ON vc.id = r.layer_version_id
          JOIN diagnostic d ON d.id = r.diagnostic_id
          JOIN distribution di ON di.id = d.distribution_id
          JOIN machine eq ON eq.id = d.machine_id
          JOIN app_user u ON u.id = eq.user_id
          WHERE r.id = ${reportId} AND eq.user_id = ${user.id} AND r.review_status IN ${sql.in(activeStatuses)}`,
    )
    if (row === undefined) return yield* Effect.fail(new NotFound())
    const failures = yield* rows(FailureRow, sql`SELECT detail FROM report_failure WHERE report_id = ${reportId} ORDER BY failure_type_id`)
    return {
      report: { id: reportId, juego_id: row.juego_id, juego: row.juego },
      protonReport: protonReport({ ...row, failures: failures.map((f) => f.detalle) }),
    }
  })
