import type { FieldErrors } from './useAction.ts'

export const errorId = (field: string) => `error-${field}`

export function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  const message = errors[field]
  if (message === undefined) return null
  return (
    <p className="field-error" id={errorId(field)} role={field === 'formulario' ? 'alert' : undefined}>
      {message}
    </p>
  )
}
