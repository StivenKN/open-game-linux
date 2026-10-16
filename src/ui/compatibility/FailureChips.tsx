import type { FalloContado } from '../../domain/compatibility.ts'
import { contar } from '../format.ts'
import { Chip } from '../Badge.tsx'
import { tipoFallo } from '../vocabulary.ts'

export function ChipsFallos({ fallos }: { fallos: ReadonlyArray<FalloContado> }) {
  return (
    <span className="fila-chips">
      {fallos.map((f) => {
        const etiqueta = tipoFallo(f.codigo)
        return (
          <span key={f.codigo} title={contar(f.reportes, 'reporte', 'reportes')}>
            <Chip tono={etiqueta.tono}>{etiqueta.texto}</Chip>
          </span>
        )
      })}
    </span>
  )
}
