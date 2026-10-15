import type { EntornoProbado } from '../../dominio/compatibilidad.ts'
import type { DistribucionId } from '../../dominio/ids.ts'
import { Resultado } from '../../dominio/literales.ts'
import { contar, fecha, fps } from '../formato.ts'
import { Chip, Insignia } from '../Insignia.tsx'
import { estadoCompatibilidad, resultado } from '../vocabulario.ts'
import { ChipsFallos } from './ChipsFallos.tsx'

// The first word that names the distro itself: "Linux Mint 21.3" gives M, "Arch Linux rolling" gives A.
const inicial = (distribucion: string) =>
  (distribucion.split(' ').find((p) => /^\p{L}/u.test(p) && p !== 'Linux') ?? distribucion).charAt(0).toUpperCase()

export function MatrizEntornos({ entornos, miDistribucion }: { entornos: ReadonlyArray<EntornoProbado>; miDistribucion: DistribucionId | null }) {
  if (entornos.length === 0) return <p className="tarjeta tenue">Sin entornos con evidencia aprobada.</p>
  return (
    <ul className="entornos" aria-label="Entornos probados con reportes aprobados">
      {entornos.map((e) => {
        const mia = e.distribucion_id === miDistribucion
        const estado = estadoCompatibilidad[e.estado]
        return (
          <li key={e.clave} className="entorno" data-mia={mia || undefined}>
            <span className="entorno-franja" data-tono={estado.tono} data-forma="relleno" data-estado={e.estado} />
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
                    <dd key={`${f.resolucion}|${f.calidad}`}>
                      <b className="fps">{fps(f.promedio)}</b>{' '}
                      <span className="pequeno tenue">
                        FPS · {f.resolucion} · {f.calidad} · {contar(f.mediciones, 'medición', 'mediciones')}
                      </span>
                    </dd>
                  ))
                )}
              </div>
            </dl>
            <div className="entorno-resultado">
              <Insignia etiqueta={estado} />
              {e.estado === 'resultados_variables' && (
                <span className="pequeno tenue">
                  {Resultado.literals
                    .flatMap((r) => {
                      const n = e.por_resultado[r]
                      return n ? [`${n} ${resultado[r].texto.toLowerCase()}`] : []
                    })
                    .join(' · ')}
                </span>
              )}
              {e.fallos.length > 0 && <ChipsFallos fallos={e.fallos} />}
              <span className="pequeno tenue">
                {contar(e.pruebas, 'prueba', 'pruebas')} · última {fecha(e.ultima_prueba)}
              </span>
              {e.vigentes === 0 && <span className="pequeno tenue">ninguna del último año</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
