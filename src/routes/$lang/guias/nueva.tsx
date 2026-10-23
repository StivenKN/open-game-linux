import { createFileRoute, notFound, redirect, useNavigate } from '@tanstack/react-router'
import { NewGuide } from '../../../domain/contributions.ts'
import { createGuideFn, guideOptionsFn } from '../../../fns/guides.ts'
import { FieldError } from '../../../ui/FieldError.tsx'
import { useLang, useT } from '../../../ui/i18n/messages.ts'
import { useAction } from '../../../ui/useAction.ts'
import { titled } from '../../-head.ts'
import { returnHere } from '../../-return-to.ts'
import { GuideFields } from './-form.tsx'

export const Route = createFileRoute('/$lang/guias/nueva')({
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
    if (context.visitor.role === 'usuario') throw notFound()
  },
  loader: () => guideOptionsFn(),
  head: ({ params }) => titled(params.lang, (t) => t.guides.newGuide),
  component: NewGuidePage,
})

function NewGuidePage() {
  const { distributions } = Route.useLoaderData()
  const navigate = useNavigate()
  const t = useT()
  const lang = useLang()
  const r = useAction(NewGuide, createGuideFn, {
    onFailure: () => ({}),
    onComplete: ({ id }) => void navigate({ to: '/$lang/guias/$guideId', params: { lang, guideId: id } }),
  })
  return (
    <main className="wrapper">
      <p className="caption">{t.header.guides}</p>
      <h1>{t.guides.newGuide}</h1>
      <form className="card form form-wide" {...r.form}>
        <FieldError errors={r.errors} field="form" />
        <GuideFields errors={r.errors} distributions={distributions} guide={null} />
        <button type="submit" disabled={r.submitting}>
          {t.guides.create.save}
        </button>
      </form>
    </main>
  )
}
