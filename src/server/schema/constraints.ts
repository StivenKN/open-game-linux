// CHECKs, FKs and `RAISE ... USING CONSTRAINT = 'og_*'` all put the constraint name on the pg error,
// which arrives untyped as SqlError.reason.cause (spike Q5), so it is decoded with a Schema.
import { Effect, Option, Record, Schema } from 'effect'
import { SqlError } from 'effect/sql'
import { RuleViolated, type Rule } from '../../domain/errors.ts'

export const ruleByConstraint = {
  report_failure_pkey: 'fallo_duplicado',
  layer_version_exact_version: 'version_capa_no_exacta',
  og_review_only: 'contenido_inmutable',
  game_edition_game_launcher_uq: 'edicion_repetida',
  game_edition_external_uq: 'identificador_en_uso',
  og_profile_frozen: 'perfil_congelado',
  profile_dependency_pkey: 'dependencia_repetida',
} as const satisfies Record<string, Rule>

const PgCause = Schema.Struct({ constraint: Schema.String })

export const violatedConstraint = (e: SqlError.SqlError): Option.Option<string> =>
  Schema.decodeUnknownOption(PgCause)(e.reason.cause).pipe(Option.map((c) => c.constraint))

const isMapped = Schema.is(Schema.Literals(Record.keys(ruleByConstraint)))

export const withDbRules = <A, E, R>(
  effect: Effect.Effect<A, E | SqlError.SqlError, R>,
): Effect.Effect<A, E | SqlError.SqlError | RuleViolated, R> =>
  Effect.mapError(effect, (e) =>
    SqlError.isSqlError(e)
      ? Option.match(violatedConstraint(e).pipe(Option.filter(isMapped)), {
          onNone: () => e,
          onSome: (r) => new RuleViolated({ rule: ruleByConstraint[r] }),
        })
      : e,
  )
