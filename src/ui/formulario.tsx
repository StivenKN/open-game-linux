// Shared pieces of every form that posts through useAccion. The conventions, in one place:
//
//   - Inputs are named after the input schema's Encoded keys, nested with brackets: `fallos[0][detalle]`.
//   - "None" for a nullable field is the text "null" (`nulo`), which is how Schema's StringTree writes
//     null (probes.md (a)). A select offers <option value={nulo}>; a nullable group uses GrupoOpcional.
//   - A number input that may stay blank decodes with dominio/ids.ts NumeroOpcional (blank -> null).
//   - A checkbox decodes with dominio/ids.ts Casilla: render it with value="true"; unchecked -> false.
import { type ReactNode, useState } from 'react'
import { ErrorCampo, idError } from './ErrorCampo.tsx'
import type { Errores } from './useAccion.ts'

/** Schema's StringTree encoding of null. */
export const nulo = 'null'

/** name, id and the aria wiring that ties an input to its ErrorCampo. Spread it on the input. */
export const campo = (errores: Errores, nombre: string) => ({
  name: nombre,
  id: nombre,
  'aria-invalid': errores[nombre] !== undefined,
  'aria-describedby': idError(nombre),
})

/** A label, its control and the control's error, stacked. `nombre` must match the control's name. */
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

/**
 * A nullable group of fields (a `Schema.NullOr(Struct)` such as `medicion`). While the box is off, the
 * group posts `nombre=null` and its inputs are disabled, so they post nothing. When on, the inputs post
 * `nombre[campo]` and the hidden null is gone.
 */
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
