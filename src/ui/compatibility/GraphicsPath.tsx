import type { X86Level } from '../../domain/platform.ts'
import type { GamePath } from '../../domain/graphics-path.ts'
import { Insignia } from '../Badge.tsx'
import { camino, etiquetaRuta, fraseRuta } from '../vocabulary.ts'

/**
 * The hardware-only graphics path for one game. It stands apart from the community state and the
 * profile check: it needs no reports. `minimo` is the game's minimum x86-64 level.
 */
export function RutaGrafica({ ruta, minimo, orientativa }: { ruta: GamePath; minimo: X86Level | null; orientativa: boolean }) {
  // The warning and launch option follow the path wherever it shows, a certain floor included.
  const visible = ruta.status === 'con_ruta' ? ruta.path : ruta.status === 'sin_datos' ? ruta.at_least : null
  const { nota, opcion, tono } = visible === null ? { nota: null, opcion: null, tono: null } : camino[visible]
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
        <p className="pequeno nota" data-tono={tono === 'verde' ? 'azul' : 'amarillo'}>
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
