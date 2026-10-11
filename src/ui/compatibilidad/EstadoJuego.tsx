import type { ResumenCompatibilidad } from '../../dominio/compatibilidad.ts'
import { contar, fecha } from '../formato.ts'
import { Chip, Insignia } from '../Insignia.tsx'
import { estadoCompatibilidad } from '../vocabulario.ts'
import { ChipsFallos } from './ChipsFallos.tsx'

export function EstadoJuego({ resumen, pendientes }: { resumen: ResumenCompatibilidad; pendientes: number }) {
  return (
    <section className="pila" aria-label="Estado de compatibilidad">
      <div className="rotulo">Estado calculado</div>
      <Insignia etiqueta={estadoCompatibilidad[resumen.estado]} grande />
      <p className="pequeno">
        Basado en <b>{resumen.pruebas}</b> {resumen.pruebas === 1 ? 'reporte aprobado' : 'reportes aprobados'}
        {resumen.ultima_prueba && <> · última prueba {fecha(resumen.ultima_prueba)}</>}
      </p>
      {pendientes > 0 && (
        <p className="pequeno tenue">{`+ ${contar(pendientes, 'pendiente', 'pendientes')} de revisión (no cuentan)`}</p>
      )}
      {resumen.estado === 'resultados_variables' && (
        <p className="pequeno">
          Depende del entorno:{' '}
          <span className="fila-chips">
            {resumen.entornos.map((e) => {
              const estado = estadoCompatibilidad[e.estado]
              return (
                <Chip key={e.clave} tono={estado.tono}>
                  <span aria-hidden="true">{estado.icono} </span>
                  {e.distribucion} · {e.capa}
                  <span className="solo-lector">: {estado.texto}</span>
                </Chip>
              )
            })}
          </span>
        </p>
      )}
      {resumen.fallos.length > 0 && (
        <p className="pequeno">
          Causas observadas: <ChipsFallos fallos={resumen.fallos} />
        </p>
      )}
    </section>
  )
}
