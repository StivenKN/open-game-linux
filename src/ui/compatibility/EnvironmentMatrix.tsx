import type { TestedSetup } from '../../domain/compatibility.ts'
import type { DistributionId } from '../../domain/ids.ts'
import { Outcome } from '../../domain/literals.ts'
import { count, date, fps } from '../format.ts'
import { Chip, Badge } from '../Badge.tsx'
import { compatibilityStatus, device, outcome } from '../vocabulary.ts'
import { FailureChips } from './FailureChips.tsx'

// The first word that names the distro itself: "Linux Mint 21.3" gives M, "Arch Linux rolling" gives A.
const initial = (distribution: string) =>
  (distribution.split(' ').find((p) => /^\p{L}/u.test(p) && p !== 'Linux') ?? distribution).charAt(0).toUpperCase()

export function EnvironmentMatrix({ setups, myDistribution }: { setups: ReadonlyArray<TestedSetup>; myDistribution: DistributionId | null }) {
  if (setups.length === 0) return <p className="card muted">Sin entornos con evidencia aprobada.</p>
  return (
    <ul className="setups" aria-label="Entornos probados con reportes aprobados">
      {setups.map((e) => {
        const mine = e.distribution_id === myDistribution
        const status = compatibilityStatus[e.status]
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
                    tu distro
                  </Chip>
                )}
              </h3>
              <p>
                {e.layer} · {e.launcher} · versión {e.game_version}
              </p>
            </div>
            <dl className="setup-data">
              <div>
                <dt>Perfil</dt>
                <dd>{e.profile ?? <span className="muted">sin perfil</span>}</dd>
              </div>
              <div>
                <dt>FPS medido por la comunidad</dt>
                {e.fps.length === 0 ? (
                  <dd className="muted">no medido</dd>
                ) : (
                  e.fps.map((f) => (
                    <dd key={`${f.resolution}|${f.quality}`}>
                      <b className="fps">{fps(f.average)}</b>{' '}
                      <span className="small muted">
                        FPS · {f.resolution} · {f.quality} · {count(f.samples, 'medición', 'mediciones')}
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
                      return n ? [`${n} ${outcome[r].text.toLowerCase()}`] : []
                    })
                    .join(' · ')}
                </span>
              )}
              {e.failures.length > 0 && <FailureChips failures={e.failures} />}
              <span className="small muted">
                {count(e.test_count, 'prueba', 'pruebas')} · última {date(e.last_tested)}
              </span>
              {e.recent_count === 0 && <span className="small muted">ninguna del último año</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
