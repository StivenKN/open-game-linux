import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { DiagnosticId } from '../../domain/ids.ts'
import { myDiagnosticFn } from '../../fns/diagnostic.ts'
import { Distributions } from '../../ui/diagnostics/Distributions.tsx'
import { MachineGames } from '../../ui/diagnostics/MachineGames.tsx'
import { CaptureSummary } from '../../ui/diagnostics/CaptureSummary.tsx'
import { GraphicsCardOnLinux } from '../../ui/diagnostics/GraphicsCardOnLinux.tsx'
import { routeIdParser } from '../-ids.ts'
import { returnHere } from '../-return-to.ts'

const diagnosticId = routeIdParser(DiagnosticId)

export const Route = createFileRoute('/diagnosticos/$diagnosticId')({
  params: { parse: (p) => ({ diagnosticId: diagnosticId(p.diagnosticId) }), stringify: (p) => ({ diagnosticId: String(p.diagnosticId) }) },
  head: () => ({ meta: [{ title: 'Diagnóstico guardado · OpenGame Linux' }] }),
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
  },
  loader: ({ params }) => myDiagnosticFn({ data: { id: params.diagnosticId } }),
  component: SavedDiagnosticPage,
})

function SavedDiagnosticPage() {
  const d = Route.useLoaderData()
  return (
    <main className="envoltura pila">
      <p className="migas">
        <Link to="/diagnostico">Diagnóstico</Link> / {d.alias}
      </p>
      <h1>Diagnóstico de «{d.alias}»</h1>
      <p className="tenue">Solo tú ves este diagnóstico. Los reportes que publiques mostrarán su contexto técnico, no tu correo.</p>
      <CaptureSummary capture={d.capture} />
      <GraphicsCardOnLinux machine={d.machine} pci={d.capture.gpu_pci_id} />
      <MachineGames rows={d.matrix} library={d.library} approximate={d.capture.operating_system === 'Windows'} />
      <Distributions {...d.distributions} />
    </main>
  )
}
