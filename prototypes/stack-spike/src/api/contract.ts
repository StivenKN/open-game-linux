import { Schema } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import { Reporte, ReporteNoEncontrado } from '#/server/domain'

// Shared contract: imported by the server route and by the browser client.
export const Api = HttpApi.make('og').add(
  HttpApiGroup.make('reportes').add(
    HttpApiEndpoint.get('obtener', '/api/reportes/:id', {
      params: { id: Schema.BigInt },
      success: Reporte,
      error: ReporteNoEncontrado.annotate({ httpApiStatus: 404 }),
    }),
  ),
)
