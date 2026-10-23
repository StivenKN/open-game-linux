// The fields of a guide, shared by the new and edit pages. Only reviewers reach either.
import { GuideStatus, GuideType } from '../../../domain/guides.ts'
import type { guideEditOptionsFn, guideOptionsFn } from '../../../fns/guides.ts'
import { Field, fieldProps, nullText } from '../../../ui/form.tsx'
import type { FieldErrors } from '../../../ui/useAction.ts'
import { guideStatus, guideType } from '../../../ui/vocabulary.ts'

type Distribution = Awaited<ReturnType<typeof guideOptionsFn>>['distributions'][number]
type Guide = Awaited<ReturnType<typeof guideEditOptionsFn>>['guide']

const statusHelp = {
  borrador: 'Solo la ven los revisores.',
  publicada: 'Aparece en Guías para todos.',
  archivada: 'Deja de verse en Guías; los revisores la siguen viendo.',
} as const satisfies Record<GuideStatus, string>

export function GuideFields({ errors, distributions, guide }: { errors: FieldErrors; distributions: ReadonlyArray<Distribution>; guide: Guide | null }) {
  return (
    <>
      <Field errors={errors} name="title" label="Título">
        <input {...fieldProps(errors, 'title')} defaultValue={guide?.title} />
      </Field>
      <div className="fields-2">
        <Field errors={errors} name="type" label="Tipo">
          <select {...fieldProps(errors, 'type')} defaultValue={guide?.type}>
            {GuideType.literals.map((t) => (
              <option key={t} value={t}>
                {guideType[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field errors={errors} name="distribution_id" label="Distribución">
          <select {...fieldProps(errors, 'distribution_id')} defaultValue={String(guide?.distribution_id ?? nullText)}>
            <option value={nullText}>Cualquier distribución</option>
            {distributions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        errors={errors}
        name="content"
        label="Contenido"
        help="Texto sin formato. Una línea en blanco separa párrafos; un salto de línea simple se respeta, útil para pasos numerados."
      >
        <textarea {...fieldProps(errors, 'content')} rows={14} defaultValue={guide?.content} />
      </Field>
      <fieldset className="group">
        <legend>Estado</legend>
        {GuideStatus.literals.map((s) => (
          <label key={s} className="checkbox">
            <input type="radio" name="status" value={s} defaultChecked={s === (guide?.status ?? 'borrador')} />
            {guideStatus[s]} <span className="small muted">{statusHelp[s]}</span>
          </label>
        ))}
      </fieldset>
    </>
  )
}
