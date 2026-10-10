import { Effect, Layer } from 'effect'
import { HttpRouter, HttpServer } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { SqlClient } from 'effect/sql'
import { PgLive, runtime } from '#/server/db'
import { obtenerReporte } from '#/server/reportes'
import { Api } from './contract.ts'

// Building the group as an Effect captures SqlClient once at layer build, so handlers need nothing per request.
const ReportesLive = HttpApiBuilder.group(Api, 'reportes', (handlers) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return handlers.handle('obtener', ({ params }) =>
      obtenerReporte(params.id).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
      ),
    )
  }),
)

const ApiLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(ReportesLive),
  Layer.provide([PgLive, HttpServer.layerServices]),
)

// Web-standard (Request) => Promise<Response>. Sharing the runtime memoMap reuses the same PgLive pool.
export const { handler: apiHandler } = HttpRouter.toWebHandler(ApiLive, { memoMap: runtime.memoMap })
