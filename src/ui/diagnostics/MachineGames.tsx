import type { EvaluatedLibrary } from '../../domain/library.ts'
import { libraryReadiness } from '../../domain/readiness.ts'
import { useT } from '../i18n/messages.ts'
import { type MatrixRow, DiagnosticMatrix } from './DiagnosticMatrix.tsx'
import { ReadinessSummary } from './ReadinessSummary.tsx'

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
  const g = useT().diagnosis.games
  if (library === null)
    return (
      <>
        <h2 className="section-title">{g.heading}</h2>
        <DiagnosticMatrix rows={rows} approximate={approximate} />
      </>
    )
  const owned = rows.filter((f) => f.in_library)
  const rest = rows.filter((f) => !f.in_library)
  const { unknown } = library
  return (
    <>
      <section className="stack" aria-labelledby="steam-library">
        <h2 id="steam-library" className="section-title">
          {g.library}
        </h2>
        <ReadinessSummary readiness={libraryReadiness(owned, library.total)} />
        {owned.length > 0 && <DiagnosticMatrix rows={owned} approximate={approximate} />}
        {unknown.length > 0 && (
          <details className="card" open={unknown.length <= OPEN_UP_TO}>
            <summary className="panel-title">{g.unknown(unknown.length)}</summary>
            <p className="small muted">{g.unknownHelp}</p>
            <ul className="library-list">
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
      <h2 className="section-title">{g.rest}</h2>
      <DiagnosticMatrix rows={rest} approximate={approximate} />
    </>
  )
}
