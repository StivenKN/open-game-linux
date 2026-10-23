// `$guideId_` keeps this page out of the guide page's layout (it renders on its own).
import { createFileRoute, Link, notFound, redirect, useNavigate } from '@tanstack/react-router'
import { GuideEdit } from '../../../domain/contributions.ts'
import { GuideId } from '../../../domain/ids.ts'
import { editGuideFn, guideEditOptionsFn } from '../../../fns/guides.ts'
import { FieldError } from '../../../ui/FieldError.tsx'
import { useLang, useT } from '../../../ui/i18n/messages.ts'
import { useAction } from '../../../ui/useAction.ts'
import { titled } from '../../-head.ts'
import { routeIdParser } from '../../-ids.ts'
import { returnHere } from '../../-return-to.ts'
import { GuideFields } from './-form.tsx'

const guideId = routeIdParser(GuideId)

export const Route = createFileRoute('/$lang/guias/$guideId_/editar')({
  params: { parse: (p) => ({ guideId: guideId(p.guideId) }), stringify: (p) => ({ guideId: String(p.guideId) }) },
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
    if (context.visitor.role === 'usuario') throw notFound()
  },
  loader: ({ params }) => guideEditOptionsFn({ data: params }),
  head: ({ loaderData, params }) => titled(params.lang, (t) => (loaderData ? t.guides.edit.title(loaderData.guide.title) : t.guides.editGuide)),
  component: EditGuidePage,
})

function EditGuidePage() {
  const { guide, distributions } = Route.useLoaderData()
  const navigate = useNavigate()
  const t = useT()
  const lang = useLang()
  const r = useAction(GuideEdit, editGuideFn, {
    onFailure: () => ({}),
    onComplete: ({ id }) => void navigate({ to: '/$lang/guias/$guideId', params: { lang, guideId: id } }),
  })
  return (
    <main className="wrapper">
      <div className="breadcrumbs">
        <Link to="/$lang/guias" params={{ lang }}>
          {t.header.guides}
        </Link>{' '}
        /{' '}
        <Link to="/$lang/guias/$guideId" params={{ lang, guideId: guide.id }}>
          {guide.title}
        </Link>{' '}
        / {t.guides.edit.crumb}
      </div>
      <h1>{t.guides.editGuide}</h1>
      <p className="muted">{t.guides.edit.intro(guide.revision)}</p>
      <form className="card form form-wide" {...r.form}>
        <FieldError errors={r.errors} field="form" />
        <input type="hidden" name="guide_id" value={guide.id} />
        <GuideFields errors={r.errors} distributions={distributions} guide={guide} />
        <p className="row">
          <button type="submit" disabled={r.submitting}>
            {t.guides.edit.save}
          </button>
          <Link to="/$lang/guias/$guideId" params={{ lang, guideId: guide.id }}>
            {t.guides.edit.cancel}
          </Link>
        </p>
      </form>
    </main>
  )
}
