import type { FalloContado } from '../../dominio/compatibilidad.ts'
import { contar } from '../formato.ts'
import { Chip } from '../Insignia.tsx'
import { tipoFallo } from '../vocabulario.ts'

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
