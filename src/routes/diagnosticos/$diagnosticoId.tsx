// A saved capture with its matrix. Owner only (8.9 "el diagnóstico detallado es privado"): anyone else,
// and any id that is not a number, gets notFound; a guest is sent to sign in and back.
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { DiagnosticoId } from '../../dominio/ids.ts'
import { miDiagnosticoFn } from '../../fns/diagnostico.ts'
import { MatrizDiagnostico } from '../../ui/diagnostico/MatrizDiagnostico.tsx'
import { ResumenCaptura } from '../../ui/diagnostico/ResumenCaptura.tsx'
import { idDeRuta } from '../-ids.ts'
import { volverAqui } from '../-volver.ts'

const diagnosticoId = idDeRuta(DiagnosticoId)

export const Route = createFileRoute('/diagnosticos/$diagnosticoId')({
  params: { parse: (p) => ({ diagnosticoId: diagnosticoId(p.diagnosticoId) }), stringify: (p) => ({ diagnosticoId: String(p.diagnosticoId) }) },
  head: () => ({ meta: [{ title: 'Diagnóstico guardado · OpenGame Linux' }] }),
  beforeLoad: ({ context, location }) => {
    if (context.visitante === null) throw redirect({ to: '/entrar', search: volverAqui(location) })
  },
  loader: ({ params }) => miDiagnosticoFn({ data: { id: params.diagnosticoId } }),
  component: DiagnosticoGuardado,
})

function DiagnosticoGuardado() {
  const d = Route.useLoaderData()
  return (
    <main className="envoltura pila">
      <p className="migas">
        <Link to="/diagnostico">Diagnóstico</Link> / {d.equipo}
      </p>
      <h1>Diagnóstico de «{d.equipo}»</h1>
      <p className="tenue">Solo tú ves este diagnóstico. Los reportes que publiques mostrarán su contexto técnico, no tu correo.</p>
      <ResumenCaptura captura={d.captura} />
      <h2 className="titulo-seccion">Juegos</h2>
      <MatrizDiagnostico filas={d.matriz} />
    </main>
  )
}
