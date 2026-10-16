import { type ReactNode, useState } from 'react'
import { FieldError, errorId } from './FieldError.tsx'
import type { FieldErrors } from './useAction.ts'

/** Schema's StringTree encoding of null. */
export const nullText = 'null'

export const fieldProps = (errors: FieldErrors, name: string) => ({
  name,
  id: name,
  'aria-invalid': errors[name] !== undefined,
  'aria-describedby': errorId(name),
})

export function Field({ errors, name, label, help, children }: { errors: FieldErrors; name: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="campo">
      <label htmlFor={name}>{label}</label>
      {help !== undefined && <p className="pequeno tenue ayuda">{help}</p>}
      {children}
      <FieldError errors={errors} field={name} />
    </div>
  )
}

export function OptionalGroup({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  return (
    <fieldset className="grupo-opcional">
      <legend>
        <label className="casilla">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} />
          {label}
        </label>
      </legend>
      {!enabled && <input type="hidden" name={name} value={nullText} />}
      <fieldset disabled={!enabled} hidden={!enabled} className="grupo-opcional-campos">
        {children}
      </fieldset>
    </fieldset>
  )
}
