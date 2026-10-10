import { createServerFn } from '@tanstack/react-start'
import { Exit, Schema } from 'effect'
import { runtime } from './db.ts'
import { ReporteNoEncontrado } from './domain.ts'
import { listarReportes, obtenerReporte } from './reportes.ts'

const PorId = Schema.toStandardSchemaV1(Schema.Struct({ id: Schema.BigIntFromString }))

export const listarReportesFn = createServerFn({ method: 'GET' }).handler(() =>
  runtime.runPromise(listarReportes),
)

// Variant A: throw. Whatever runPromise rejects with is what Start serializes.
export const obtenerReporteFn = createServerFn({ method: 'GET' })
  .validator(PorId)
  .handler(({ data }) => runtime.runPromise(obtenerReporte(data.id)))

// Variant B: return a serializable Result-shaped union instead of throwing.
const Fallo = Schema.Union([ReporteNoEncontrado])
export const obtenerReporteResultFn = createServerFn({ method: 'GET' })
  .validator(PorId)
  .handler(async ({ data }) => {
    const exit = await runtime.runPromiseExit(obtenerReporte(data.id))
    if (Exit.isSuccess(exit)) return { ok: true as const, value: exit.value }
    const error = Exit.findErrorOption(exit)
    // Infra failures (SqlError, SchemaError) and defects stay thrown; only domain errors become data.
    if (error._tag === 'None' || error.value._tag !== 'ReporteNoEncontrado') throw Exit.isFailure(exit) ? exit.cause : null
    return { ok: false as const, error: Schema.encodeSync(Fallo)(error.value) }
  })

