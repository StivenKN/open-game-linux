import type { TestedSetup } from '../../domain/compatibility.ts'
import type { DistributionId } from '../../domain/ids.ts'
import { Outcome } from '../../domain/literals.ts'
import { Chip, Badge } from '../Badge.tsx'
import { useT } from '../i18n/messages.ts'
import { device } from '../vocabulary.ts'
import { FailureChips } from './FailureChips.tsx'

// The first word that names the distro itself: "Linux Mint 21.3" gives M, "Arch Linux rolling" gives A.
const initial = (distribution: string) =>
  (distribution.split(' ').find((p) => /^\p{L}/u.test(p) && p !== 'Linux') ?? distribution).charAt(0).toUpperCase()

export function EnvironmentMatrix({ setups, myDistribution }: { setups: ReadonlyArray<TestedSetup>; myDistribution: DistributionId | null }) {
  const t = useT()
  const m = t.compatibility.setups
  if (setups.length === 0) return <p className="card muted">{m.empty}</p>
  return (
    <ul className="setups" aria-label={m.label}>
      {setups.map((e) => {
        const mine = e.distribution_id === myDistribution
        const status = t.compatibilityStatus[e.status]
        return (
          <li key={e.key} className="setup" data-mine={mine || undefined}>
            <span className="setup-stripe" data-tone={status.tone} data-shape="relleno" data-state={e.status} />
            <span className="setup-initial" aria-hidden="true">
              {initial(e.distribution)}
            </span>
            <div className="setup-what">
              <h3>
                {e.distribution}
                {e.device !== null && <Chip>{device[e.device]}</Chip>}
                {mine && (
                  <Chip tone="azul" shape="punteado">
                    {m.yourDistro}
                  </Chip>
                )}
              </h3>
              <p>
                {e.layer} · {e.launcher} · {m.version(e.game_version)}
              </p>
            </div>
            <dl className="setup-data">
              <div>
                <dt>{m.profile}</dt>
                <dd>{e.profile ?? <span className="muted">{m.noProfile}</span>}</dd>
              </div>
              <div>
                <dt>{m.fps}</dt>
                {e.fps.length === 0 ? (
                  <dd className="muted">{m.notMeasured}</dd>
                ) : (
                  e.fps.map((f) => (
                    <dd key={`${f.resolution}|${f.quality}`}>
                      <b className="fps">{t.fps(f.average)}</b>{' '}
                      <span className="small muted">
                        FPS · {f.resolution} · {f.quality} · {m.measurements(f.samples)}
                      </span>
                    </dd>
                  ))
                )}
              </div>
            </dl>
            <div className="setup-outcome">
              <Badge label={status} />
              {e.status === 'resultados_variables' && (
                <span className="small muted">
                  {Outcome.literals
                    .flatMap((r) => {
                      const n = e.by_outcome[r]
                      return n ? [`${n} ${t.outcome[r].text.toLowerCase()}`] : []
                    })
                    .join(' · ')}
                </span>
              )}
              {e.failures.length > 0 && <FailureChips failures={e.failures} />}
              <span className="small muted">{m.tests(e.test_count, t.date(e.last_tested))}</span>
              {e.recent_count === 0 && <span className="small muted">{m.noneRecent}</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
