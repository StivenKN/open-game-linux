// Domain failures and how they cross the server-fn wire. Isomorphic.
//
// Transport decision (spike Q3): a thrown TaggedError reaches the browser as `new Error("")`.
// We do NOT register serialization adapters. Action server fns (servidor/ejecutar.ts `accion`) RETURN `Respuesta<A, E>`, where E is
// the Schema-encoded failure (a plain `{ _tag, ... }` object seroval carries intact). The browser's
// type for a write is therefore `Respuesta<A, E>`, and a component cannot read `valor` without
// narrowing `ok` first: the compiler checks that every form handles its failures.
// Not-found / unauthenticated / forbidden are router control flow (notFound(), redirect()), not data.
import { Schema } from 'effect'
import { Bloqueo } from './revision.ts'

/** Every app-side 8.7/8.9 rule plus DB constraints a user action can trip. Round 1 graft: rule enum, not free text. */
export const Regla = Schema.Literals([
  'equipo_ajeno',
  'diagnostico_no_linux',
  'fecha_antes_del_diagnostico',
  'perfil_otra_edicion',
  'perfil_otra_capa',
  'perfil_otra_distribucion',
  'perfil_otra_arquitectura',
  'perfil_otra_version_juego',
  'fallo_duplicado', // DB home: PK reporte_fallo_pkey (8.11 "el esquema debe rechazar fallos duplicados")
  'solucion_perfil_otra_edicion',
  'version_capa_no_exacta', // DB home: CHECK version_capa_version_exacta, reachable through VersionCapaRef nueva
  'autorrevision',
  'transicion_invalida',
  'contenido_inmutable', // DB home: trigger og_solo_revision; unreachable from the UI, mapped for completeness
])
export type Regla = typeof Regla.Type

/** Form field a rule attaches to. Every form names its inputs after its input schema's Encoded keys. */
export type Campo = 'diagnostico_id' | 'fecha_prueba' | 'perfil_id' | 'version_juego' | 'fallos' | 'version_capa' | 'decision' | 'formulario'

/** One row per rule: the field it lands on and its Spanish message. `Record<Regla, …>` fails the build on a gap. */
export const reglas: Record<Regla, { readonly campo: Campo; readonly mensaje: string }> = {
  equipo_ajeno: { campo: 'diagnostico_id', mensaje: 'Ese diagnóstico no pertenece a uno de tus equipos.' },
  diagnostico_no_linux: { campo: 'diagnostico_id', mensaje: 'Un reporte necesita un diagnóstico hecho en Linux.' },
  fecha_antes_del_diagnostico: { campo: 'fecha_prueba', mensaje: 'La prueba no puede ser anterior al diagnóstico.' },
  perfil_otra_edicion: { campo: 'perfil_id', mensaje: 'El perfil es de otra edición del juego.' },
  perfil_otra_capa: { campo: 'perfil_id', mensaje: 'El perfil usa otra versión de Wine o Proton.' },
  perfil_otra_distribucion: { campo: 'perfil_id', mensaje: 'El perfil es para otra distribución que la de tu diagnóstico.' },
  perfil_otra_arquitectura: { campo: 'perfil_id', mensaje: 'El perfil es para otra arquitectura.' },
  perfil_otra_version_juego: { campo: 'version_juego', mensaje: 'El perfil limita la versión del juego y la prueba no la respeta.' },
  fallo_duplicado: { campo: 'fallos', mensaje: 'Ese tipo de fallo ya está en el reporte; describe ambos síntomas en un solo detalle.' },
  solucion_perfil_otra_edicion: { campo: 'perfil_id', mensaje: 'El perfil recomendado debe ser de la misma edición que el reporte.' },
  version_capa_no_exacta: { campo: 'version_capa', mensaje: 'Escribe la versión exacta, no «última».' },
  autorrevision: { campo: 'decision', mensaje: 'No puedes revisar tu propio aporte.' },
  transicion_invalida: { campo: 'decision', mensaje: 'Este aporte ya fue revisado; registra un aporte nuevo.' },
  contenido_inmutable: { campo: 'formulario', mensaje: 'El contenido revisado no se reescribe; registra un aporte nuevo.' },
}

export class ReglaIncumplida extends Schema.TaggedError<ReglaIncumplida>()('ReglaIncumplida', { regla: Regla }) {}

export class AprobacionBloqueada extends Schema.TaggedError<AprobacionBloqueada>()('AprobacionBloqueada', {
  bloqueos: Schema.NonEmptyArray(Bloqueo),
}) {}

/** The detector payload or pasted text did not parse. Only servidor/diagnostico/payload.ts raises it. */
export class PayloadInvalido extends Schema.TaggedError<PayloadInvalido>()('PayloadInvalido', {
  motivo: Schema.Literals(['ilegible', 'version_esquema', 'campo_invalido']),
  campo: Schema.NullOr(Schema.String),
}) {}

/** The closed set of failures a write may return as data. Adding a class here is the only registration step. */
export const FalloDominio = Schema.Union([ReglaIncumplida, AprobacionBloqueada, PayloadInvalido])
export type FalloDominio = typeof FalloDominio.Type

/** The encoded (wire) form of the subset E of FalloDominio a given write can fail with. */
export type Codificado<E extends FalloDominio> = Extract<typeof FalloDominio.Encoded, { readonly _tag: E['_tag'] }>

/** What every write server fn returns. */
export type Respuesta<A, E> = { readonly ok: true; readonly valor: A } | { readonly ok: false; readonly fallo: E }

// Router control flow. Raised inside programs, turned into notFound()/redirect() by servidor/ejecutar.ts.
export class NoEncontrado extends Schema.TaggedError<NoEncontrado>()('NoEncontrado', {}) {}
export class NoAutenticado extends Schema.TaggedError<NoAutenticado>()('NoAutenticado', {}) {}
export class SinPermiso extends Schema.TaggedError<SinPermiso>()('SinPermiso', {}) {}
