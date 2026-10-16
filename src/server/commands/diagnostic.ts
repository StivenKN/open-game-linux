import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import type { Capture, SaveDiagnostic } from '../../domain/contributions.ts'
import { type InvalidPayload, RuleViolated } from '../../domain/errors.ts'
import { Diagnostic, Distribution, Machine } from '../../domain/tables.ts'
import { requireUser } from '../auth.ts'
import { captureOf } from '../diagnostics/payload.ts'
import { rows, oneRow } from '../rows.ts'
import type { Write } from './contributions.ts'

const MachineIdRow = Schema.Struct({ id: Machine.fields.id })
const Saved = Schema.Struct({ id: Diagnostic.fields.id, nuevo: Schema.Boolean })

export const submitDiagnostic = (
  g: typeof SaveDiagnostic.Type,
): Write<{ readonly id: typeof Diagnostic.Type.id; readonly nuevo: boolean }, RuleViolated | InvalidPayload> =>
  Effect.gen(function* () {
    const user = yield* requireUser
    const capture = yield* captureOf(g.entrada)
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT 1 FROM usuario WHERE id = ${user.id} FOR UPDATE`

    const [machine] =
      g.equipo._tag === 'existente'
        ? yield* rows(MachineIdRow, sql`SELECT id FROM equipo WHERE id = ${g.equipo.id} AND usuario_id = ${user.id}`)
        : yield* rows(
            MachineIdRow,
            sql`
              WITH previo AS (SELECT id FROM equipo WHERE usuario_id = ${user.id} AND lower(alias) = lower(${g.equipo.alias}) ORDER BY id LIMIT 1),
                   creado AS (INSERT INTO equipo (usuario_id, alias) SELECT ${user.id}, ${g.equipo.alias} WHERE NOT EXISTS (SELECT 1 FROM previo) RETURNING id)
              SELECT id FROM previo UNION ALL SELECT id FROM creado`,
          )
    if (machine === undefined) return yield* Effect.fail(new RuleViolated({ rule: 'equipo_ajeno' }))

    const linuxOnly =
      capture.sistema === 'Linux'
        ? {
            distribucion_id: yield* distributionIdOf(capture.distribucion),
            controlador: capture.controlador,
            version_controlador: capture.version_controlador,
            soporte_vulkan: capture.soporte_vulkan,
            version_vulkan: capture.version_vulkan,
          }
        : { distribucion_id: null, controlador: null, version_controlador: null, soporte_vulkan: 'desconocido', version_vulkan: null }
    const row = {
      equipo_id: machine.id,
      capturado_en: capture.capturado_en,
      sistema: capture.sistema,
      version_sistema: capture.version_sistema,
      arquitectura: capture.arquitectura,
      cpu_modelo: capture.cpu_modelo,
      gpu_modelo: capture.gpu_modelo,
      ram_mb: capture.ram_mb,
      vram_mb: capture.vram_mb,
      nivel_x86: capture.nivel_x86,
      arranque_seguro: capture.arranque_seguro,
      tpm: capture.tpm,
      zram_mb: capture.zram_mb,
      swap_mb: capture.swap_mb,
      ...linuxOnly,
      gpu_pci_id: capture.gpu_pci_id,
      // Sent as JSON text: the untyped parameter takes the jsonb column's type.
      biblioteca_steam: g.con_biblioteca && capture.biblioteca_steam !== null ? JSON.stringify(capture.biblioteca_steam) : null,
    }
    return yield* oneRow(
      Saved,
      sql`
        WITH nuevo AS (INSERT INTO diagnostico ${sql.insert(row)} ON CONFLICT (equipo_id, capturado_en) DO NOTHING RETURNING id)
        SELECT id, true AS nuevo FROM nuevo
        UNION ALL
        SELECT id, false AS nuevo FROM diagnostico WHERE equipo_id = ${machine.id} AND capturado_en = ${capture.capturado_en}`,
    )
  })

type CapturedDistribution = Extract<Capture, { readonly sistema: 'Linux' }>['distribucion']

/**
 * The distribucion row for a captured (nombre, version), created on first sight. Two statements on
 * purpose: under READ COMMITTED the SELECT takes a new snapshot, so it sees a row another user's
 * transaction committed while this INSERT waited on the conflict.
 */
const distributionIdOf = (d: CapturedDistribution) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO distribucion (nombre, version) VALUES (${d.nombre}, ${d.version}) ON CONFLICT (nombre, version) DO NOTHING`
    const row = yield* oneRow(Schema.Struct({ id: Distribution.fields.id }), sql`SELECT id FROM distribucion WHERE nombre = ${d.nombre} AND version = ${d.version}`)
    return row.id
  })
