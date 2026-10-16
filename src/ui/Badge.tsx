import type { ReactNode } from 'react'
import type { Label, Tone } from './vocabulary.ts'

export function Badge({ label, shape = 'relleno' }: { label: Label; shape?: 'relleno' | 'punteado' }) {
  return (
    <span className="badge" data-tone={label.tone} data-shape={shape}>
      <span aria-hidden="true">{label.icon}</span>
      {label.text}
    </span>
  )
}

export function Chip({ tone, shape = 'relleno', children }: { tone?: Tone; shape?: 'relleno' | 'punteado'; children: ReactNode }) {
  return (
    <span className="chip" data-tone={tone} data-shape={shape}>
      {children}
    </span>
  )
}
