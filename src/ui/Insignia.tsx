import type { ReactNode } from 'react'
import type { Etiqueta, Tono } from './vocabulario.ts'

export function Insignia({ etiqueta, forma = 'relleno', grande = false }: { etiqueta: Etiqueta; forma?: 'relleno' | 'punteado'; grande?: boolean }) {
  return (
    <span className={grande ? 'insignia insignia-grande' : 'insignia'} data-tono={etiqueta.tono} data-forma={forma}>
      <span aria-hidden="true">{etiqueta.icono}</span>
      {etiqueta.texto}
    </span>
  )
}

export function Chip({ tono, forma = 'relleno', children }: { tono?: Tono; forma?: 'relleno' | 'punteado'; children: ReactNode }) {
  return (
    <span className="chip" data-tono={tono} data-forma={forma}>
      {children}
    </span>
  )
}
