import type { EvaluatedLibrary } from '../../domain/library.ts'
import { contar } from '../format.ts'
import { type FilaMatriz, MatrizDiagnostico } from './DiagnosticMatrix.tsx'

const ABIERTA_HASTA = 20

export function JuegosDelEquipo({
  filas,
  biblioteca,
  orientativa,
}: {
  filas: ReadonlyArray<FilaMatriz>
  biblioteca: EvaluatedLibrary | null
  orientativa: boolean
}) {
  if (biblioteca === null)
    return (
      <>
        <h2 className="titulo-seccion">Juegos</h2>
        <MatrizDiagnostico filas={filas} orientativa={orientativa} />
      </>
    )
  const propias = filas.filter((f) => f.en_biblioteca)
  const resto = filas.filter((f) => !f.en_biblioteca)
  const { unknown: desconocidos } = biblioteca
  return (
    <>
      <section className="pila" aria-labelledby="biblioteca-steam">
        <h2 id="biblioteca-steam" className="titulo-seccion">
          Tu biblioteca de Steam
        </h2>
        <p className="tenue">
          {contar(biblioteca.total, 'juego instalado', 'juegos instalados')}, {propias.length} en el catálogo.
        </p>
        {propias.length > 0 ? (
          <MatrizDiagnostico filas={propias} orientativa={orientativa} />
        ) : (
          <p className="pequeno nota">Ninguno de tus juegos instalados está todavía en el catálogo.</p>
        )}
        {desconocidos.length > 0 && (
          <details className="tarjeta" open={desconocidos.length <= ABIERTA_HASTA}>
            <summary className="panel-titulo">Juegos que todavía no conocemos ({desconocidos.length})</summary>
            <p className="pequeno tenue">Aún no están en el catálogo, así que no sabemos cómo funcionan en Linux. Cada nombre abre su página en Steam.</p>
            <ul className="lista-biblioteca">
              {desconocidos.map((j) => (
                <li key={j.app_id}>
                  <a href={`https://store.steampowered.com/app/${j.app_id}`} target="_blank" rel="noreferrer">
                    {j.nombre}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <h2 className="titulo-seccion">Resto del catálogo</h2>
      <MatrizDiagnostico filas={resto} orientativa={orientativa} />
    </>
  )
}
