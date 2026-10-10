// The single writer of the 8.9 review block (estado_revision, revisor_id, revisado_en,
// motivo_revision, evidencia_revision) on perfil_configuracion, reporte and solucion.
// tests/fronteras.test.ts fails the build if any other file writes estado_revision.
import { Array as Arr, Effect, Option, Schema } from 'effect'
import { SqlClient, SqlError } from 'effect/sql'
import { AprobacionBloqueada, NoAutenticado, NoEncontrado, ReglaIncumplida, SinPermiso } from '../../dominio/fallos.ts'
import { UsuarioId } from '../../dominio/ids.ts'
import { EstadoRevision, planificar, type AporteRef, type Bloqueo, type Decision, type TipoAporte } from '../../dominio/revision.ts'
import { exigirRevisor, Visitante } from '../auth.ts'

type Infra = SqlError.SqlError | Schema.SchemaError

/** The reviewable-table registry. Record<TipoAporte, …> fails the build when a tipo is added without a table. */
const tablas = {
  perfil: 'perfil_configuracion',
  reporte: 'reporte',
  solucion: 'solucion',
} as const satisfies Record<TipoAporte, string>

/** The row as decidir needs it. reporte's author is derived (diagnostico -> equipo -> usuario, 8.7). */
const FilaRevisable = Schema.Struct({ estado_revision: EstadoRevision, autor_id: UsuarioId })

/**
 * Applies `decision` to the referenced row:
 *   1. exigirRevisor (rol revisor|administrador, activo)            -> SinPermiso (rendered as notFound)
 *   2. SELECT ... FOR UPDATE                                        -> NoEncontrado
 *   3. autor_id !== revisor.id                                      -> ReglaIncumplida('autorrevision')
 *      (the DB CHECK *_sin_autoaprobacion backs perfil and solucion; reporte has only this check)
 *   4. planificar(estado, decision): sin_cambios -> return { cambio: false } (idempotent);
 *      transicion_invalida -> ReglaIncumplida('transicion_invalida')
 *   5. Aprobar: bloqueosAprobacion(ref) non-empty                   -> AprobacionBloqueada
 *   6. UPDATE the five columns, revisado_en = now()
 * Two reviewers racing serialize on the row lock; the second converges or gets transicion_invalida.
 */
export const decidir = (
  ref: AporteRef,
  decision: Decision,
): Effect.Effect<
  { readonly cambio: boolean },
  ReglaIncumplida | AprobacionBloqueada | NoEncontrado | NoAutenticado | SinPermiso | Infra,
  SqlClient.SqlClient | Visitante
> =>
  Effect.gen(function* () {
    const revisor = yield* exigirRevisor
    const fila = yield* bloquearFila(ref)
    if (Option.isNone(fila)) return yield* Effect.fail(new NoEncontrado())
    if (fila.value.autor_id === revisor.id) return yield* Effect.fail(new ReglaIncumplida({ regla: 'autorrevision' }))

    const plan = planificar(fila.value.estado_revision, decision)
    if (plan === 'sin_cambios') return { cambio: false }
    if (plan === 'transicion_invalida') return yield* Effect.fail(new ReglaIncumplida({ regla: 'transicion_invalida' }))

    if (decision._tag === 'Aprobar') {
      const bloqueos = yield* bloqueosAprobacion(ref)
      if (Arr.isReadonlyArrayNonEmpty(bloqueos)) return yield* Effect.fail(new AprobacionBloqueada({ bloqueos }))
    }
    yield* escribirBloque(ref, revisor.id, decision)
    return { cambio: true }
  })

/**
 * Unmet approval preconditions; empty means approvable. The queue page (consultas/cola.ts) calls
 * this too, to render why "Aprobar" is disabled. One rule, two readers.
 *   perfil:   exists reporte aprobado with perfil_id = id and a functional resultado (exigeFallo false)
 *   solucion: source reporte aprobado; perfil_id null or that perfil aprobado
 *             (evidence of the fix: Decision 'Aprobar' requires evidencia by construction)
 *   reporte:  discrepancias(...) empty when perfil_id is set (8.7 re-check at approval)
 */
export const bloqueosAprobacion = (ref: AporteRef): Effect.Effect<ReadonlyArray<Bloqueo>, Infra, SqlClient.SqlClient> => {
  void ref
  return Effect.die('not implemented')
}

const bloquearFila = (ref: AporteRef): Effect.Effect<Option.Option<typeof FilaRevisable.Type>, Infra, SqlClient.SqlClient> => {
  // perfil/solucion: SELECT estado_revision, autor_id FROM ${tablas[ref._tag]} WHERE id = $1 FOR UPDATE
  // reporte: ... JOIN diagnostico d JOIN equipo e ... SELECT r.estado_revision, e.usuario_id AS autor_id ... FOR UPDATE OF r
  void ref
  void tablas
  return Effect.die('not implemented')
}

const escribirBloque = (ref: AporteRef, revisor: UsuarioId, decision: Decision): Effect.Effect<void, Infra, SqlClient.SqlClient> => {
  // UPDATE ${tablas[ref._tag]} SET estado_revision = destinoDe[decision._tag], revisor_id, revisado_en = now(),
  //   motivo_revision = decision.motivo, evidencia_revision = (Aprobar ? decision.evidencia : evidencia_revision)
  // Retirar keeps the approval's evidence: the CHECK allows it, and history stays readable.
  void ref
  void revisor
  void decision
  return Effect.die('not implemented')
}
