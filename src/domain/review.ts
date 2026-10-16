import { Schema } from 'effect'
import { ProfileId, ReportId, SolutionId, RequiredText } from './ids.ts'

export const ReviewStatus = Schema.Literals(['pendiente', 'aprobado', 'rechazado', 'retirado'])
export type ReviewStatus = typeof ReviewStatus.Type

export const nextStatuses = {
  pendiente: ['aprobado', 'rechazado'],
  aprobado: ['retirado'],
  rechazado: [],
  retirado: [],
} as const satisfies Record<ReviewStatus, ReadonlyArray<ReviewStatus>>

export const activeStatuses = ['pendiente', 'aprobado'] as const satisfies ReadonlyArray<ReviewStatus>

export const Role = Schema.Literals(['usuario', 'revisor', 'administrador'])
export type Role = typeof Role.Type
export const canReview = { usuario: false, revisor: true, administrador: true } as const satisfies Record<Role, boolean>

export const Decision = Schema.Union([
  Schema.TaggedStruct('Aprobar', { motivo: RequiredText, evidencia: RequiredText }),
  Schema.TaggedStruct('Rechazar', { motivo: RequiredText }),
  Schema.TaggedStruct('Retirar', { motivo: RequiredText }),
])
export type Decision = typeof Decision.Type

export const targetOf = {
  Aprobar: 'aprobado',
  Rechazar: 'rechazado',
  Retirar: 'retirado',
} as const satisfies Record<Decision['_tag'], ReviewStatus>

export const planTransition = (
  current: ReviewStatus,
  decision: Decision,
): 'sin_cambios' | 'aplicar' | 'transicion_invalida' => {
  const target = targetOf[decision._tag]
  if (current === target) return 'sin_cambios'
  const allowed: ReadonlyArray<ReviewStatus> = nextStatuses[current]
  return allowed.includes(target) ? 'aplicar' : 'transicion_invalida'
}

export const ContributionRef = Schema.Union([
  Schema.TaggedStruct('perfil', { id: ProfileId }),
  Schema.TaggedStruct('reporte', { id: ReportId }),
  Schema.TaggedStruct('solucion', { id: SolutionId }),
])
export type ContributionRef = typeof ContributionRef.Type

export const ContributionType = Schema.Literals(['perfil', 'reporte', 'solucion'])
export type ContributionType = typeof ContributionType.Type

export const Blocker = Schema.Literals([
  'perfil_sin_reporte_funcional_aprobado',
  'solucion_fallo_origen_no_aprobado',
  'solucion_perfil_no_aprobado',
  'reporte_incomparable',
])
export type Blocker = typeof Blocker.Type
