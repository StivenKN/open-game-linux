// Domain failures and how they cross the server-fn wire. Isomorphic.
//
// Transport decision (spike Q3): a thrown TaggedError reaches the browser as `new Error("")`.
// We do NOT register serialization adapters. Action server fns (servidor/ejecutar.ts `accion`) RETURN `Respuesta<A, E>`, where E is
// the Schema-encoded failure (a plain `{ _tag, ... }` object seroval carries intact). The browser's
// type for a write is therefore `Respuesta<A, E>`, and a component cannot read `valor` without
// narrowing `ok` first: the compiler checks that every form handles its failures.
// Not-found / unauthenticated / forbidden are router control flow (notFound(), redirect()), not data.
import { Schema } from 'effect'
import { DistribucionId, EdicionId, VersionCapaId } from './ids.ts'
import { Bloqueo, EstadoRevision } from './revision.ts'

/** Every app-side 8.7/8.9 rule plus DB constraints a user action can trip. Round 1 graft: rule enum, not free text. */
export const Regla = Schema.Literals([
  'equipo_ajeno',
  'diagnostico_no_linux',
  'fecha_antes_del_diagnostico',
  'fallo_duplicado', // DB home: PK reporte_fallo_pkey (8.11 "el esquema debe rechazar fallos duplicados")
  'perfil_no_disponible', // the profile does not exist, or was rejected or retired: nobody tests it any more
  'solucion_sin_fallo', // the report is not public, or has no fallo of that tipo (DB backstop: solucion_fallo_fk)
  'solucion_perfil_otra_edicion',
  'version_capa_no_exacta', // DB home: CHECK version_capa_version_exacta, reachable through VersionCapaRef nueva
  'autorrevision', // home: decidir, for all three reviewable tables
  'contenido_inmutable', // DB home: trigger og_solo_revision; unreachable from the UI, mapped for completeness
  'edicion_repetida', // DB home: UQ edicion_juego_juego_lanzador_uq
  'identificador_en_uso', // DB home: UQ edicion_juego_externo_uq
])
export type Regla = typeof Regla.Type

/** Form field a rule attaches to. Every form names its inputs after its input schema's Encoded keys. */
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

/** One row per rule: the field it lands on and its Spanish message. `Record<Regla, …>` fails the build on a gap. */
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

/**
 * 8.7 comparability, structured so the message can name both sides ("perfil para x86_64, tu
 * diagnóstico es aarch64") without parsing a sentence. `esperado` is the profile's, `observado` the test's.
 */
export const Discrepancia = Schema.Union([
  Schema.Struct({ de: Schema.Literal('edicion'), esperado: EdicionId, observado: EdicionId }),
  Schema.Struct({ de: Schema.Literal('capa'), esperado: VersionCapaId, observado: VersionCapaId }),
  Schema.Struct({ de: Schema.Literal('distribucion'), esperado: DistribucionId, observado: DistribucionId }),
  Schema.Struct({ de: Schema.Literal('arquitectura'), esperado: Schema.String, observado: Schema.String }),
  Schema.Struct({ de: Schema.Literal('version_juego'), esperado: Schema.String, observado: Schema.String }),
])
export type Discrepancia = typeof Discrepancia.Type

/**
 * The field and message for each kind of discrepancy, like `reglas` for PerfilNoComparable. The caller
 * passes display names for both sides (an edition, layer or distro id means nothing to a person).
 */
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

/** A decision whose target state `siguientes` does not allow from the current one. */
export class TransicionInvalida extends Schema.TaggedError<TransicionInvalida>()('TransicionInvalida', {
  de: EstadoRevision,
  a: EstadoRevision,
}) {}

export const avisoTransicionInvalida: { readonly campo: Campo; readonly mensaje: string } = {
  campo: 'decision',
  mensaje: 'Este aporte ya fue revisado; registra un aporte nuevo.',
}

/** The detector payload or pasted text did not parse. Only servidor/diagnostico/payload.ts raises it. */
export class PayloadInvalido extends Schema.TaggedError<PayloadInvalido>()('PayloadInvalido', {
  motivo: Schema.Literals(['ilegible', 'version_esquema', 'campo_invalido']),
  campo: Schema.NullOr(Schema.String),
}) {}

/** The closed set of failures a write may return as data. Adding a class here is the only registration step. */
export const FalloDominio = Schema.Union([ReglaIncumplida, PerfilNoComparable, TransicionInvalida, AprobacionBloqueada, PayloadInvalido])
export type FalloDominio = typeof FalloDominio.Type

/** The encoded (wire) form of the subset E of FalloDominio a given write can fail with. */
export type Codificado<E extends FalloDominio> = Extract<typeof FalloDominio.Encoded, { readonly _tag: E['_tag'] }>

/** What every write server fn returns. */
export type Respuesta<A, E> = { readonly ok: true; readonly valor: A } | { readonly ok: false; readonly fallo: E }

// Router control flow. Raised inside programs, turned into notFound()/redirect() by servidor/ejecutar.ts.
export class NoEncontrado extends Schema.TaggedError<NoEncontrado>()('NoEncontrado', {}) {}
export class NoAutenticado extends Schema.TaggedError<NoAutenticado>()('NoAutenticado', {}) {}
export class SinPermiso extends Schema.TaggedError<SinPermiso>()('SinPermiso', {}) {}
