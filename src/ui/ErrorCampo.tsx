// The message under a form field, from useAccion's `errores`. Inputs point at it with
// aria-describedby={idError(campo)} so screen readers read the error with the field.
import type { Errores } from './useAccion.ts'

export const idError = (campo: string) => `error-${campo}`

export function ErrorCampo({ errores, campo }: { errores: Errores; campo: string }) {
  const mensaje = errores[campo]
  if (mensaje === undefined) return null
  return (
    <p className="error-campo" id={idError(campo)} role={campo === 'formulario' ? 'alert' : undefined}>
      {mensaje}
    </p>
  )
}
