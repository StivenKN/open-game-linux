import type { FailureCount } from '../../domain/compatibility.ts'
import { contar } from '../format.ts'
import { Chip } from '../Badge.tsx'
import { tipoFallo } from '../vocabulary.ts'

export function ChipsFallos({ fallos }: { fallos: ReadonlyArray<FailureCount> }) {
  return (
    <span className="fila-chips">
      {fallos.map((f) => {
        const etiqueta = tipoFallo(f.code)
        return (
          <span key={f.code} title={contar(f.reports, 'reporte', 'reportes')}>
            <Chip tono={etiqueta.tono}>{etiqueta.texto}</Chip>
          </span>
        )
      })}
    </span>
  )
}
