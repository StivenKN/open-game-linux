import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { DiagnosticoId } from '../../dominio/ids.ts'
import { miDiagnosticoFn } from '../../fns/diagnostico.ts'
import { JuegosDelEquipo } from '../../ui/diagnostico/JuegosDelEquipo.tsx'
import { ResumenCaptura } from '../../ui/diagnostico/ResumenCaptura.tsx'
import { TarjetaGraficaEnLinux } from '../../ui/diagnostico/TarjetaGraficaEnLinux.tsx'
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
        <Link to="/diagnostico">Diagnóstico</Link> / {d.alias}
      </p>
      <h1>Diagnóstico de «{d.alias}»</h1>
      <p className="tenue">Solo tú ves este diagnóstico. Los reportes que publiques mostrarán su contexto técnico, no tu correo.</p>
      <ResumenCaptura captura={d.captura} />
      <TarjetaGraficaEnLinux equipo={d.equipo} pci={d.captura.gpu_pci_id} />
      <JuegosDelEquipo filas={d.matriz} biblioteca={d.biblioteca} orientativa={d.captura.sistema === 'Windows'} />
    </main>
  )
}
