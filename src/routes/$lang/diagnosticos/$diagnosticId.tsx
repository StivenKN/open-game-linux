import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { DiagnosticId } from '../../../domain/ids.ts'
import { myDiagnosticFn } from '../../../fns/diagnostic.ts'
import { Distributions } from '../../../ui/diagnostics/Distributions.tsx'
import { MachineGames } from '../../../ui/diagnostics/MachineGames.tsx'
import { CaptureSummary } from '../../../ui/diagnostics/CaptureSummary.tsx'
import { GraphicsCardOnLinux } from '../../../ui/diagnostics/GraphicsCardOnLinux.tsx'
import { useLang, useT } from '../../../ui/i18n/messages.ts'
import { titled } from '../../-head.ts'
import { routeIdParser } from '../../-ids.ts'
import { returnHere } from '../../-return-to.ts'

const diagnosticId = routeIdParser(DiagnosticId)

export const Route = createFileRoute('/$lang/diagnosticos/$diagnosticId')({
  params: { parse: (p) => ({ diagnosticId: diagnosticId(p.diagnosticId) }), stringify: (p) => ({ diagnosticId: String(p.diagnosticId) }) },
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
  },
  loader: ({ params }) => myDiagnosticFn({ data: { id: params.diagnosticId } }),
  head: ({ params }) => titled(params.lang, (t) => t.diagnosis.saved.title),
  component: SavedDiagnosticPage,
})

function SavedDiagnosticPage() {
  const d = Route.useLoaderData()
  const t = useT()
  const lang = useLang()
  return (
    <main className="wrapper stack">
      <p className="breadcrumbs">
        <Link to="/$lang/diagnostico" params={{ lang }}>
          {t.diagnosis.title}
        </Link>{' '}
        / {d.alias}
      </p>
      <h1>{t.diagnosis.saved.heading(d.alias)}</h1>
      <p className="muted">{t.diagnosis.saved.private}</p>
      <CaptureSummary capture={d.capture} />
      <GraphicsCardOnLinux machine={d.machine} pci={d.capture.gpu_pci_id} />
      <MachineGames rows={d.matrix} library={d.library} approximate={d.capture.operating_system === 'Windows'} />
      <Distributions {...d.distributions} />
    </main>
  )
}
