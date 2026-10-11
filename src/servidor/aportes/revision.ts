// The single writer of the 8.9 review block (estado_revision, revisor_id, revisado_en, motivo_revision,
// evidencia_revision) on perfil_configuracion, reporte and solucion. src/fronteras.test.ts fails the
// build if any other file writes estado_revision, revisor_id or evidencia_revision.
import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { SqlClient, type SqlError } from 'effect/sql'
import { discrepancias, PerfilObjetivo } from '../../dominio/aportes.ts'
import { AprobacionBloqueada, type NoAutenticado, NoEncontrado, ReglaIncumplida, type SinPermiso, TransicionInvalida } from '../../dominio/fallos.ts'
import { DistribucionId, UsuarioId } from '../../dominio/ids.ts'
import { ResultadoFuncional } from '../../dominio/literales.ts'
import { type AporteRef, type Bloqueo, type Decision, destinoDe, EstadoRevision, planificar, type TipoAporte } from '../../dominio/revision.ts'
import { Diagnostico, Reporte } from '../../dominio/tablas.ts'
import { exigirRevisor, type Visitante } from '../auth.ts'
import { filas, type Infra } from '../filas.ts'

type Lectura<A> = Effect.Effect<A, Infra, SqlClient.SqlClient>

const aprobado: EstadoRevision = 'aprobado'

/**
 * What decidir needs to know about a reviewable table. `bloquear` reads the row's state and author
 * under FOR UPDATE; `bloqueos` lists its unmet 8.9 approval preconditions (empty = approvable).
 */
type Revisable = {
  readonly tabla: string
  readonly bloquear: (sql: SqlClient.SqlClient, id: number) => Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>
  readonly bloqueos: (id: number) => Lectura<ReadonlyArray<Bloqueo>>
}

const Hay = Schema.Struct({ hay: Schema.Boolean })
const EstadosSolucion = Schema.Struct({ reporte: EstadoRevision, perfil: Schema.NullOr(EstadoRevision) })
const PruebaDeReporte = Schema.Struct({
  ...Reporte.mapFields(Struct.pick(['edicion_id', 'version_capa_id', 'version_juego', 'perfil_id'])).fields,
  distribucion_id: DistribucionId, // a report's diagnosis is Linux (registrarReporte), so it has a distro
  arquitectura: Diagnostico.fields.arquitectura,
})

/** The reviewable-table registry. `satisfies Record<TipoAporte, …>` fails the build when a tipo has no entry. */
const revisables = {
  perfil: {
    tabla: 'perfil_configuracion',
    bloquear: (sql, id) => sql`SELECT estado_revision, autor_id FROM perfil_configuracion WHERE id = ${id} FOR UPDATE`,
    // 8.9: at least one approved report that used the profile with a functional result. FOR SHARE holds
    // that report until decidir commits, so a reviewer retiring it at the same time waits instead.
    bloqueos: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [fila] = yield* filas(
          Hay,
          sql`SELECT EXISTS (SELECT 1 FROM reporte WHERE perfil_id = ${id} AND estado_revision = ${aprobado}
                AND resultado IN ${sql.in(ResultadoFuncional.literals)} LIMIT 1 FOR SHARE) AS hay`,
        )
        return fila?.hay === true ? [] : ['perfil_sin_reporte_funcional_aprobado']
      }),
  },
  reporte: {
    tabla: 'reporte',
    // 8.7: a report's author is its diagnosis's equipo's owner; nothing on the row names them.
    bloquear: (sql, id) =>
      sql`SELECT r.estado_revision, e.usuario_id AS autor_id
          FROM reporte r JOIN diagnostico d ON d.id = r.diagnostico_id JOIN equipo e ON e.id = d.equipo_id
          WHERE r.id = ${id} FOR UPDATE OF r`,
    // 8.7: comparability is checked again at approval. Unreachable by construction today (a used profile,
    // the report and its diagnosis are all frozen by triggers), so it guards against a future writer only.
    bloqueos: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [prueba] = yield* filas(
          PruebaDeReporte,
          sql`SELECT r.edicion_id, r.version_capa_id, r.version_juego, r.perfil_id, d.distribucion_id, d.arquitectura
              FROM reporte r JOIN diagnostico d ON d.id = r.diagnostico_id WHERE r.id = ${id}`,
        )
        if (prueba === undefined || prueba.perfil_id === null) return []
        const [perfil] = yield* filas(
          PerfilObjetivo,
          sql`SELECT edicion_id, version_capa_id, distribucion_id, arquitectura, version_juego_objetivo
              FROM perfil_configuracion WHERE id = ${prueba.perfil_id}`,
        )
        return perfil !== undefined && discrepancias(prueba, perfil).length > 0 ? ['reporte_incomparable'] : []
      }),
  },
  solucion: {
    tabla: 'solucion',
    bloquear: (sql, id) => sql`SELECT estado_revision, autor_id FROM solucion WHERE id = ${id} FOR UPDATE`,
    // 8.9: the source report is approved, and so is a recommended profile, both held FOR SHARE until
    // decidir commits. The evidence that the fix works is Decision's required `evidencia`.
    bloqueos: (id) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const [estados] = yield* filas(
          EstadosSolucion,
          sql`SELECT r.estado_revision AS reporte,
                     (SELECT p.estado_revision FROM perfil_configuracion p WHERE p.id = s.perfil_id FOR SHARE) AS perfil
              FROM solucion s JOIN reporte r ON r.id = s.reporte_id
              WHERE s.id = ${id} FOR SHARE OF r`,
        )
        if (estados === undefined) return []
        const bloqueos: Array<Bloqueo> = []
        if (estados.reporte !== aprobado) bloqueos.push('solucion_fallo_origen_no_aprobado')
        if (estados.perfil !== null && estados.perfil !== aprobado) bloqueos.push('solucion_perfil_no_aprobado')
        return bloqueos
      }),
  },
} as const satisfies Record<TipoAporte, Revisable>

/** Unmet approval preconditions; empty means approvable. decidir runs it, and the queue shows it. */
export const bloqueosAprobacion = (ref: AporteRef): Lectura<ReadonlyArray<Bloqueo>> => revisables[ref._tag].bloqueos(ref.id)

const FilaRevisable = Schema.Struct({ estado_revision: EstadoRevision, autor_id: UsuarioId })

/**
 * RF-10. Applies `decision` to the referenced row, in the caller's transaction:
 *   1. exigirRevisor (rol revisor|administrador, activo)  -> SinPermiso (rendered as notFound) / NoAutenticado
 *   2. lock the row (FOR UPDATE)                          -> NoEncontrado
 *   3. the author is not the reviewer                     -> ReglaIncumplida('autorrevision'), for all three tables
 *   4. planificar: sin_cambios -> { cambio: false }       (a double click or a racing twin converges)
 *                  transicion_invalida                    -> TransicionInvalida { de, a }
 *   5. Aprobar: bloqueosAprobacion non-empty              -> AprobacionBloqueada
 *   6. write the five columns. Retirar and Rechazar keep any earlier evidence (the CHECK allows it).
 * Two reviewers racing serialize on the row lock; the second converges or gets TransicionInvalida.
 */
export const decidir = (
  ref: AporteRef,
  decision: Decision,
): Effect.Effect<
  { readonly cambio: boolean },
  ReglaIncumplida | TransicionInvalida | AprobacionBloqueada | NoEncontrado | NoAutenticado | SinPermiso | Infra,
  SqlClient.SqlClient | Visitante
> =>
  Effect.gen(function* () {
    const revisor = yield* exigirRevisor
    const sql = yield* SqlClient.SqlClient
    const revisable = revisables[ref._tag]

    const [fila] = yield* filas(FilaRevisable, revisable.bloquear(sql, ref.id))
    if (fila === undefined) return yield* Effect.fail(new NoEncontrado())
    if (fila.autor_id === revisor.id) return yield* Effect.fail(new ReglaIncumplida({ regla: 'autorrevision' }))

    const destino = destinoDe[decision._tag]
    const plan = planificar(fila.estado_revision, decision)
    if (plan === 'sin_cambios') return { cambio: false }
    if (plan === 'transicion_invalida') return yield* Effect.fail(new TransicionInvalida({ de: fila.estado_revision, a: destino }))

    if (decision._tag === 'Aprobar') {
      const bloqueos = yield* revisable.bloqueos(ref.id)
      if (Arr.isReadonlyArrayNonEmpty(bloqueos)) return yield* Effect.fail(new AprobacionBloqueada({ bloqueos }))
    }

    const evidencia = decision._tag === 'Aprobar' ? decision.evidencia : null
    yield* sql`UPDATE ${sql(revisable.tabla)}
               SET estado_revision = ${destino}, revisor_id = ${revisor.id}, revisado_en = now(),
                   motivo_revision = ${decision.motivo}, evidencia_revision = COALESCE(${evidencia}, evidencia_revision)
               WHERE id = ${ref.id}`
    return { cambio: true }
  })
