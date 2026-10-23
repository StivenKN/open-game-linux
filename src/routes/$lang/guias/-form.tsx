// The fields of a guide, shared by the new and edit pages. Only reviewers reach either.
import { GuideStatus, GuideType } from '../../../domain/guides.ts'
import type { guideEditOptionsFn, guideOptionsFn } from '../../../fns/guides.ts'
import { Field, fieldProps, nullText } from '../../../ui/form.tsx'
import { useT } from '../../../ui/i18n/messages.ts'
import type { FieldErrors } from '../../../ui/useAction.ts'

type Distribution = Awaited<ReturnType<typeof guideOptionsFn>>['distributions'][number]
type Guide = Awaited<ReturnType<typeof guideEditOptionsFn>>['guide']

export function GuideFields({ errors, distributions, guide }: { errors: FieldErrors; distributions: ReadonlyArray<Distribution>; guide: Guide | null }) {
  const t = useT()
  const f = t.guides.form
  return (
    <>
      <Field errors={errors} name="title" label={f.title}>
        <input {...fieldProps(errors, 'title')} defaultValue={guide?.title} />
      </Field>
      <div className="fields-2">
        <Field errors={errors} name="type" label={f.type}>
          <select {...fieldProps(errors, 'type')} defaultValue={guide?.type}>
            {GuideType.literals.map((type) => (
              <option key={type} value={type}>
                {t.guideType[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field errors={errors} name="distribution_id" label={f.distribution}>
          <select {...fieldProps(errors, 'distribution_id')} defaultValue={String(guide?.distribution_id ?? nullText)}>
            <option value={nullText}>{f.anyDistribution}</option>
            {distributions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field errors={errors} name="content" label={f.content} help={f.contentHelp}>
        <textarea {...fieldProps(errors, 'content')} rows={14} defaultValue={guide?.content} />
      </Field>
      <fieldset className="group">
        <legend>{f.status}</legend>
        {GuideStatus.literals.map((s) => (
          <label key={s} className="checkbox">
            <input type="radio" name="status" value={s} defaultChecked={s === (guide?.status ?? 'borrador')} />
            {t.guideStatus[s]} <span className="small muted">{f.statusHelp[s]}</span>
          </label>
        ))}
      </fieldset>
    </>
  )
}
