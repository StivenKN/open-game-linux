// Veredicto variant 1, "semáforo derivado": the colour is a computed state and always carries its
// evidence line. Pending reports are counted apart and never colour the badge. Plain React.
import type { ResumenCompatibilidad } from '../../dominio/compatibilidad.ts'
import { estadoCompatibilidad } from '../vocabulario.ts'

export function EstadoJuego({ resumen, pendientes }: { resumen: ResumenCompatibilidad; pendientes: number }) {
  const etiqueta = estadoCompatibilidad[resumen.estado]
  return (
    <section data-tono={etiqueta.tono}>
      <h2>{etiqueta.texto}</h2>
      <p>
        Basado en {resumen.pruebas} reportes aprobados
        {resumen.ultima_prueba && <> · última prueba {resumen.ultima_prueba.toLocaleDateString('es-CO')}</>}
      </p>
      {pendientes > 0 && <p>+ {pendientes} pendientes de revisión (no cuentan)</p>}
    </section>
  )
}
