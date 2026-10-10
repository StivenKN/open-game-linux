// "Entornos probados": one row per 8.10 grouping key, each with its own computed state and count.
// FPS appears only as measured by the community, one line per (resolución, calidad), never averaged across.
import { Resultado, type EntornoProbado } from '../../dominio/compatibilidad.ts'
import type { DistribucionId } from '../../dominio/ids.ts'
import { contar, fecha, fps } from '../formato.ts'
import { Chip, Insignia } from '../Insignia.tsx'
import { estadoCompatibilidad, resultado } from '../vocabulario.ts'
import { ChipsFallos } from './ChipsFallos.tsx'

/** `miDistribucion` highlights the viewer's rows; null without a diagnosis. */
export function MatrizEntornos({ entornos, miDistribucion }: { entornos: ReadonlyArray<EntornoProbado>; miDistribucion: DistribucionId | null }) {
  if (entornos.length === 0) return <p className="tarjeta tenue">Sin entornos con evidencia aprobada.</p>
  return (
    <div className="tarjeta tarjeta-tabla">
      <table className="matriz">
        <caption className="solo-lector">Entornos probados con reportes aprobados</caption>
        <thead>
          <tr>
            <th scope="col">Distribución</th>
            <th scope="col">Capa</th>
            <th scope="col">Edición · versión</th>
            <th scope="col">Perfil</th>
            <th scope="col">Resultado</th>
            <th scope="col">Pruebas</th>
            <th scope="col">FPS medido por la comunidad</th>
          </tr>
        </thead>
        <tbody>
          {entornos.map((e) => {
            const mia = e.distribucion_id === miDistribucion
            return (
              <tr key={e.clave} data-mia={mia || undefined}>
                <th scope="row">
                  {e.distribucion}
                  {mia && (
                    <>
                      {' '}
                      <Chip tono="azul" forma="punteado">tu distro</Chip>
                    </>
                  )}
                </th>
                <td className="dato">{e.capa}</td>
                <td className="dato">{e.lanzador} · {e.version_juego}</td>
                <td className="dato">{e.perfil ?? <span className="tenue">sin perfil</span>}</td>
                <td>
                  <Insignia etiqueta={estadoCompatibilidad[e.estado]} />
                  {e.estado === 'resultados_variables' && (
                    <div className="pequeno tenue">
                      {Resultado.literals.flatMap((r) => {
                        const n = e.por_resultado[r]
                        return n ? [`${n} ${resultado[r].texto.toLowerCase()}`] : []
                      }).join(' · ')}
                    </div>
                  )}
                  {e.fallos.length > 0 && <div><ChipsFallos fallos={e.fallos} /></div>}
                </td>
                <td className="dato">{e.pruebas} · {fecha(e.ultima_prueba)}</td>
                <td className="pequeno">
                  {e.fps.length === 0 ? (
                    <span className="dato tenue">no medido</span>
                  ) : (
                    e.fps.map((f) => (
                      <div key={`${f.resolucion}|${f.calidad}`}>
                        <b className="fps">{fps(f.promedio)} FPS</b>{' '}
                        <span className="dato tenue">
                          {f.resolucion} · {f.calidad} · {contar(f.mediciones, 'medición', 'mediciones')}
                        </span>
                      </div>
                    ))
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
