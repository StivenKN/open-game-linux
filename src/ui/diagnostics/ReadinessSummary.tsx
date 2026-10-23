import { Link } from '@tanstack/react-router'
import { CompatibilityStatus } from '../../domain/compatibility.ts'
import { type LibraryReadiness, stoppedWorking } from '../../domain/readiness.ts'
import { Badge, Chip } from '../Badge.tsx'
import { AntiCheatAttribution } from '../anticheat/AntiCheat.tsx'
import type { Messages } from '../i18n/es.ts'
import { useLang, useT } from '../i18n/messages.ts'
import type { MatrixRow } from './DiagnosticMatrix.tsx'

const SHORT_LIST = 5

// The catalog's order, with "no evidence" last: the summary leads with what the evidence says.
const STATUS_ORDER = [...CompatibilityStatus.literals.filter((s) => s !== 'sin_evidencia'), 'sin_evidencia'] as const

/** What qualifies the headline's evidence: games the machine cannot run, and evidence older than a year. */
const qualifiers = (t: Messages, { working, working_out_of_reach, working_stale }: LibraryReadiness<MatrixRow>): string =>
  [
    working_out_of_reach > 0 && t.diagnosis.readiness.outOfReach(working_out_of_reach, working),
    working_stale > 0 && t.diagnosis.readiness.stale(working_stale, working),
  ]
    .filter((s) => s !== false)
    .join(' ')

/** The top of the Steam library section: the one-screen answer to "can I switch to Linux?". */
export function ReadinessSummary({ readiness: r }: { readiness: LibraryReadiness<MatrixRow> }) {
  const t = useT()
  const lang = useLang()
  const w = t.diagnosis.readiness
  const antiCheat = t.failureType('anti_cheat')
  const more = r.no_evidence.length - SHORT_LIST
  const qualified = qualifiers(t, r)
  const unknown = r.installed - r.in_catalog
  if (r.installed === 0) return <p className="small note">{w.headline(r)}</p>
  return (
    <div className="card stack readiness" aria-label={w.label}>
      <p className="readiness-headline">{w.headline(r)}</p>
      {qualified !== '' && <p>{qualified}</p>}
      <p className="small muted">{w.installed(r.installed, r.in_catalog, unknown)}</p>
      {r.in_catalog > 0 && (
        <>
          <ul className="readiness-counts" aria-label={w.byStatus}>
            {STATUS_ORDER.map((s) =>
              r.by_status[s] === 0 ? null : (
                <li key={s}>
                  <b>{r.by_status[s]}</b>
                  <Badge label={t.compatibilityStatus[s]} />
                </li>
              ),
            )}
          </ul>
          {r.blocked_by_anti_cheat > 0 && (
            <p className="small">
              <Chip tone={antiCheat.tone}>{antiCheat.text}</Chip> {w.blocked(r.blocked_by_anti_cheat)}
            </p>
          )}
          <hr />
          <div className="columns-2">
            <section className="stack" aria-labelledby="holding-back">
              <h3 id="holding-back" className="panel-title no-margin">
                {w.holdingBack}
              </h3>
              {r.holding_back.length === 0 ? (
                <p className="small muted">{w.noneHoldingBack}</p>
              ) : (
                <ul className="readiness-list">
                  {r.holding_back.map((g) => (
                    <li key={g.game_id}>
                      <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: g.game_id }}>
                        {g.title}
                      </Link>
                      <Badge label={t.compatibilityStatus[g.status]} />
                      {stoppedWorking(g) && <Chip tone="rojo">{w.stoppedWorking}</Chip>}
                      {g.blocked_by_anti_cheat && <Chip tone={antiCheat.tone}>{antiCheat.text}</Chip>}
                      {g.out_of_reach && (
                        <Chip tone="rojo" shape="punteado">
                          {w.outOfReachChip}
                        </Chip>
                      )}
                      {g.awacy !== null && <span className="small muted">{t.sources.anticheat.line(t.antiCheatStatus[g.awacy].text)}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {r.holding_back.some((g) => g.awacy !== null) && <AntiCheatAttribution />}
            </section>
            {r.no_evidence.length > 0 && (
              <section className="stack" aria-labelledby="no-evidence">
                <h3 id="no-evidence" className="panel-title no-margin">
                  {w.noEvidence}
                </h3>
                <p className="small muted">{w.noEvidenceHelp}</p>
                <ul className="readiness-list">
                  {r.no_evidence.slice(0, SHORT_LIST).map((g) => (
                    <li key={g.game_id}>
                      <Link to="/$lang/juegos/$gameId" params={{ lang, gameId: g.game_id }}>
                        {g.title}
                      </Link>
                      <Link to="/$lang/juegos/$gameId/reportar" params={{ lang, gameId: g.game_id }} className="small muted">
                        {w.report}
                      </Link>
                    </li>
                  ))}
                </ul>
                {more > 0 && <p className="small muted">{w.more(more)}</p>}
              </section>
            )}
          </div>
        </>
      )}
      <p className="small muted">{w.footnote}</p>
    </div>
  )
}
