// Dev-only gallery of the verdict components on fixtures (PLAN U2c). The [_] escape makes the URL
// /_muestras; a bare `_muestras.tsx` would be a pathless layout. Production builds answer notFound.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { CajaCopiar } from '../ui/compatibilidad/CajaCopiar.tsx'
import { EstadoJuego } from '../ui/compatibilidad/EstadoJuego.tsx'
import { MatrizEntornos } from '../ui/compatibilidad/MatrizEntornos.tsx'
import { VeredictoParaMi } from '../ui/compatibilidad/VeredictoParaMi.tsx'
import { diagnostico, muestras, parametrosLanzamiento, type Muestra } from '../ui/muestras/fixtures.ts'

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
          <div className="tarjeta">
            <VeredictoParaMi personal={null} />
          </div>
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
      <div className="rejilla-2">
        <div>
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
          <p className="pequeno tenue">
            El estado se calcula al consultar a partir de reportes aprobados. Un resultado favorable no garantiza que
            funcione en cualquier equipo.
          </p>
        </div>
        <div className="tarjeta pila">
          <EstadoJuego resumen={muestra.resumen} pendientes={muestra.pendientes} />
          <hr />
          <VeredictoParaMi personal={muestra.personal} />
        </div>
      </div>
      <h4 className="titulo-seccion">Entornos probados</h4>
      <MatrizEntornos entornos={muestra.resumen.entornos} miDistribucion={diagnostico.distribucion_id} />
    </article>
  )
}
