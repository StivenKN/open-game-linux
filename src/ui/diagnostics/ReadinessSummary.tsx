import { Link } from '@tanstack/react-router'
import { CompatibilityStatus } from '../../domain/compatibility.ts'
import { type LibraryReadiness, outOfReach } from '../../domain/readiness.ts'
import { Badge, Chip } from '../Badge.tsx'
import { count } from '../format.ts'
import { compatibilityStatus, failureType } from '../vocabulary.ts'
import type { MatrixRow } from './DiagnosticMatrix.tsx'

const SHORT_LIST = 5

// The catalog's order, with "no evidence" last: the summary leads with what the evidence says.
const STATUS_ORDER = [...CompatibilityStatus.literals.filter((s) => s !== 'sin_evidencia'), 'sin_evidencia'] as const

/** Evidence only: the machine never changes this count, the sentence after it qualifies it. */
const headline = ({ installed, in_catalog, working }: LibraryReadiness<MatrixRow>): string => {
  if (installed === 0) return 'El detector no encontró juegos de Steam instalados.'
  const one = installed === 1
  if (in_catalog === 0) return one ? 'Tu juego todavía no está en el catálogo.' : `Ninguno de tus ${installed} juegos está todavía en el catálogo.`
  if (working === 0)
    return one ? 'Tu juego todavía no tiene evidencia de que funcione en Linux.' : `Ninguno de tus ${installed} juegos tiene todavía evidencia de que funcione en Linux.`
  const subject = working === installed ? (one ? 'Tu juego' : `Tus ${installed} juegos`) : `${working} de ${one ? 'tu juego' : `tus ${installed} juegos`}`
  return `${subject} ${working === 1 ? 'tiene evidencia de que funciona' : 'tienen evidencia de que funcionan'} en Linux.`
}

const outOfReachSentence = ({ working, working_out_of_reach: n }: LibraryReadiness<MatrixRow>): string => {
  if (n === working) return n === 1 ? 'Pero pide más de lo que tiene tu equipo.' : 'Pero todos piden más de lo que tiene tu equipo.'
  return `Pero ${n} de ellos ${n === 1 ? 'pide' : 'piden'} más de lo que tiene tu equipo.`
}

/** The top of "Tu biblioteca de Steam": the one-screen answer to "can I switch to Linux?". */
export function ReadinessSummary({ readiness: r }: { readiness: LibraryReadiness<MatrixRow> }) {
  const antiCheat = failureType('anti_cheat')
  const more = r.no_evidence.length - SHORT_LIST
  if (r.installed === 0) return <p className="small note">{headline(r)}</p>
  return (
    <div className="card stack readiness" aria-label="Resumen de tu biblioteca">
      <p className="readiness-headline">{headline(r)}</p>
      {r.working_out_of_reach > 0 && <p>{outOfReachSentence(r)}</p>}
      <p className="small muted">
        {count(r.installed, 'juego instalado', 'juegos instalados')}: {r.in_catalog} en el catálogo y {r.installed - r.in_catalog} que todavía no
        conocemos.
      </p>
      {r.in_catalog > 0 && (
        <>
          <ul className="readiness-counts" aria-label="Tus juegos del catálogo, por estado">
            {STATUS_ORDER.map((s) =>
              r.by_status[s] === 0 ? null : (
                <li key={s}>
                  <b>{r.by_status[s]}</b>
                  <Badge label={compatibilityStatus[s]} />
                </li>
              ),
            )}
          </ul>
          {r.blocked_by_anti_cheat > 0 && (
            <p className="small">
              <Chip tone={antiCheat.tone}>{antiCheat.text}</Chip>{' '}
              {r.blocked_by_anti_cheat === 1 ? '1 de ellos está bloqueado' : `${r.blocked_by_anti_cheat} de ellos están bloqueados`} por un anti-cheat.
            </p>
          )}
          <hr />
          <div className="columns-2">
            <section className="stack" aria-labelledby="holding-back">
              <h3 id="holding-back" className="panel-title no-margin">
                Te frenan
              </h3>
              {r.holding_back.length === 0 ? (
                <p className="small muted">Nada por ahora: ningún reporte aprobado dice que alguno de tus juegos falle, y tu equipo no descarta ninguno.</p>
              ) : (
                <ul className="readiness-list">
                  {r.holding_back.map((g) => (
                    <li key={g.game_id}>
                      <Link to="/juegos/$gameId" params={{ gameId: g.game_id }}>
                        {g.title}
                      </Link>
                      <Badge label={compatibilityStatus[g.status]} />
                      {g.blocked_by_anti_cheat && <Chip tone={antiCheat.tone}>{antiCheat.text}</Chip>}
                      {outOfReach(g) && (
                        <Chip tone="rojo" shape="punteado">
                          Tu equipo no cumple
                        </Chip>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {r.no_evidence.length > 0 && (
              <section className="stack" aria-labelledby="no-evidence">
                <h3 id="no-evidence" className="panel-title no-margin">
                  Sin evidencia
                </h3>
                <p className="small muted">Nadie ha aprobado todavía una prueba de estos juegos. Si ya jugaste alguno en Linux, repórtalo.</p>
                <ul className="readiness-list">
                  {r.no_evidence.slice(0, SHORT_LIST).map((g) => (
                    <li key={g.game_id}>
                      <Link to="/juegos/$gameId" params={{ gameId: g.game_id }}>
                        {g.title}
                      </Link>
                      <Link to="/juegos/$gameId/reportar" params={{ gameId: g.game_id }} className="small muted">
                        Reportar un resultado
                      </Link>
                    </li>
                  ))}
                </ul>
                {more > 0 && <p className="small muted">Y {count(more, 'juego más', 'juegos más')} en la lista de abajo.</p>}
              </section>
            )}
          </div>
        </>
      )}
      <p className="small muted">
        Solo cuentan los reportes aprobados, igual que en la ficha de cada juego. Un resultado favorable no garantiza que funcione en tu equipo.
      </p>
    </div>
  )
}
