import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { RuleViolated, type Forbidden } from '../../domain/errors.ts'
import { LayerFamily } from '../../domain/literals.ts'
import { ReviewStatus } from '../../domain/review.ts'
import { GameEdition, Launcher } from '../../domain/tables.ts'
import { exportableAppId, type FixNote } from '../../domain/upstream.ts'
import { exigirRevisor } from '../auth.ts'
import { esDemo } from '../queries/labels.ts'
import { filas } from '../rows.ts'
import type { Escritura } from './contributions.ts'

const PerfilExportable = Schema.Struct({
  estado_revision: ReviewStatus,
  lanzador: Launcher.fields.nombre,
  identificador_externo: GameEdition.fields.identificador_externo,
  familia: LayerFamily,
  ejemplo: Schema.Boolean,
})
const ConId = Schema.Struct({ id: Schema.Int })
const DelPr = Schema.Struct({ perfil_id: Schema.Int })

/**
 * The single writer of arreglo_upstream. Idempotent: recording a PR twice, or annulling a PR that is not
 * recorded, changes nothing. A later retirement of the profile leaves its rows: the merge upstream happened.
 */
export const anotarArreglo = (nota: FixNote): Escritura<{ readonly cambio: boolean }, RuleViolated | Forbidden> =>
  Effect.gen(function* () {
    const revisor = yield* exigirRevisor
    const sql = yield* SqlClient.SqlClient
    if (nota._tag === 'Anular') {
      const borradas = yield* filas(ConId, sql`DELETE FROM arreglo_upstream WHERE pr = ${nota.pr} RETURNING id`)
      return { cambio: borradas.length > 0 }
    }

    const [perfil] = yield* filas(
      PerfilExportable,
      sql`SELECT p.estado_revision, l.nombre AS lanzador, e.identificador_externo, vc.familia, ${sql.literal(esDemo('u'))} AS ejemplo
          FROM perfil_configuracion p
          JOIN edicion_juego e ON e.id = p.edicion_id
          JOIN lanzador l ON l.id = e.lanzador_id
          JOIN version_capa vc ON vc.id = p.version_capa_id
          JOIN usuario u ON u.id = p.autor_id
          WHERE p.id = ${nota.perfil_id}
          FOR SHARE OF p`,
    )
    if (perfil === undefined || perfil.estado_revision !== 'aprobado' || exportableAppId(perfil)._tag === 'no_exportable')
      return yield* Effect.fail(new RuleViolated({ rule: 'arreglo_no_exportable' }))
    if (perfil.ejemplo) return yield* Effect.fail(new RuleViolated({ rule: 'arreglo_datos_de_ejemplo' }))

    const creadas = yield* filas(
      ConId,
      sql`INSERT INTO arreglo_upstream ${sql.insert({ pr: nota.pr, perfil_id: nota.perfil_id, registrado_por: revisor.id })}
          ON CONFLICT ON CONSTRAINT arreglo_upstream_pr_uq DO NOTHING RETURNING id`,
    )
    if (creadas.length > 0) return { cambio: true }
    const [existente] = yield* filas(DelPr, sql`SELECT perfil_id FROM arreglo_upstream WHERE pr = ${nota.pr}`)
    if (existente?.perfil_id !== nota.perfil_id) return yield* Effect.fail(new RuleViolated({ rule: 'arreglo_pr_de_otro_perfil' }))
    return { cambio: false }
  })
