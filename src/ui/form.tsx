import { type ReactNode, useState } from 'react'
import { FieldError, errorId } from './FieldError.tsx'
import type { FieldErrors } from './useAction.ts'

/** Schema's StringTree encoding of null. */
export const nullText = 'null'

/** The hardware choices of the manual diagnosis, also the minimums a profile can declare. */
export const ramGb = [2, 3, 4, 6, 8, 12, 16, 24, 32, 64]
export const vramMb = [512, 1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384]
export const vulkanVersions = ['1.0', '1.1', '1.2', '1.3', '1.4']

export const fieldProps = (errors: FieldErrors, name: string) => ({
  name,
  id: name,
  'aria-invalid': errors[name] !== undefined,
  'aria-describedby': errorId(name),
})

export function Field({ errors, name, label, help, children }: { errors: FieldErrors; name: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {help !== undefined && <p className="small muted help">{help}</p>}
      {children}
      <FieldError errors={errors} field={name} />
    </div>
  )
}

export function OptionalGroup({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  return (
    <fieldset className="optional-group">
      <legend>
        <label className="checkbox">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} />
          {label}
        </label>
      </legend>
      {!enabled && <input type="hidden" name={name} value={nullText} />}
      <fieldset disabled={!enabled} hidden={!enabled} className="optional-group-fields">
        {children}
      </fieldset>
    </fieldset>
  )
}
