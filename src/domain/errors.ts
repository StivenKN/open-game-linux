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
  'pedido_cerrado',
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

/** The form field that shows each rule's message. The words are in each language's dictionary (`rules`). */
export const ruleField: Record<Rule, Field> = {
  equipo_ajeno: 'diagnostic_id',
  diagnostico_no_linux: 'diagnostic_id',
  fecha_antes_del_diagnostico: 'tested_at',
  fallo_duplicado: 'failures',
  perfil_no_disponible: 'profile_id',
  solucion_sin_fallo: 'failure_type_id',
  solucion_perfil_otra_edicion: 'profile_id',
  version_capa_no_exacta: 'layer_version',
  autorrevision: 'decision',
  contenido_inmutable: 'form',
  edicion_repetida: 'editions',
  identificador_en_uso: 'editions',
  arreglo_no_exportable: 'pr',
  arreglo_datos_de_ejemplo: 'pr',
  arreglo_pr_de_otro_perfil: 'pr',
  acceso_propio: 'form',
  ultimo_administrador: 'form',
  perfil_congelado: 'form',
  dependencia_repetida: 'dependencies',
  pedido_cerrado: 'form',
}

export const Mismatch = Schema.Union([
  Schema.Struct({ aspect: Schema.Literal('edicion'), expected: EditionId, actual: EditionId }),
  Schema.Struct({ aspect: Schema.Literal('capa'), expected: LayerVersionId, actual: LayerVersionId }),
  Schema.Struct({ aspect: Schema.Literal('distribucion'), expected: DistributionId, actual: DistributionId }),
  Schema.Struct({ aspect: Schema.Literal('arquitectura'), expected: Schema.String, actual: Schema.String }),
  Schema.Struct({ aspect: Schema.Literal('version_juego'), expected: Schema.String, actual: Schema.String }),
])
export type Mismatch = typeof Mismatch.Type

/** The form field that shows each mismatch; the dictionaries word it (`mismatches`). */
export const mismatchField: Record<Mismatch['aspect'], Field> = {
  edicion: 'profile_id',
  capa: 'profile_id',
  distribucion: 'profile_id',
  arquitectura: 'profile_id',
  version_juego: 'game_version',
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

export class InvalidPayload extends Schema.TaggedError<InvalidPayload>()('PayloadInvalido', {
  reason: Schema.Literals(['ilegible', 'version_esquema', 'campo_invalido']),
  field: Schema.NullOr(Schema.String),
}) {}

/** The Steam store gave nothing usable for an App ID; the reviewer fills the form by hand. */
export class SteamUnavailable extends Schema.TaggedError<SteamUnavailable>()('SteamNoDisponible', {
  reason: Schema.Literals(['no_encontrado', 'no_es_juego', 'sin_respuesta']),
}) {}

export const DomainError = Schema.Union([RuleViolated, IncomparableProfile, InvalidTransition, ApprovalBlocked, InvalidPayload, SteamUnavailable])
export type DomainError = typeof DomainError.Type

export type Encoded<E extends DomainError> = Extract<typeof DomainError.Encoded, { readonly _tag: E['_tag'] }>

export type Reply<A, E> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: E }

export class NotFound extends Schema.TaggedError<NotFound>()('NoEncontrado', {}) {}
export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()('NoAutenticado', {}) {}
export class Forbidden extends Schema.TaggedError<Forbidden>()('SinPermiso', {}) {}
