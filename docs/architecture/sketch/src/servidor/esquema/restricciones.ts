// DB rules a user action can trip, mapped back to the domain Regla so they land on a form field.
// Spike Q5: CHECKs, FKs and `RAISE ... USING CONSTRAINT = '<name>'` all surface the constraint name
// on SqlError.reason.cause (untyped). We decode that cause with a Schema instead of casting (gotcha 8).
//
// Drift guard: tests/esquema.test.ts asserts every key here exists in pg_constraint or is a trigger
// CONSTRAINT name raised by a function in migraciones.ts. A renamed constraint fails the build.
import { Effect, Option, Schema } from 'effect'
import { SqlError } from 'effect/sql'
import { ReglaIncumplida, type Regla } from '../../dominio/fallos.ts'

export const reglaDeRestriccion = {
  reporte_fallo_pkey: 'fallo_duplicado',
  version_capa_version_exacta: 'version_capa_no_exacta',
  reporte_perfil_fk: 'perfil_otra_edicion', // backstop of discrepancias(); unreachable when the app check runs first
  og_solo_revision: 'contenido_inmutable',
  perfil_configuracion_sin_autoaprobacion: 'autorrevision',
  solucion_sin_autoaprobacion: 'autorrevision',
} as const satisfies Record<string, Regla>

const CausaPg = Schema.Struct({ constraint: Schema.optionalKey(Schema.String) })

const restriccionDe = (e: SqlError.SqlError): Option.Option<keyof typeof reglaDeRestriccion> => {
  void e
  void CausaPg
  // decodeUnknownOption(CausaPg)(e.reason.cause) -> constraint -> key in reglaDeRestriccion
  throw new Error('not implemented')
}

/**
 * Wraps a write statement: a mapped constraint violation becomes ReglaIncumplida (data for the form);
 * any other SqlError stays an infra failure. Applied by servidor/aportes, never by readers.
 */
export const conReglasDeBd = <A, E, R>(
  efecto: Effect.Effect<A, E | SqlError.SqlError, R>,
): Effect.Effect<A, E | SqlError.SqlError | ReglaIncumplida, R> =>
  Effect.mapError(efecto, (e) =>
    SqlError.isSqlError(e)
      ? Option.match(restriccionDe(e), {
          onNone: () => e,
          onSome: (r) => new ReglaIncumplida({ regla: reglaDeRestriccion[r] }),
        })
      : e,
  )
