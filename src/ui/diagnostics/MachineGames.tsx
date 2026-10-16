import type { EvaluatedLibrary } from '../../domain/library.ts'
import { count } from '../format.ts'
import { type MatrixRow, DiagnosticMatrix } from './DiagnosticMatrix.tsx'

const OPEN_UP_TO = 20

export function MachineGames({
  rows,
  library,
  approximate,
}: {
  rows: ReadonlyArray<MatrixRow>
  library: EvaluatedLibrary | null
  approximate: boolean
}) {
  if (library === null)
    return (
      <>
        <h2 className="titulo-seccion">Juegos</h2>
        <DiagnosticMatrix rows={rows} approximate={approximate} />
      </>
    )
  const owned = rows.filter((f) => f.in_library)
  const rest = rows.filter((f) => !f.in_library)
  const { unknown } = library
  return (
    <>
      <section className="pila" aria-labelledby="biblioteca-steam">
        <h2 id="biblioteca-steam" className="titulo-seccion">
          Tu biblioteca de Steam
        </h2>
        <p className="tenue">
          {count(library.total, 'juego instalado', 'juegos instalados')}, {owned.length} en el catálogo.
        </p>
        {owned.length > 0 ? (
          <DiagnosticMatrix rows={owned} approximate={approximate} />
        ) : (
          <p className="pequeno nota">Ninguno de tus juegos instalados está todavía en el catálogo.</p>
        )}
        {unknown.length > 0 && (
          <details className="tarjeta" open={unknown.length <= OPEN_UP_TO}>
            <summary className="panel-titulo">Juegos que todavía no conocemos ({unknown.length})</summary>
            <p className="pequeno tenue">Aún no están en el catálogo, así que no sabemos cómo funcionan en Linux. Cada nombre abre su página en Steam.</p>
            <ul className="lista-biblioteca">
              {unknown.map((j) => (
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
      <DiagnosticMatrix rows={rest} approximate={approximate} />
    </>
  )
}
