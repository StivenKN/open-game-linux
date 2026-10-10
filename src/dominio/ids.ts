// Branded ids and shared scalar schemas. Isomorphic: imported by server and browser.
//
// Ids are `integer GENERATED ALWAYS AS IDENTITY` (doc: "Entero"), so they decode as JS numbers.
// That keeps URLs, React keys and JSON free of the bigint traps the spike hit (gotcha 5).
// usuario.id is better-auth's text id (spike Q7), the one recorded deviation from "Entero".
import { Schema, SchemaTransformation } from 'effect'

export const JuegoId = Schema.Int.pipe(Schema.brand('JuegoId'))
export type JuegoId = typeof JuegoId.Type
export const EdicionId = Schema.Int.pipe(Schema.brand('EdicionId'))
export type EdicionId = typeof EdicionId.Type
export const LanzadorId = Schema.Int.pipe(Schema.brand('LanzadorId'))
export type LanzadorId = typeof LanzadorId.Type
export const DistribucionId = Schema.Int.pipe(Schema.brand('DistribucionId'))
export type DistribucionId = typeof DistribucionId.Type
export const VersionCapaId = Schema.Int.pipe(Schema.brand('VersionCapaId'))
export type VersionCapaId = typeof VersionCapaId.Type
export const EquipoId = Schema.Int.pipe(Schema.brand('EquipoId'))
export type EquipoId = typeof EquipoId.Type
export const DiagnosticoId = Schema.Int.pipe(Schema.brand('DiagnosticoId'))
export type DiagnosticoId = typeof DiagnosticoId.Type
export const PerfilId = Schema.Int.pipe(Schema.brand('PerfilId'))
export type PerfilId = typeof PerfilId.Type
export const ReporteId = Schema.Int.pipe(Schema.brand('ReporteId'))
export type ReporteId = typeof ReporteId.Type
export const TipoFalloId = Schema.Int.pipe(Schema.brand('TipoFalloId'))
export type TipoFalloId = typeof TipoFalloId.Type
export const SolucionId = Schema.Int.pipe(Schema.brand('SolucionId'))
export type SolucionId = typeof SolucionId.Type
export const GuiaId = Schema.Int.pipe(Schema.brand('GuiaId'))
export type GuiaId = typeof GuiaId.Type

export const UsuarioId = Schema.String.pipe(Schema.brand('UsuarioId'))
export type UsuarioId = typeof UsuarioId.Type

/** Route params arrive as text. `/juegos/abc` fails here and the route renders notFound. */
export const IdDesdeTexto = <T extends number>(s: Schema.Codec<T, number>) =>
  Schema.NumberFromString.pipe(Schema.decodeTo(s))

/**
 * 8.9 "las cadenas obligatorias no admiten texto vacío tras eliminar espacios exteriores".
 * Trims on decode, then rejects empty. The DB CHECK `nullif(btrim(x),'') IS NOT NULL` is the backstop.
 */
export const Texto = Schema.Trim.pipe(
  Schema.check(Schema.isNonEmpty({ message: 'Este campo es obligatorio.' })),
)

/** Optional text: blank input becomes null, never '' (8.8 "se usa NULL, no una fila ficticia"). */
export const TextoOpcional = Schema.NullOr(Schema.String).pipe(
  Schema.decodeTo(
    Schema.NullOr(Texto),
    SchemaTransformation.transform({
      decode: (s: string | null) => (s === null || s.trim() === '' ? null : s),
      encode: (s: string | null) => s,
    }),
  ),
)
