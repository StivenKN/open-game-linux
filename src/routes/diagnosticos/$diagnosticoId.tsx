// A saved capture with its matrix. Owner only (8.9 "el diagnóstico detallado es privado"): anyone else,
// and any id that is not a number, gets notFound; a guest is sent to sign in.
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Option, Schema } from 'effect'
import { DiagnosticoId, IdDesdeTexto } from '../../dominio/ids.ts'
import { miDiagnosticoFn } from '../../fns/diagnostico.ts'
import { MatrizDiagnostico } from '../../ui/diagnostico/MatrizDiagnostico.tsx'
import { ResumenCaptura } from '../../ui/diagnostico/ResumenCaptura.tsx'

const idDeRuta = Schema.decodeUnknownOption(IdDesdeTexto(DiagnosticoId))

export const Route = createFileRoute('/diagnosticos/$diagnosticoId')({
  head: () => ({ meta: [{ title: 'Diagnóstico guardado · OpenGame Linux' }] }),
  loader: ({ params }) =>
    Option.match(idDeRuta(params.diagnosticoId), {
      onNone: () => {
        throw notFound()
      },
      onSome: (id) => miDiagnosticoFn({ data: { id } }),
    }),
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
