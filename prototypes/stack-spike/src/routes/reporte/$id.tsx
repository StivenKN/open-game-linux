import { createFileRoute } from '@tanstack/react-router'
import { obtenerReporteFn, obtenerReporteResultFn } from '#/server/fns'
import { ReporteNoEncontrado } from '#/server/domain'

export const Route = createFileRoute('/reporte/$id')({
  loader: async ({ params }) => {
    const result = await obtenerReporteResultFn({ data: { id: params.id } })
    const reporte = await obtenerReporteFn({ data: { id: params.id } })
    return { reporte, result }
  },
  component: () => <pre>{JSON.stringify(Route.useLoaderData(), (_, v) => (typeof v === 'bigint' ? `${v}n` : v))}</pre>,
  errorComponent: (props) => <ErrorProbe error={props.error as Error} />,
})

function ErrorProbe({ error }: { error: Error }) {
  return (
    <pre id="err">
      {JSON.stringify({
        ctor: error?.constructor?.name,
        instanceofDomain: error instanceof ReporteNoEncontrado,
        instanceofError: error instanceof Error,
        tag: (error as { _tag?: string })._tag ?? null,
        message: error.message,
        keys: Object.keys(error),
      })}
    </pre>
  )
}
