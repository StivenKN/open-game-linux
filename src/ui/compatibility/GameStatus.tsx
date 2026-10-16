import type { CompatibilitySummary } from '../../domain/compatibility.ts'
import { Outcome } from '../../domain/literals.ts'
import { contar, fecha } from '../format.ts'
import { estadoCompatibilidad, resultado, significadoEstado } from '../vocabulary.ts'
import { ChipsFallos } from './FailureChips.tsx'

export function EstadoJuego({ resumen, pendientes }: { resumen: CompatibilitySummary; pendientes: number }) {
  const etiqueta = estadoCompatibilidad[resumen.status]
  const base = resumen.no_recent_confirmation ? resumen.test_count : resumen.recent_count
  // The environments the state counts, so the bar adds up to `base`.
  const contados = resumen.setups.filter((e) => e.recent_count > 0 || resumen.no_recent_confirmation)
  const reparto = Outcome.literals.flatMap((r) => {
    const n = contados.reduce((total, e) => total + (e.by_outcome[r] ?? 0), 0)
    return n > 0 ? [{ resultado: r, n }] : []
  })
  return (
    <section className="veredicto" data-tono={etiqueta.tono} aria-label="Estado de compatibilidad">
      <div className="veredicto-cabeza">
        <span className="veredicto-icono" data-tono={etiqueta.tono} data-forma="relleno" data-estado={resumen.status} aria-hidden="true">
          {etiqueta.icono}
        </span>
        <div>
          <p className="veredicto-estado">{etiqueta.texto}</p>
          <p className="veredicto-base">
            {resumen.last_tested ? (
              <>
                Según <b>{contar(base, 'reporte aprobado', 'reportes aprobados')}</b>
                {base < resumen.test_count && <> del último año ({resumen.test_count} en total)</>}. Última prueba el{' '}
                {fecha(resumen.last_tested)}.
              </>
            ) : (
              'Todavía no hay reportes aprobados.'
            )}
          </p>
        </div>
      </div>
      <p className="veredicto-significa">{significadoEstado[resumen.status]}</p>
      {resumen.no_recent_confirmation && (
        <p className="nota pequeno" data-tono="amarillo">
          Sin confirmación en el último año: todos los reportes aprobados tienen más de 12 meses.
        </p>
      )}
      {resumen.regressions.map((r) => (
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
      {resumen.failures.length > 0 && (
        <p className="pequeno">
          Causas observadas: <ChipsFallos fallos={resumen.failures} />
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
        El estado se calcula al consultar a partir de los reportes aprobados del último año, o de todos si ninguno es tan
        reciente. Un resultado favorable no garantiza que funcione en cualquier equipo.
      </p>
    </section>
  )
}
