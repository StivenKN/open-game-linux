// Dev-only gallery of the verdict components on fixtures (PLAN U2c). The [_] escape makes the URL
// /_muestras; a bare `_muestras.tsx` would be a pathless layout. Production builds answer notFound.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { CajaCopiar } from '../ui/compatibility/CopyBox.tsx'
import { EstadoJuego } from '../ui/compatibility/GameStatus.tsx'
import { MatrizEntornos } from '../ui/compatibility/EnvironmentMatrix.tsx'
import { VeredictoParaMi } from '../ui/compatibility/VerdictForMe.tsx'
import { diagnostico, muestras, parametrosLanzamiento, type Muestra } from '../ui/samples/fixtures.ts'

export const Route = createFileRoute('/_muestras')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  head: () => ({ meta: [{ title: 'Muestras · OpenGame Linux' }] }),
  component: Muestras,
})

function Muestras() {
  return (
    <>
      <main className="envoltura">
        <p className="fila">
          <span className="sello">Datos de ejemplo</span>
          <span className="pequeno tenue">Muestras de veredicto · solo en desarrollo</span>
        </p>
        <p className="dato tenue">Tu diagnóstico: {diagnostico.resumen}</p>
        {muestras.map((m, i) => (
          <Ficha key={m.clave} muestra={m} numero={i + 1} />
        ))}

        <h2 className="titulo-seccion">Otros estados</h2>
        <div className="rejilla-2">
          <VeredictoParaMi personal={null} />
          <div className="tarjeta">
            <CajaCopiar etiqueta={parametrosLanzamiento.etiqueta} texto={parametrosLanzamiento.texto} />
          </div>
        </div>
      </main>
    </>
  )
}

function Ficha({ muestra, numero }: { muestra: Muestra; numero: number }) {
  return (
    <article className="ficha" aria-labelledby={`ficha-${muestra.clave}`}>
      <h2 className="titulo-seccion">
        ({numero}) {muestra.caso}
      </h2>
      <div className="migas">Catálogo / {muestra.estudio}</div>
      <h3 id={`ficha-${muestra.clave}`} className="titulo-juego">
        {muestra.titulo}
      </h3>
      <div className="fila-chips">
        {muestra.ediciones.map((e) => (
          <span key={e} className="chip">
            {e}
          </span>
        ))}
      </div>
      <div className="ficha-cuerpo">
        <EstadoJuego resumen={muestra.resumen} pendientes={muestra.pendientes} />
        <VeredictoParaMi personal={muestra.personal} />
      </div>
      <h4 className="titulo-seccion">Entornos probados</h4>
      <MatrizEntornos entornos={muestra.resumen.entornos} miDistribucion={diagnostico.distribucion_id} />
    </article>
  )
}
