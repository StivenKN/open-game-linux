// CHECKs, FKs and `RAISE ... USING CONSTRAINT = 'og_*'` all put the constraint name on the pg error,
// which arrives untyped as SqlError.reason.cause (spike Q5), so it is decoded with a Schema.
import { Effect, Option, Record, Schema } from 'effect'
import { SqlError } from 'effect/sql'
import { ReglaIncumplida, type Regla } from '../../domain/errors.ts'

export const reglaDeRestriccion = {
  reporte_fallo_pkey: 'fallo_duplicado',
  version_capa_version_exacta: 'version_capa_no_exacta',
  og_solo_revision: 'contenido_inmutable',
  edicion_juego_juego_lanzador_uq: 'edicion_repetida',
  edicion_juego_externo_uq: 'identificador_en_uso',
} as const satisfies Record<string, Regla>

const CausaPg = Schema.Struct({ constraint: Schema.String })

export const restriccionViolada = (e: SqlError.SqlError): Option.Option<string> =>
  Schema.decodeUnknownOption(CausaPg)(e.reason.cause).pipe(Option.map((c) => c.constraint))

const esMapeada = Schema.is(Schema.Literals(Record.keys(reglaDeRestriccion)))

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
