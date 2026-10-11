import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { obtenerReporteFn, obtenerReporteResultFn } from '#/server/fns'
import { ReporteNoEncontrado } from '#/server/domain'

// Client-only probe: what does a browser caller receive from a failing server fn?
export const Route = createFileRoute('/probe')({ component: Probe })

const show = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x))

function Probe() {
  const [out, setOut] = useState<Array<string>>([])
  useEffect(() => {
    const log = (s: string) => setOut((o) => [...o, s])
    obtenerReporteFn({ data: { id: '99' } }).catch((error: unknown) => {
      const e = error as Error & { _tag?: string }
      log(`throw: ${show({ ctor: e.constructor.name, instanceofDomain: e instanceof ReporteNoEncontrado, tag: e._tag ?? null, message: e.message, own: Object.getOwnPropertyNames(e) })}`)
    })
    obtenerReporteResultFn({ data: { id: '99' } }).then((r) => log(`result: ${show(r)}`))
    obtenerReporteResultFn({ data: { id: '1' } }).then((r) => log(`ok: ${show(r)} idType=${r.ok ? typeof r.value.id : '-'}`))
    obtenerReporteFn({ data: { id: 'abc' } }).catch((e: Error) => log(`validator: ${e.constructor.name} ${e.message.slice(0, 300)}`))
  }, [])
  return <pre id="out">{out.join('\n')}</pre>
}
