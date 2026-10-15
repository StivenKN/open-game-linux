import type { ResumenCompatibilidad } from '../../dominio/compatibilidad.ts'
import { Resultado } from '../../dominio/literales.ts'
import { contar, fecha } from '../formato.ts'
import { estadoCompatibilidad, resultado, significadoEstado } from '../vocabulario.ts'
import { ChipsFallos } from './ChipsFallos.tsx'

export function EstadoJuego({ resumen, pendientes }: { resumen: ResumenCompatibilidad; pendientes: number }) {
  const etiqueta = estadoCompatibilidad[resumen.estado]
  const base = resumen.sin_confirmacion_reciente ? resumen.pruebas : resumen.vigentes
  // The environments the state counts, so the bar adds up to `base`.
  const contados = resumen.entornos.filter((e) => e.vigentes > 0 || resumen.sin_confirmacion_reciente)
  const reparto = Resultado.literals.flatMap((r) => {
    const n = contados.reduce((total, e) => total + (e.por_resultado[r] ?? 0), 0)
    return n > 0 ? [{ resultado: r, n }] : []
  })
  return (
    <section className="veredicto" data-tono={etiqueta.tono} aria-label="Estado de compatibilidad">
      <div className="veredicto-cabeza">
        <span className="veredicto-icono" data-tono={etiqueta.tono} data-forma="relleno" data-estado={resumen.estado} aria-hidden="true">
          {etiqueta.icono}
        </span>
        <div>
          <p className="veredicto-estado">{etiqueta.texto}</p>
          <p className="veredicto-base">
            {resumen.ultima_prueba ? (
              <>
                Según <b>{contar(base, 'reporte aprobado', 'reportes aprobados')}</b>
                {base < resumen.pruebas && <> del último año ({resumen.pruebas} en total)</>}. Última prueba el{' '}
                {fecha(resumen.ultima_prueba)}.
              </>
            ) : (
              'Todavía no hay reportes aprobados.'
            )}
          </p>
        </div>
      </div>
      <p className="veredicto-significa">{significadoEstado[resumen.estado]}</p>
      {resumen.sin_confirmacion_reciente && (
        <p className="nota pequeno" data-tono="amarillo">
          Sin confirmación en el último año: todos los reportes aprobados tienen más de 12 meses.
        </p>
      )}
      {resumen.regresiones.map((r) => (
        <p key={r.edicion_id} className="nota pequeno" data-tono="rojo">
          <b>Dejó de funcionar</b> en {r.lanzador}: la prueba más reciente ({fecha(r.fecha_prueba)}, versión {r.version_juego},{' '}
          {r.capa}) dio «{resultado[r.resultado].texto}» después de reportes que funcionaban.
        </p>
      ))}
      {reparto.length > 0 && (
        <>
          <div className="reparto" aria-hidden="true">
            {reparto.map((x) => (
              <span key={x.resultado} data-tono={resultado[x.resultado].tono} data-forma="relleno" style={{ flexGrow: x.n }} />
            ))}
          </div>
          <ul className="leyenda-reparto" aria-label="Resultados aprobados">
            {reparto.map((x) => (
              <li key={x.resultado}>
                <i data-tono={resultado[x.resultado].tono} data-forma="relleno" />
                {x.n} {resultado[x.resultado].texto.toLowerCase()}
              </li>
            ))}
          </ul>
        </>
      )}
      {resumen.fallos.length > 0 && (
        <p className="pequeno">
          Causas observadas: <ChipsFallos fallos={resumen.fallos} />
        </p>
      )}
      {pendientes > 0 && (
        <p className="pendiente">
          {pendientes === 1
            ? '1 reporte más espera revisión y todavía no cuenta.'
            : `${pendientes} reportes más esperan revisión y todavía no cuentan.`}
        </p>
      )}
      <p className="pequeno tenue">
        El estado se calcula al consultar a partir de reportes aprobados. Un resultado favorable no garantiza que funcione en
        cualquier equipo.
      </p>
    </section>
  )
}
