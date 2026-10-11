// Transport decision (spike Q3): a thrown TaggedError reaches the browser as `new Error("")`.
import { Schema } from 'effect'
import { DistribucionId, EdicionId, VersionCapaId } from './ids.ts'
import { Bloqueo, EstadoRevision } from './revision.ts'

export const Regla = Schema.Literals([
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
])
export type Regla = typeof Regla.Type

export type Campo =
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

export const reglas: Record<Regla, { readonly campo: Campo; readonly mensaje: string }> = {
  equipo_ajeno: { campo: 'diagnostico_id', mensaje: 'Ese diagnóstico no pertenece a uno de tus equipos.' },
  diagnostico_no_linux: { campo: 'diagnostico_id', mensaje: 'Un reporte necesita un diagnóstico hecho en Linux.' },
  fecha_antes_del_diagnostico: { campo: 'fecha_prueba', mensaje: 'La prueba no puede ser anterior al diagnóstico.' },
  fallo_duplicado: { campo: 'fallos', mensaje: 'Ese tipo de fallo ya está en el reporte; describe ambos síntomas en un solo detalle.' },
  perfil_no_disponible: { campo: 'perfil_id', mensaje: 'Ese perfil ya no está disponible para pruebas.' },
  solucion_sin_fallo: { campo: 'tipo_fallo_id', mensaje: 'Ese reporte no registra ese tipo de fallo.' },
  solucion_perfil_otra_edicion: { campo: 'perfil_id', mensaje: 'El perfil recomendado debe ser de la misma edición que el reporte.' },
  version_capa_no_exacta: { campo: 'version_capa', mensaje: 'Escribe la versión exacta, no «última».' },
  autorrevision: { campo: 'decision', mensaje: 'No puedes revisar tu propio aporte.' },
  contenido_inmutable: { campo: 'formulario', mensaje: 'El contenido revisado no se reescribe; registra un aporte nuevo.' },
  edicion_repetida: { campo: 'ediciones', mensaje: 'Un juego tiene una sola edición por lanzador.' },
  identificador_en_uso: { campo: 'ediciones', mensaje: 'Ese identificador ya pertenece a otro juego en ese lanzador.' },
}

export const Discrepancia = Schema.Union([
  Schema.Struct({ de: Schema.Literal('edicion'), esperado: EdicionId, observado: EdicionId }),
  Schema.Struct({ de: Schema.Literal('capa'), esperado: VersionCapaId, observado: VersionCapaId }),
  Schema.Struct({ de: Schema.Literal('distribucion'), esperado: DistribucionId, observado: DistribucionId }),
  Schema.Struct({ de: Schema.Literal('arquitectura'), esperado: Schema.String, observado: Schema.String }),
  Schema.Struct({ de: Schema.Literal('version_juego'), esperado: Schema.String, observado: Schema.String }),
])
export type Discrepancia = typeof Discrepancia.Type

export const discrepanciasPerfil: Record<
  Discrepancia['de'],
  { readonly campo: Campo; readonly mensaje: (esperado: string, observado: string) => string }
> = {
  edicion: { campo: 'perfil_id', mensaje: (e, o) => `El perfil es para la edición de ${e}; elegiste la de ${o}.` },
  capa: { campo: 'perfil_id', mensaje: (e, o) => `El perfil usa ${e}; tu prueba usó ${o}.` },
  distribucion: { campo: 'perfil_id', mensaje: (e, o) => `El perfil es para ${e}; tu diagnóstico es de ${o}.` },
  arquitectura: { campo: 'perfil_id', mensaje: (e, o) => `El perfil es para ${e}; tu diagnóstico es ${o}.` },
  version_juego: { campo: 'version_juego', mensaje: (e, o) => `El perfil es para la versión ${e} del juego; probaste la ${o}.` },
}

export class ReglaIncumplida extends Schema.TaggedError<ReglaIncumplida>()('ReglaIncumplida', { regla: Regla }) {}

export class AprobacionBloqueada extends Schema.TaggedError<AprobacionBloqueada>()('AprobacionBloqueada', {
  bloqueos: Schema.NonEmptyArray(Bloqueo),
}) {}

export class PerfilNoComparable extends Schema.TaggedError<PerfilNoComparable>()('PerfilNoComparable', {
  discrepancias: Schema.NonEmptyArray(Discrepancia),
}) {}

export class TransicionInvalida extends Schema.TaggedError<TransicionInvalida>()('TransicionInvalida', {
  de: EstadoRevision,
  a: EstadoRevision,
}) {}

export const avisoTransicionInvalida: { readonly campo: Campo; readonly mensaje: string } = {
  campo: 'decision',
  mensaje: 'Este aporte ya fue revisado; registra un aporte nuevo.',
}

export class PayloadInvalido extends Schema.TaggedError<PayloadInvalido>()('PayloadInvalido', {
  motivo: Schema.Literals(['ilegible', 'version_esquema', 'campo_invalido']),
  campo: Schema.NullOr(Schema.String),
}) {}

export const FalloDominio = Schema.Union([ReglaIncumplida, PerfilNoComparable, TransicionInvalida, AprobacionBloqueada, PayloadInvalido])
export type FalloDominio = typeof FalloDominio.Type

export type Codificado<E extends FalloDominio> = Extract<typeof FalloDominio.Encoded, { readonly _tag: E['_tag'] }>

export type Respuesta<A, E> = { readonly ok: true; readonly valor: A } | { readonly ok: false; readonly fallo: E }

export class NoEncontrado extends Schema.TaggedError<NoEncontrado>()('NoEncontrado', {}) {}
export class NoAutenticado extends Schema.TaggedError<NoAutenticado>()('NoAutenticado', {}) {}
export class SinPermiso extends Schema.TaggedError<SinPermiso>()('SinPermiso', {}) {}
