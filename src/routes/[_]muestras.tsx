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
      <main className="envoltura">
        <p className="fila">
          <span className="sello">Datos de ejemplo</span>
          <span className="pequeno tenue">Muestras de veredicto · solo en desarrollo</span>
        </p>
        <p className="dato tenue">Tu diagnóstico: {diagnostic.summary}</p>
        {samples.map((m, i) => (
          <SampleCard key={m.key} sample={m} number={i + 1} />
        ))}

        <h2 className="titulo-seccion">Otros estados</h2>
        <div className="rejilla-2">
          <VerdictForMe personal={null} />
          <div className="tarjeta">
            <CopyBox label={launchOptions.label} text={launchOptions.text} />
          </div>
        </div>
      </main>
    </>
  )
}

function SampleCard({ sample, number }: { sample: Sample; number: number }) {
  return (
    <article className="ficha" aria-labelledby={`ficha-${sample.key}`}>
      <h2 className="titulo-seccion">
        ({number}) {sample.scenario}
      </h2>
      <div className="migas">Catálogo / {sample.studio}</div>
      <h3 id={`ficha-${sample.key}`} className="titulo-juego">
        {sample.title}
      </h3>
      <div className="fila-chips">
        {sample.editions.map((e) => (
          <span key={e} className="chip">
            {e}
          </span>
        ))}
      </div>
      <div className="ficha-cuerpo">
        <GameStatus summary={sample.summary} pending={sample.pending} />
        <VerdictForMe personal={sample.personal} />
      </div>
      <h4 className="titulo-seccion">Entornos probados</h4>
      <EnvironmentMatrix setups={sample.summary.setups} myDistribution={diagnostic.distribution_id} />
    </article>
  )
}
