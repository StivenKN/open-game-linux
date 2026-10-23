import { Link } from '@tanstack/react-router'
import type { EvaluatedDistro, DistroVerdict } from '../../domain/distros.ts'
import type { GuideId } from '../../domain/ids.ts'
import { Badge } from '../Badge.tsx'
import { useLang, useT } from '../i18n/messages.ts'

const GROUPS = ['sin_objeciones', 'con_ajustes', 'descartada'] as const satisfies ReadonlyArray<DistroVerdict>

/** Distros ruled out by the hardware, grouped by verdict. Order inside a group is the registry's, never a ranking. */
export function Distributions({ evaluated, guide }: { evaluated: ReadonlyArray<EvaluatedDistro>; guide: GuideId | null }) {
  const t = useT()
  const lang = useLang()
  const words = t.diagnosis.distributions
  return (
    <section className="stack" aria-labelledby="distributions">
      <h2 id="distributions" className="section-title">
        {words.heading}
      </h2>
      <p className="muted">
        {words.intro(
          guide === null ? (
            <Link to="/$lang/guias" params={{ lang }}>
              {words.guides}
            </Link>
          ) : (
            <Link to="/$lang/guias/$guideId" params={{ lang, guideId: guide }}>
              {words.guide}
            </Link>
          ),
        )}
      </p>
      <div className="mosaic mosaic-wide">
        {GROUPS.map((group) => {
          const distros = evaluated.filter((d) => d.verdict === group)
          if (distros.length === 0) return null
          return (
            <section key={group} className="card stack" aria-label={t.distroVerdict[group].text}>
              <Badge label={t.distroVerdict[group]} shape="punteado" />
              <ul className="card-list">
                {distros.map((d) => (
                  <li key={d.key} className="stack">
                    <a href={d.url} target="_blank" rel="noreferrer" className="game-name">
                      {d.name}
                    </a>
                    {d.objections.map((o) => (
                      <p key={o.code} className="small muted">
                        {t.objection(o)}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </section>
  )
}
