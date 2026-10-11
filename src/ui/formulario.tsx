import { type ReactNode, useState } from 'react'
import { ErrorCampo, idError } from './ErrorCampo.tsx'
import type { Errores } from './useAccion.ts'

/** Schema's StringTree encoding of null. */
export const nulo = 'null'

export const campo = (errores: Errores, nombre: string) => ({
  name: nombre,
  id: nombre,
  'aria-invalid': errores[nombre] !== undefined,
  'aria-describedby': idError(nombre),
})

export function Campo({ errores, nombre, etiqueta, ayuda, children }: { errores: Errores; nombre: string; etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="campo">
      <label htmlFor={nombre}>{etiqueta}</label>
      {ayuda !== undefined && <p className="pequeno tenue ayuda">{ayuda}</p>}
      {children}
      <ErrorCampo errores={errores} campo={nombre} />
    </div>
  )
}

export function GrupoOpcional({ nombre, etiqueta, children }: { nombre: string; etiqueta: string; children: ReactNode }) {
  const [activo, setActivo] = useState(false)
  return (
    <fieldset className="grupo-opcional">
      <legend>
        <label className="casilla">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.currentTarget.checked)} />
          {etiqueta}
        </label>
      </legend>
      {!activo && <input type="hidden" name={nombre} value={nulo} />}
      <fieldset disabled={!activo} hidden={!activo} className="grupo-opcional-campos">
        {children}
      </fieldset>
    </fieldset>
  )
}
