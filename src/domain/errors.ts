// Transport decision (spike Q3): a thrown TaggedError reaches the browser as `new Error("")`.
import { Schema } from 'effect'
import { DistributionId, EditionId, LayerVersionId } from './ids.ts'
import { Blocker, ReviewStatus } from './review.ts'

export const Rule = Schema.Literals([
  'equipo_ajeno',
  'diagnostico_no_linux',
  'fecha_antes_del_diagnostico',
  'fallo_duplicado',
  'perfil_no_disponible',
  'solucion_sin_fallo',
  'solucion_perfil_otra_edicion',
  'version_capa_no_exacta',
  'autorrevision',
  'contenido_inmutable',
  'edicion_repetida',
  'identificador_en_uso',
  'arreglo_no_exportable',
  'arreglo_datos_de_ejemplo',
  'arreglo_pr_de_otro_perfil',
])
export type Rule = typeof Rule.Type

export type Field =
  | 'diagnostico_id'
  | 'fecha_prueba'
  | 'perfil_id'
  | 'version_juego'
  | 'fallos'
  | 'version_capa'
  | 'tipo_fallo_id'
  | 'decision'
  | 'ediciones'
  | 'formulario'
  | 'pr'

export const rules: Record<Rule, { readonly field: Field; readonly message: string }> = {
  equipo_ajeno: { field: 'diagnostico_id', message: 'Ese diagnóstico no pertenece a uno de tus equipos.' },
  diagnostico_no_linux: { field: 'diagnostico_id', message: 'Un reporte necesita un diagnóstico hecho en Linux.' },
  fecha_antes_del_diagnostico: { field: 'fecha_prueba', message: 'La prueba no puede ser anterior al diagnóstico.' },
  fallo_duplicado: { field: 'fallos', message: 'Ese tipo de fallo ya está en el reporte; describe ambos síntomas en un solo detalle.' },
  perfil_no_disponible: { field: 'perfil_id', message: 'Ese perfil ya no está disponible para pruebas.' },
  solucion_sin_fallo: { field: 'tipo_fallo_id', message: 'Ese reporte no registra ese tipo de fallo.' },
  solucion_perfil_otra_edicion: { field: 'perfil_id', message: 'El perfil recomendado debe ser de la misma edición que el reporte.' },
  version_capa_no_exacta: { field: 'version_capa', message: 'Escribe la versión exacta, no «última».' },
  autorrevision: { field: 'decision', message: 'No puedes revisar tu propio aporte.' },
  contenido_inmutable: { field: 'formulario', message: 'El contenido revisado no se reescribe; registra un aporte nuevo.' },
  edicion_repetida: { field: 'ediciones', message: 'Un juego tiene una sola edición por lanzador.' },
  identificador_en_uso: { field: 'ediciones', message: 'Ese identificador ya pertenece a otro juego en ese lanzador.' },
  arreglo_no_exportable: { field: 'pr', message: 'Solo un perfil aprobado de un juego de Steam con AppID y Proton cuenta como arreglo upstream.' },
  arreglo_datos_de_ejemplo: { field: 'pr', message: 'Los datos de ejemplo no se registran como aportes upstream.' },
  arreglo_pr_de_otro_perfil: { field: 'pr', message: 'Ese PR ya está registrado para otro perfil.' },
}

export const Mismatch = Schema.Union([
  Schema.Struct({ aspect: Schema.Literal('edicion'), expected: EditionId, actual: EditionId }),
  Schema.Struct({ aspect: Schema.Literal('capa'), expected: LayerVersionId, actual: LayerVersionId }),
  Schema.Struct({ aspect: Schema.Literal('distribucion'), expected: DistributionId, actual: DistributionId }),
  Schema.Struct({ aspect: Schema.Literal('arquitectura'), expected: Schema.String, actual: Schema.String }),
  Schema.Struct({ aspect: Schema.Literal('version_juego'), expected: Schema.String, actual: Schema.String }),
])
export type Mismatch = typeof Mismatch.Type

export const profileMismatches: Record<
  Mismatch['aspect'],
  { readonly field: Field; readonly message: (expected: string, actual: string) => string }
> = {
  edicion: { field: 'perfil_id', message: (e, o) => `El perfil es para la edición de ${e}; elegiste la de ${o}.` },
  capa: { field: 'perfil_id', message: (e, o) => `El perfil usa ${e}; tu prueba usó ${o}.` },
  distribucion: { field: 'perfil_id', message: (e, o) => `El perfil es para ${e}; tu diagnóstico es de ${o}.` },
  arquitectura: { field: 'perfil_id', message: (e, o) => `El perfil es para ${e}; tu diagnóstico es ${o}.` },
  version_juego: { field: 'version_juego', message: (e, o) => `El perfil es para la versión ${e} del juego; probaste la ${o}.` },
}

export class RuleViolated extends Schema.TaggedError<RuleViolated>()('ReglaIncumplida', { rule: Rule }) {}

export class ApprovalBlocked extends Schema.TaggedError<ApprovalBlocked>()('AprobacionBloqueada', {
  blockers: Schema.NonEmptyArray(Blocker),
}) {}

export class IncomparableProfile extends Schema.TaggedError<IncomparableProfile>()('PerfilNoComparable', {
  mismatches: Schema.NonEmptyArray(Mismatch),
}) {}

export class InvalidTransition extends Schema.TaggedError<InvalidTransition>()('TransicionInvalida', {
  from: ReviewStatus,
  to: ReviewStatus,
}) {}

export const invalidTransitionNotice: { readonly field: Field; readonly message: string } = {
  field: 'decision',
  message: 'Este aporte ya fue revisado; registra un aporte nuevo.',
}

export class InvalidPayload extends Schema.TaggedError<InvalidPayload>()('PayloadInvalido', {
  reason: Schema.Literals(['ilegible', 'version_esquema', 'campo_invalido']),
  field: Schema.NullOr(Schema.String),
}) {}

export const DomainError = Schema.Union([RuleViolated, IncomparableProfile, InvalidTransition, ApprovalBlocked, InvalidPayload])
export type DomainError = typeof DomainError.Type

export type Encoded<E extends DomainError> = Extract<typeof DomainError.Encoded, { readonly _tag: E['_tag'] }>

export type Reply<A, E> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: E }

export class NotFound extends Schema.TaggedError<NotFound>()('NoEncontrado', {}) {}
export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()('NoAutenticado', {}) {}
export class Forbidden extends Schema.TaggedError<Forbidden>()('SinPermiso', {}) {}
