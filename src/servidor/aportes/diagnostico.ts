import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import type { Captura, GuardarDiagnostico } from '../../dominio/aportes.ts'
import { type PayloadInvalido, ReglaIncumplida } from '../../dominio/fallos.ts'
import { Diagnostico, Distribucion, Equipo } from '../../dominio/tablas.ts'
import { exigirUsuario } from '../auth.ts'
import { capturaDe } from '../diagnostico/payload.ts'
import { filas, unaFila } from '../filas.ts'
import type { Escritura } from './aportes.ts'

const IdEquipo = Schema.Struct({ id: Equipo.fields.id })
const Guardado = Schema.Struct({ id: Diagnostico.fields.id, nuevo: Schema.Boolean })

export const registrarDiagnostico = (
  g: typeof GuardarDiagnostico.Type,
): Escritura<{ readonly id: typeof Diagnostico.Type.id; readonly nuevo: boolean }, ReglaIncumplida | PayloadInvalido> =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const captura = yield* capturaDe(g.entrada)
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT 1 FROM usuario WHERE id = ${usuario.id} FOR UPDATE`

    const [equipo] =
      g.equipo._tag === 'existente'
        ? yield* filas(IdEquipo, sql`SELECT id FROM equipo WHERE id = ${g.equipo.id} AND usuario_id = ${usuario.id}`)
        : yield* filas(
            IdEquipo,
            sql`
              WITH previo AS (SELECT id FROM equipo WHERE usuario_id = ${usuario.id} AND lower(alias) = lower(${g.equipo.alias}) ORDER BY id LIMIT 1),
                   creado AS (INSERT INTO equipo (usuario_id, alias) SELECT ${usuario.id}, ${g.equipo.alias} WHERE NOT EXISTS (SELECT 1 FROM previo) RETURNING id)
              SELECT id FROM previo UNION ALL SELECT id FROM creado`,
          )
    if (equipo === undefined) return yield* Effect.fail(new ReglaIncumplida({ regla: 'equipo_ajeno' }))

    const soloLinux =
      captura.sistema === 'Linux'
        ? {
            distribucion_id: yield* distribucionDe(captura.distribucion),
            controlador: captura.controlador,
            version_controlador: captura.version_controlador,
            soporte_vulkan: captura.soporte_vulkan,
            version_vulkan: captura.version_vulkan,
          }
        : { distribucion_id: null, controlador: null, version_controlador: null, soporte_vulkan: 'desconocido', version_vulkan: null }
    const fila = {
      equipo_id: equipo.id,
      capturado_en: captura.capturado_en,
      sistema: captura.sistema,
      version_sistema: captura.version_sistema,
      arquitectura: captura.arquitectura,
      cpu_modelo: captura.cpu_modelo,
      gpu_modelo: captura.gpu_modelo,
      ram_mb: captura.ram_mb,
      vram_mb: captura.vram_mb,
      nivel_x86: captura.nivel_x86,
      arranque_seguro: captura.arranque_seguro,
      tpm: captura.tpm,
      zram_mb: captura.zram_mb,
      swap_mb: captura.swap_mb,
      ...soloLinux,
      gpu_pci_id: captura.gpu_pci_id,
      // Sent as JSON text: the untyped parameter takes the jsonb column's type.
      biblioteca_steam: g.con_biblioteca && captura.biblioteca_steam !== null ? JSON.stringify(captura.biblioteca_steam) : null,
    }
    return yield* unaFila(
      Guardado,
      sql`
        WITH nuevo AS (INSERT INTO diagnostico ${sql.insert(fila)} ON CONFLICT (equipo_id, capturado_en) DO NOTHING RETURNING id)
        SELECT id, true AS nuevo FROM nuevo
        UNION ALL
        SELECT id, false AS nuevo FROM diagnostico WHERE equipo_id = ${equipo.id} AND capturado_en = ${captura.capturado_en}`,
    )
  })

type DistribucionCapturada = Extract<Captura, { readonly sistema: 'Linux' }>['distribucion']

/**
 * The distribucion row for a captured (nombre, version), created on first sight. Two statements on
 * purpose: under READ COMMITTED the SELECT takes a new snapshot, so it sees a row another user's
 * transaction committed while this INSERT waited on the conflict.
 */
const distribucionDe = (d: DistribucionCapturada) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO distribucion (nombre, version) VALUES (${d.nombre}, ${d.version}) ON CONFLICT (nombre, version) DO NOTHING`
    const fila = yield* unaFila(Schema.Struct({ id: Distribucion.fields.id }), sql`SELECT id FROM distribucion WHERE nombre = ${d.nombre} AND version = ${d.version}`)
    return fila.id
  })
