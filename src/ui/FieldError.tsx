import type { Errores } from './useAction.ts'

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
