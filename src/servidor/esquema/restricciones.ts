// DB rules a user action can trip, mapped back to the domain Regla so they land on a form field.
// CHECKs, FKs and `RAISE ... USING CONSTRAINT = 'og_*'` all put the constraint name on the pg error,
// which arrives untyped as SqlError.reason.cause (spike Q5), so it is decoded with a Schema.
//
// tests/esquema.test.ts asserts every key here exists in the migrated DB, so a renamed constraint fails.
import { Effect, Option, Record, Schema } from 'effect'
import { SqlError } from 'effect/sql'
import { ReglaIncumplida, type Regla } from '../../dominio/fallos.ts'

export const reglaDeRestriccion = {
  reporte_fallo_pkey: 'fallo_duplicado',
  version_capa_version_exacta: 'version_capa_no_exacta',
  // reporte_perfil_fk is absent on purpose: discrepancias() rejects first with PerfilNoComparable, so a hit is a writer bug.
  og_solo_revision: 'contenido_inmutable',
} as const satisfies Record<string, Regla>

const CausaPg = Schema.Struct({ constraint: Schema.String })

/** The constraint a statement violated, or none when it failed for another reason. */
export const restriccionViolada = (e: SqlError.SqlError): Option.Option<string> =>
  Schema.decodeUnknownOption(CausaPg)(e.reason.cause).pipe(Option.map((c) => c.constraint))

const esMapeada = Schema.is(Schema.Literals(Record.keys(reglaDeRestriccion)))

/**
 * Wraps a write statement: a mapped constraint violation becomes ReglaIncumplida (data for the form);
 * any other SqlError stays an infra failure. Applied by servidor/aportes, never by readers.
 */
export const conReglasDeBd = <A, E, R>(
  efecto: Effect.Effect<A, E | SqlError.SqlError, R>,
): Effect.Effect<A, E | SqlError.SqlError | ReglaIncumplida, R> =>
  Effect.mapError(efecto, (e) =>
    SqlError.isSqlError(e)
      ? Option.match(restriccionViolada(e).pipe(Option.filter(esMapeada)), {
          onNone: () => e,
          onSome: (r) => new ReglaIncumplida({ regla: reglaDeRestriccion[r] }),
        })
      : e,
  )
