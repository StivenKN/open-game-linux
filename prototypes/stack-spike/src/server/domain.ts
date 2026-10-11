import { Schema } from 'effect'

// bigserial (int8) arrives from @effect/sql-pg as a JS bigint (observed), so the brand sits on BigInt.
export const ReporteId = Schema.BigInt.pipe(Schema.brand('ReporteId'))
export type ReporteId = typeof ReporteId.Type

export const EstadoRevision = Schema.Literals(['pendiente', 'aprobado', 'rechazado'])
export type EstadoRevision = typeof EstadoRevision.Type

export const Reporte = Schema.Struct({
  id: ReporteId,
  titulo: Schema.String,
  estado_revision: EstadoRevision,
  evidencia_revision: Schema.NullOr(Schema.String),
})
export type Reporte = typeof Reporte.Type

export class ReporteNoEncontrado extends Schema.TaggedError<ReporteNoEncontrado>()(
  'ReporteNoEncontrado',
  { id: Schema.BigInt },
) {}

export class ReglaRevisionViolada extends Schema.TaggedError<ReglaRevisionViolada>()(
  'ReglaRevisionViolada',
  {
    regla: Schema.Literals(['reporte_bloque_revision', 'og_solo_revision']),
    mensaje: Schema.String,
  },
) {}

// Mirrors the reporte_bloque_revision CHECK so the UI can reject before the DB does.
export const bloqueRevisionValido = (estado: EstadoRevision, evidencia: string | null) =>
  estado !== 'aprobado' || (evidencia ?? '').trim() !== ''
