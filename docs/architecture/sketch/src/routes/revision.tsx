// RF-10 review queue. Blockers are rendered from the same function decidir runs.
import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { Schema } from 'effect'
import { reglas } from '../dominio/fallos.ts'
import { AporteRef, Decision } from '../dominio/revision.ts'
import { colaFn, decidirFn } from '../fns/revision.ts'
import { useAccion, type Errores } from '../ui/useAccion.ts'
import { bloqueo } from '../ui/vocabulario.ts'

const Tipo = Schema.Struct({ tipo: Schema.Literals(['perfil', 'reporte', 'solucion']) })

export const Route = createFileRoute('/revision')({
  validateSearch: Schema.toStandardSchemaV1(Tipo),
  beforeLoad: ({ context }) => {
    if (!context.visitante || context.visitante.rol === 'usuario') throw notFound()
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => colaFn({ data: deps }),
  component: Cola,
})

const FormDecision = Schema.Struct({ ref: AporteRef, decision: Decision })

/** Inferred from the server fn: no hand-written page type. */
type Elemento = Awaited<ReturnType<typeof colaFn>>[number]

function Cola() {
  const elementos = Route.useLoaderData()
  return (
    <main>
      {elementos.map((e) => (
        <ElementoCola key={`${e.ref._tag}-${e.ref.id}`} elemento={e} />
      ))}
    </main>
  )
}

function ElementoCola({ elemento }: { elemento: Elemento }) {
  const router = useRouter()
  const r = useAccion(FormDecision, decidirFn, {
    // Exhaustive over what decidir can return; adding a failure to decidir breaks this switch.
    alFallar: (f): Errores => {
      switch (f._tag) {
        case 'ReglaIncumplida':
          return { decision: reglas[f.regla].mensaje }
        case 'AprobacionBloqueada':
          return { decision: f.bloqueos.map((b) => bloqueo[b]).join(' ') }
      }
    },
    alCompletar: () => router.invalidate(),
  })
  return (
    <form action={r.enviar}>
      <h3>{elemento.titulo}</h3>
      <input type="hidden" name="ref[_tag]" value={elemento.ref._tag} />
      <input type="hidden" name="ref[id]" value={elemento.ref.id} />
      <textarea name="decision[motivo]" />
      <textarea name="decision[evidencia]" placeholder="Referencia verificable: reporte, captura, log" />
      {elemento.bloqueos.map((b) => (
        <p key={b}>{bloqueo[b]}</p>
      ))}
      <button name="decision[_tag]" value="Aprobar" disabled={elemento.es_propio || elemento.bloqueos.length > 0 || r.enviando}>Aprobar</button>
      <button name="decision[_tag]" value="Rechazar" disabled={elemento.es_propio || r.enviando}>Rechazar</button>
      {r.errores.decision && <p role="alert">{r.errores.decision}</p>}
    </form>
  )
}
