import { Link } from '@tanstack/react-router'
import type { EvaluatedDistro, DistroVerdict } from '../../domain/distros.ts'
import type { GuideId } from '../../domain/ids.ts'
import { Badge } from '../Badge.tsx'
import { objection, distroVerdict } from '../vocabulary.ts'

const GROUPS = ['sin_objeciones', 'con_ajustes', 'descartada'] as const satisfies ReadonlyArray<DistroVerdict>

/** Distros ruled out by the hardware, grouped by verdict. Order inside a group is the registry's, never a ranking. */
export function Distributions({ evaluated, guide }: { evaluated: ReadonlyArray<EvaluatedDistro>; guide: GuideId | null }) {
  return (
    <section className="pila" aria-labelledby="distribuciones">
      <h2 id="distribuciones" className="titulo-seccion">
        Distribuciones
      </h2>
      <p className="tenue">
        No elegimos una por ti. Descartamos las que tu equipo no puede usar y decimos qué ajuste necesita cada una; «sin objeciones» significa que no encontramos
        nada en contra. Para decidir entre ellas, lee{' '}
        {guide === null ? <Link to="/guias">las guías de adopción</Link> : <Link to="/guias/$guideId" params={{ guideId: guide }}>¿Qué distribución elegir para jugar?</Link>}.
      </p>
      <div className="mosaico mosaico-ancho">
        {GROUPS.map((group) => {
          const distros = evaluated.filter((d) => d.verdict === group)
          if (distros.length === 0) return null
          return (
            <section key={group} className="tarjeta pila" aria-label={distroVerdict[group].text}>
              <Badge label={distroVerdict[group]} shape="punteado" />
              <ul className="lista-tarjetas">
                {distros.map((d) => (
                  <li key={d.key} className="pila">
                    <a href={d.url} target="_blank" rel="noreferrer" className="nombre-juego">
                      {d.name}
                    </a>
                    {d.objections.map((o) => (
                      <p key={o.code} className="pequeno tenue">
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
