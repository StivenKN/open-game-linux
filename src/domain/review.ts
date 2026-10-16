import { Schema } from 'effect'
import { PerfilId, ReporteId, SolucionId, Texto } from './ids.ts'

export const EstadoRevision = Schema.Literals(['pendiente', 'aprobado', 'rechazado', 'retirado'])
export type EstadoRevision = typeof EstadoRevision.Type

export const siguientes = {
  pendiente: ['aprobado', 'rechazado'],
  aprobado: ['retirado'],
  rechazado: [],
  retirado: [],
} as const satisfies Record<EstadoRevision, ReadonlyArray<EstadoRevision>>

export const estadosVigentes = ['pendiente', 'aprobado'] as const satisfies ReadonlyArray<EstadoRevision>

export const Rol = Schema.Literals(['usuario', 'revisor', 'administrador'])
export type Rol = typeof Rol.Type
export const puedeRevisar = { usuario: false, revisor: true, administrador: true } as const satisfies Record<Rol, boolean>

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

export const planificar = (
  actual: EstadoRevision,
  decision: Decision,
): 'sin_cambios' | 'aplicar' | 'transicion_invalida' => {
  const destino = destinoDe[decision._tag]
  if (actual === destino) return 'sin_cambios'
  const permitidos: ReadonlyArray<EstadoRevision> = siguientes[actual]
  return permitidos.includes(destino) ? 'aplicar' : 'transicion_invalida'
}

export const AporteRef = Schema.Union([
  Schema.TaggedStruct('perfil', { id: PerfilId }),
  Schema.TaggedStruct('reporte', { id: ReporteId }),
  Schema.TaggedStruct('solucion', { id: SolucionId }),
])
export type AporteRef = typeof AporteRef.Type

export const TipoAporte = Schema.Literals(['perfil', 'reporte', 'solucion'])
export type TipoAporte = typeof TipoAporte.Type

export const Bloqueo = Schema.Literals([
  'perfil_sin_reporte_funcional_aprobado',
  'solucion_fallo_origen_no_aprobado',
  'solucion_perfil_no_aprobado',
  'reporte_incomparable',
])
export type Bloqueo = typeof Bloqueo.Type
