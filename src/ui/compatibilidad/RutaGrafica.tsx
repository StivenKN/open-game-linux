import type { NivelX86 } from '../../dominio/plataforma.ts'
import type { RutaJuego } from '../../dominio/ruta.ts'
import { Insignia } from '../Insignia.tsx'
import { camino, etiquetaRuta, fraseRuta } from '../vocabulario.ts'

/**
 * The hardware-only graphics path for one game. It stands apart from the community state and the
 * profile check: it needs no reports. `minimo` is the game's minimum x86-64 level.
 */
export function RutaGrafica({ ruta, minimo, orientativa }: { ruta: RutaJuego; minimo: NivelX86 | null; orientativa: boolean }) {
  // The warning and launch option follow the path wherever it shows, a certain floor included.
  const visible = ruta.estado === 'con_ruta' ? ruta.camino : ruta.estado === 'sin_datos' ? ruta.al_menos : null
  const { nota, opcion } = visible === null ? { nota: null, opcion: null } : camino[visible]
  return (
    <div className="pila">
      <div className="fila">
        <span className="rotulo">Ruta gráfica</span>
        <Insignia etiqueta={etiquetaRuta(ruta)} forma="punteado" />
      </div>
      {fraseRuta(ruta, minimo).map((frase) => (
        <p key={frase} className="pequeno">
          {frase}
        </p>
      ))}
      {nota && (
        <p className="pequeno nota" data-tono="amarillo">
          {nota}
        </p>
      )}
      {opcion && (
        <p className="pequeno tenue">
          Opción de lanzamiento en Steam: <code>{opcion}</code>
        </p>
      )}
      {orientativa && <p className="pequeno tenue">Calculada desde un diagnóstico de Windows: sirve de orientación.</p>}
    </div>
  )
}
