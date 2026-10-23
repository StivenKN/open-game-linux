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
  'acceso_propio',
  'ultimo_administrador',
  'perfil_congelado',
  'dependencia_repetida',
])
export type Rule = typeof Rule.Type

export type Field =
  | 'diagnostic_id'
  | 'tested_at'
  | 'profile_id'
  | 'game_version'
  | 'failures'
  | 'layer_version'
  | 'failure_type_id'
  | 'decision'
  | 'editions'
  | 'dependencies'
  | 'form'
  | 'pr'

export const rules: Record<Rule, { readonly field: Field; readonly message: string }> = {
  equipo_ajeno: { field: 'diagnostic_id', message: 'Ese diagnóstico no pertenece a uno de tus equipos.' },
  diagnostico_no_linux: { field: 'diagnostic_id', message: 'Un reporte necesita un diagnóstico hecho en Linux.' },
  fecha_antes_del_diagnostico: { field: 'tested_at', message: 'La prueba no puede ser anterior al diagnóstico.' },
  fallo_duplicado: { field: 'failures', message: 'Ese tipo de fallo ya está en el reporte; describe ambos síntomas en un solo detalle.' },
  perfil_no_disponible: { field: 'profile_id', message: 'Ese perfil ya no está disponible para pruebas.' },
  solucion_sin_fallo: { field: 'failure_type_id', message: 'Ese reporte no registra ese tipo de fallo.' },
  solucion_perfil_otra_edicion: { field: 'profile_id', message: 'El perfil recomendado debe ser de la misma edición que el reporte.' },
  version_capa_no_exacta: { field: 'layer_version', message: 'Escribe la versión exacta, no «última».' },
  autorrevision: { field: 'decision', message: 'No puedes revisar tu propio aporte.' },
  contenido_inmutable: { field: 'form', message: 'El contenido revisado no se reescribe; registra un aporte nuevo.' },
  edicion_repetida: { field: 'editions', message: 'Un juego tiene una sola edición por lanzador.' },
  identificador_en_uso: { field: 'editions', message: 'Ese identificador ya pertenece a otro juego en ese lanzador.' },
  arreglo_no_exportable: { field: 'pr', message: 'Solo un perfil aprobado de un juego de Steam con AppID y Proton cuenta como arreglo upstream.' },
  arreglo_datos_de_ejemplo: { field: 'pr', message: 'Los datos de ejemplo no se registran como aportes upstream.' },
  arreglo_pr_de_otro_perfil: { field: 'pr', message: 'Ese PR ya está registrado para otro perfil.' },
  acceso_propio: { field: 'form', message: 'No puedes quitarte el rol de administrador ni desactivar tu propia cuenta; pídeselo a otro administrador.' },
  ultimo_administrador: { field: 'form', message: 'Es la última cuenta de administrador activa. Da ese rol a otra cuenta antes de cambiar esta.' },
  perfil_congelado: { field: 'form', message: 'Este perfil ya se usó o se revisó, así que no cambia. Propón una versión nueva con tus cambios.' },
  dependencia_repetida: { field: 'dependencies', message: 'Esa dependencia ya está en el perfil; deja una sola fila para ella.' },
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
  edicion: { field: 'profile_id', message: (e, o) => `El perfil es para la edición de ${e}; elegiste la de ${o}.` },
  capa: { field: 'profile_id', message: (e, o) => `El perfil usa ${e}; tu prueba usó ${o}.` },
  distribucion: { field: 'profile_id', message: (e, o) => `El perfil es para ${e}; tu diagnóstico es de ${o}.` },
  arquitectura: { field: 'profile_id', message: (e, o) => `El perfil es para ${e}; tu diagnóstico es ${o}.` },
  version_juego: { field: 'game_version', message: (e, o) => `El perfil es para la versión ${e} del juego; probaste la ${o}.` },
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
