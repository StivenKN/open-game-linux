// Dev-only gallery of the verdict components on fixtures (PLAN U2c). The [_] escape makes the URL
// /_muestras; a bare `_muestras.tsx` would be a pathless layout. Production builds answer notFound.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { CopyBox } from '../ui/compatibility/CopyBox.tsx'
import { GameStatus } from '../ui/compatibility/GameStatus.tsx'
import { EnvironmentMatrix } from '../ui/compatibility/EnvironmentMatrix.tsx'
import { VerdictForMe } from '../ui/compatibility/VerdictForMe.tsx'
import { diagnostic, samples, launchOptions, type Sample } from '../ui/samples/fixtures.ts'

export const Route = createFileRoute('/_muestras')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  head: () => ({ meta: [{ title: 'Muestras · OpenGame Linux' }] }),
  component: SamplesPage,
})

function SamplesPage() {
  return (
    <>
      <main className="wrapper">
        <p className="row">
          <span className="stamp">Datos de ejemplo</span>
          <span className="small muted">Muestras de veredicto · solo en desarrollo</span>
        </p>
        <p className="datum muted">Tu diagnóstico: {diagnostic.summary}</p>
        {samples.map((m, i) => (
          <SampleCard key={m.key} sample={m} number={i + 1} />
        ))}

        <h2 className="section-title">Otros estados</h2>
        <div className="grid-2">
          <VerdictForMe personal={null} />
          <div className="card">
            <CopyBox label={launchOptions.label} text={launchOptions.text} />
          </div>
        </div>
      </main>
    </>
  )
}

function SampleCard({ sample, number }: { sample: Sample; number: number }) {
  return (
    <article className="sample-card" aria-labelledby={`ficha-${sample.key}`}>
      <h2 className="section-title">
        ({number}) {sample.scenario}
      </h2>
      <div className="breadcrumbs">Catálogo / {sample.studio}</div>
      <h3 id={`ficha-${sample.key}`} className="game-title">
        {sample.title}
      </h3>
      <div className="chip-row">
        {sample.editions.map((e) => (
          <span key={e} className="chip">
            {e}
          </span>
        ))}
      </div>
      <div className="game-page-body">
        <GameStatus summary={sample.summary} pending={sample.pending} />
        <VerdictForMe personal={sample.personal} />
      </div>
      <h4 className="section-title">Entornos probados</h4>
      <EnvironmentMatrix setups={sample.summary.setups} myDistribution={diagnostic.distribution_id} />
    </article>
  )
}
