import { useEffect, useState } from 'react'

type EstadoCopia = 'listo' | 'copiado' | 'fallo'

const aviso = {
  listo: '',
  copiado: 'Copiado al portapapeles.',
  fallo: 'No se pudo copiar. Selecciona el texto y cópialo a mano.',
} as const satisfies Record<EstadoCopia, string>

export function CajaCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [estado, setEstado] = useState<EstadoCopia>('listo')

  useEffect(() => {
    if (estado === 'listo') return
    const t = setTimeout(() => setEstado('listo'), 2500)
    return () => clearTimeout(t)
  }, [estado])

  // navigator.clipboard is undefined outside secure contexts; the outer promise turns that into `fallo`.
  const copiar = () =>
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(texto))
      .then(
      () => setEstado('copiado'),
      () => setEstado('fallo'),
    )

  return (
    <figure className="caja-copiar">
      <figcaption className="rotulo">{etiqueta}</figcaption>
      <div className="caja-copiar-cuerpo">
        {/* Focusable so a keyboard user can scroll a command wider than the box. */}
        <pre tabIndex={0}>
          <code>{texto}</code>
        </pre>
        <button type="button" onClick={copiar} aria-label={`Copiar ${etiqueta.toLowerCase()}`} data-estado={estado}>
          <span aria-hidden="true">{estado === 'copiado' ? '✓ Copiado' : 'Copiar'}</span>
        </button>
      </div>
      <p className="pequeno" role="status" data-tono={estado === 'fallo' ? 'rojo' : 'verde'}>
        {aviso[estado]}
      </p>
    </figure>
  )
}
