import type { TestedSetup } from '../../domain/compatibility.ts'
import type { DistributionId } from '../../domain/ids.ts'
import { Outcome } from '../../domain/literals.ts'
import { contar, fecha, fps } from '../format.ts'
import { Chip, Insignia } from '../Badge.tsx'
import { estadoCompatibilidad, resultado } from '../vocabulary.ts'
import { ChipsFallos } from './FailureChips.tsx'

// The first word that names the distro itself: "Linux Mint 21.3" gives M, "Arch Linux rolling" gives A.
const inicial = (distribucion: string) =>
  (distribucion.split(' ').find((p) => /^\p{L}/u.test(p) && p !== 'Linux') ?? distribucion).charAt(0).toUpperCase()

export function MatrizEntornos({ entornos, miDistribucion }: { entornos: ReadonlyArray<TestedSetup>; miDistribucion: DistributionId | null }) {
  if (entornos.length === 0) return <p className="tarjeta tenue">Sin entornos con evidencia aprobada.</p>
  return (
    <ul className="entornos" aria-label="Entornos probados con reportes aprobados">
      {entornos.map((e) => {
        const mia = e.distribucion_id === miDistribucion
        const estado = estadoCompatibilidad[e.status]
        return (
          <li key={e.key} className="entorno" data-mia={mia || undefined}>
            <span className="entorno-franja" data-tono={estado.tono} data-forma="relleno" data-estado={e.status} />
            <span className="entorno-inicial" aria-hidden="true">
              {inicial(e.distribucion)}
            </span>
            <div className="entorno-que">
              <h3>
                {e.distribucion}
                {mia && (
                  <Chip tono="azul" forma="punteado">
                    tu distro
                  </Chip>
                )}
              </h3>
              <p>
                {e.capa} · {e.lanzador} · versión {e.version_juego}
              </p>
            </div>
            <dl className="entorno-datos">
              <div>
                <dt>Perfil</dt>
                <dd>{e.perfil ?? <span className="tenue">sin perfil</span>}</dd>
              </div>
              <div>
                <dt>FPS medido por la comunidad</dt>
                {e.fps.length === 0 ? (
                  <dd className="tenue">no medido</dd>
                ) : (
                  e.fps.map((f) => (
                    <dd key={`${f.resolution}|${f.quality}`}>
                      <b className="fps">{fps(f.average)}</b>{' '}
                      <span className="pequeno tenue">
                        FPS · {f.resolution} · {f.quality} · {contar(f.samples, 'medición', 'mediciones')}
                      </span>
                    </dd>
                  ))
                )}
              </div>
            </dl>
            <div className="entorno-resultado">
              <Insignia etiqueta={estado} />
              {e.status === 'resultados_variables' && (
                <span className="pequeno tenue">
                  {Outcome.literals
                    .flatMap((r) => {
                      const n = e.by_outcome[r]
                      return n ? [`${n} ${resultado[r].texto.toLowerCase()}`] : []
                    })
                    .join(' · ')}
                </span>
              )}
              {e.failures.length > 0 && <ChipsFallos fallos={e.failures} />}
              <span className="pequeno tenue">
                {contar(e.test_count, 'prueba', 'pruebas')} · última {fecha(e.last_tested)}
              </span>
              {e.recent_count === 0 && <span className="pequeno tenue">ninguna del último año</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
