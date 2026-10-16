import { useEffect, useState } from 'react'

type CopyState = 'listo' | 'copiado' | 'fallo'

const notice = {
  listo: '',
  copiado: 'Copiado al portapapeles.',
  fallo: 'No se pudo copiar. Selecciona el texto y cópialo a mano.',
} as const satisfies Record<CopyState, string>

export function CopyBox({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<CopyState>('listo')

  useEffect(() => {
    if (state === 'listo') return
    const t = setTimeout(() => setState('listo'), 2500)
    return () => clearTimeout(t)
  }, [state])

  // navigator.clipboard is undefined outside secure contexts; the outer promise turns that into `fallo`.
  const copy = () =>
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
      () => setState('copiado'),
      () => setState('fallo'),
    )

  return (
    <figure className="copy-box">
      <figcaption className="caption">{label}</figcaption>
      <div className="copy-box-body">
        {/* Focusable so a keyboard user can scroll a command wider than the box. */}
        <pre tabIndex={0}>
          <code>{text}</code>
        </pre>
        <button type="button" onClick={copy} aria-label={`Copiar ${label.toLowerCase()}`} data-state={state}>
          <span aria-hidden="true">{state === 'copiado' ? '✓ Copiado' : 'Copiar'}</span>
        </button>
      </div>
      <p className="small" role="status" data-tone={state === 'fallo' ? 'rojo' : 'verde'}>
        {notice[state]}
      </p>
    </figure>
  )
}
