import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { DiagnosticId } from '../../domain/ids.ts'
import { myDiagnosticFn } from '../../fns/diagnostic.ts'
import { Distribuciones } from '../../ui/diagnostics/Distributions.tsx'
import { JuegosDelEquipo } from '../../ui/diagnostics/MachineGames.tsx'
import { ResumenCaptura } from '../../ui/diagnostics/CaptureSummary.tsx'
import { TarjetaGraficaEnLinux } from '../../ui/diagnostics/GraphicsCardOnLinux.tsx'
import { idDeRuta } from '../-ids.ts'
import { volverAqui } from '../-return-to.ts'

const diagnosticId = idDeRuta(DiagnosticId)

export const Route = createFileRoute('/diagnosticos/$diagnosticId')({
  params: { parse: (p) => ({ diagnosticId: diagnosticId(p.diagnosticId) }), stringify: (p) => ({ diagnosticId: String(p.diagnosticId) }) },
  head: () => ({ meta: [{ title: 'Diagnóstico guardado · OpenGame Linux' }] }),
  beforeLoad: ({ context, location }) => {
    if (context.visitante === null) throw redirect({ to: '/entrar', search: volverAqui(location) })
  },
  loader: ({ params }) => myDiagnosticFn({ data: { id: params.diagnosticId } }),
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
      <ResumenCaptura captura={d.capture} />
      <TarjetaGraficaEnLinux equipo={d.machine} pci={d.capture.gpu_pci_id} />
      <JuegosDelEquipo filas={d.matrix} biblioteca={d.library} orientativa={d.capture.sistema === 'Windows'} />
      <Distribuciones {...d.distributions} />
    </main>
  )
}
