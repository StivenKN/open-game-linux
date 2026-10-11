import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Effect } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { HttpApiClient } from 'effect/http-api'
import { Api } from '#/api/contract'

export const Route = createFileRoute('/api-probe')({ component: ApiProbe })

const show = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x))

const call = (id: bigint) =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(Api, { baseUrl: window.location.origin })
    return yield* client.reportes.obtener({ params: { id } })
  }).pipe(
    Effect.match({
      onSuccess: (r) => `ok ${show(r)}`,
      onFailure: (e) => `fail ${e._tag} ${e.constructor.name} ${show(e)}`,
    }),
    Effect.provide(FetchHttpClient.layer),
    Effect.runPromise,
  )

function ApiProbe() {
  const [out, setOut] = useState<Array<string>>([])
  useEffect(() => {
    Promise.all([call(1n), call(99n)]).then(setOut)
  }, [])
  return <pre id="out">{out.join('\n')}</pre>
}
