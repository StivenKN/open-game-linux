// usuario.id is better-auth's text id (spike Q7), the one recorded deviation from integer ids.
import { Effect, Schema, SchemaTransformation } from 'effect'

export const GameId = Schema.Int.pipe(Schema.brand('JuegoId'))
export type GameId = typeof GameId.Type
export const EditionId = Schema.Int.pipe(Schema.brand('EdicionId'))
export type EditionId = typeof EditionId.Type
export const LauncherId = Schema.Int.pipe(Schema.brand('LanzadorId'))
export type LauncherId = typeof LauncherId.Type
export const DistributionId = Schema.Int.pipe(Schema.brand('DistribucionId'))
export type DistributionId = typeof DistributionId.Type
export const LayerVersionId = Schema.Int.pipe(Schema.brand('VersionCapaId'))
export type LayerVersionId = typeof LayerVersionId.Type
export const MachineId = Schema.Int.pipe(Schema.brand('EquipoId'))
export type MachineId = typeof MachineId.Type
export const DiagnosticId = Schema.Int.pipe(Schema.brand('DiagnosticoId'))
export type DiagnosticId = typeof DiagnosticId.Type
export const ProfileId = Schema.Int.pipe(Schema.brand('PerfilId'))
export type ProfileId = typeof ProfileId.Type
export const ReportId = Schema.Int.pipe(Schema.brand('ReporteId'))
export type ReportId = typeof ReportId.Type
export const FailureTypeId = Schema.Int.pipe(Schema.brand('TipoFalloId'))
export type FailureTypeId = typeof FailureTypeId.Type
export const SolutionId = Schema.Int.pipe(Schema.brand('SolucionId'))
export type SolutionId = typeof SolutionId.Type
export const DependencyId = Schema.Int.pipe(Schema.brand('DependenciaId'))
export type DependencyId = typeof DependencyId.Type
export const GuideId = Schema.Int.pipe(Schema.brand('GuiaId'))
export type GuideId = typeof GuideId.Type

export const UserId = Schema.String.pipe(Schema.brand('UsuarioId'))
export type UserId = typeof UserId.Type

export const RequiredText = Schema.Trim.pipe(
  Schema.check(Schema.isNonEmpty({ message: 'Este campo es obligatorio.' })),
)

export const OptionalTextOf = <S extends Schema.Codec<string, string>>(schema: S) =>
  Schema.NullOr(Schema.String).pipe(
    Schema.decodeTo(
      Schema.NullOr(schema),
      SchemaTransformation.transform({
        decode: (s: string | null) => (s === null || s.trim() === '' ? null : s),
        encode: (s: string | null) => s,
      }),
    ),
  )

export const OptionalText = OptionalTextOf(RequiredText)

export const OptionalNumber = <S extends Schema.Codec<number, number>>(schema: S) =>
  Schema.String.pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.NumberFromString.pipe(Schema.decodeTo(schema))),
      SchemaTransformation.transform({
        decode: (s: string) => (s.trim() === '' ? null : s.trim()),
        encode: (s: string | null) => s ?? '',
      }),
    ),
  )

/** A checkbox: render it with value="true"; an unchecked box posts no key, which decodes as false. */
export const Checkbox = Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false)))
