import { Link } from '@tanstack/react-router'
import type { EvaluatedDistro, DistroVerdict } from '../../domain/distros.ts'
import type { GuideId } from '../../domain/ids.ts'
import { Badge } from '../Badge.tsx'
import { objection, distroVerdict } from '../vocabulary.ts'

const GROUPS = ['sin_objeciones', 'con_ajustes', 'descartada'] as const satisfies ReadonlyArray<DistroVerdict>

/** Distros ruled out by the hardware, grouped by verdict. Order inside a group is the registry's, never a ranking. */
export function Distributions({ evaluated, guide }: { evaluated: ReadonlyArray<EvaluatedDistro>; guide: GuideId | null }) {
  return (
    <section className="stack" aria-labelledby="distributions">
      <h2 id="distributions" className="section-title">
        Distribuciones
      </h2>
      <p className="muted">
        No elegimos una por ti. Descartamos las que tu equipo no puede usar y decimos qué ajuste necesita cada una; «sin objeciones» significa que no encontramos
        nada en contra. Para decidir entre ellas, lee{' '}
        {guide === null ? <Link to="/guias">las guías de adopción</Link> : <Link to="/guias/$guideId" params={{ guideId: guide }}>¿Qué distribución elegir para jugar?</Link>}.
      </p>
      <div className="mosaic mosaic-wide">
        {GROUPS.map((group) => {
          const distros = evaluated.filter((d) => d.verdict === group)
          if (distros.length === 0) return null
          return (
            <section key={group} className="card stack" aria-label={distroVerdict[group].text}>
              <Badge label={distroVerdict[group]} shape="punteado" />
              <ul className="card-list">
                {distros.map((d) => (
                  <li key={d.key} className="stack">
                    <a href={d.url} target="_blank" rel="noreferrer" className="game-name">
                      {d.name}
                    </a>
                    {d.objections.map((o) => (
                      <p key={o.code} className="small muted">
                        {objection(o)}
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
