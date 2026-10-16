import type { ReactNode } from 'react'
import type { Label, Tone } from './vocabulary.ts'

export function Badge({ label, shape = 'relleno' }: { label: Label; shape?: 'relleno' | 'punteado' }) {
  return (
    <span className="insignia" data-tono={label.tone} data-forma={shape}>
      <span aria-hidden="true">{label.icon}</span>
      {label.text}
    </span>
  )
}

export function Chip({ tone, shape = 'relleno', children }: { tone?: Tone; shape?: 'relleno' | 'punteado'; children: ReactNode }) {
  return (
    <span className="chip" data-tono={tone} data-forma={shape}>
      {children}
    </span>
  )
}
