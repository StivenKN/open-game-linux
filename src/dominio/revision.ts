// 8.9 review block: the state machine, the decision input, and the approval blockers. Pure, isomorphic.
import { Schema } from 'effect'
import { PerfilId, ReporteId, SolucionId, Texto } from './ids.ts'

export const EstadoRevision = Schema.Literals(['pendiente', 'aprobado', 'rechazado', 'retirado'])
export type EstadoRevision = typeof EstadoRevision.Type

/**
 * The only transition table. The DB checks each state's column shape (CHECK *_bloque_revision)
 * but not transitions, so there is no second list.
 *   pendiente -> aprobado | rechazado;  aprobado -> retirado;  rechazado, retirado terminal.
 */
export const siguientes = {
  pendiente: ['aprobado', 'rechazado'],
  aprobado: ['retirado'],
  rechazado: [],
  retirado: [],
} as const satisfies Record<EstadoRevision, ReadonlyArray<EstadoRevision>>

/** usuario.rol. One role per account (8, "Decisiones de alcance"). */
export const Rol = Schema.Literals(['usuario', 'revisor', 'administrador'])
export type Rol = typeof Rol.Type
export const puedeRevisar = { usuario: false, revisor: true, administrador: true } as const satisfies Record<Rol, boolean>

/**
 * A reviewer's decision, decoded from the review form. "Aprobar without evidencia" has no encoding:
 * the Aprobar member requires it, and Texto rejects blank text after trim (8.9).
 */
export const Decision = Schema.Union([
  Schema.TaggedStruct('Aprobar', { motivo: Texto, evidencia: Texto }),
  Schema.TaggedStruct('Rechazar', { motivo: Texto }),
  Schema.TaggedStruct('Retirar', { motivo: Texto }),
])
export type Decision = typeof Decision.Type

export const destinoDe = {
  Aprobar: 'aprobado',
  Rechazar: 'rechazado',
  Retirar: 'retirado',
} as const satisfies Record<Decision['_tag'], EstadoRevision>

/**
 * What applying `decision` to a row in `actual` means.
 * `sin_cambios` makes decidir idempotent: a double click or a racing second reviewer with the same
 * decision converges without overwriting revisor/fecha/motivo. On `transicion_invalida`, decidir fails
 * with TransicionInvalida { de: actual, a: destinoDe[decision._tag] } (fallos.ts imports this file,
 * so the class cannot be built here without an import cycle).
 */
export const planificar = (
  actual: EstadoRevision,
  decision: Decision,
): 'sin_cambios' | 'aplicar' | 'transicion_invalida' => {
  const destino = destinoDe[decision._tag]
  if (actual === destino) return 'sin_cambios'
  const permitidos: ReadonlyArray<EstadoRevision> = siguientes[actual]
  return permitidos.includes(destino) ? 'aplicar' : 'transicion_invalida'
}

/** The three reviewable tables, as a reference the queue and the decision endpoint share. */
export const AporteRef = Schema.Union([
  Schema.TaggedStruct('perfil', { id: PerfilId }),
  Schema.TaggedStruct('reporte', { id: ReporteId }),
  Schema.TaggedStruct('solucion', { id: SolucionId }),
])
export type AporteRef = typeof AporteRef.Type

/** The review queue's `?tipo=`. Indexing the registry in servidor/aportes/revision.ts by AporteRef tags keeps the two in step. */
export const TipoAporte = Schema.Literals(['perfil', 'reporte', 'solucion'])
export type TipoAporte = typeof TipoAporte.Type

/**
 * Typed approval blockers (round 1 graft). `bloqueosAprobacion` in servidor/aportes/revision.ts
 * returns these; the queue page renders them to explain a disabled "Aprobar", and decidir fails with
 * AprobacionBloqueada carrying the same list. One rule, two readers.
 */
export const Bloqueo = Schema.Literals([
  'perfil_sin_reporte_funcional_aprobado', // 8.9: a profile needs an approved functional report using it
  'solucion_fallo_origen_no_aprobado', // 8.9: the source report must be approved
  'solucion_perfil_no_aprobado', // 8.9: a recommended profile must be approved too
  'reporte_incomparable', // 8.7: comparability re-checked at approval
])
export type Bloqueo = typeof Bloqueo.Type
