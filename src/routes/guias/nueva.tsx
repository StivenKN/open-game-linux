import { createFileRoute, notFound, redirect, useNavigate } from '@tanstack/react-router'
import { NewGuide } from '../../domain/contributions.ts'
import { createGuideFn, guideOptionsFn } from '../../fns/guides.ts'
import { FieldError } from '../../ui/FieldError.tsx'
import { useAction } from '../../ui/useAction.ts'
import { returnHere } from '../-return-to.ts'
import { GuideFields } from './-form.tsx'

export const Route = createFileRoute('/guias/nueva')({
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
    if (context.visitor.role === 'usuario') throw notFound()
  },
  loader: () => guideOptionsFn(),
  head: () => ({ meta: [{ title: 'Nueva guía · OpenGame Linux' }] }),
  component: NewGuidePage,
})

function NewGuidePage() {
  const { distributions } = Route.useLoaderData()
  const navigate = useNavigate()
  const r = useAction(NewGuide, createGuideFn, {
    onFailure: () => ({}),
    onComplete: ({ id }) => void navigate({ to: '/guias/$guideId', params: { guideId: id } }),
  })
  return (
    <main className="wrapper">
      <p className="caption">Guías</p>
      <h1>Nueva guía</h1>
      <form className="card form form-wide" {...r.form}>
        <FieldError errors={r.errors} field="form" />
        <GuideFields errors={r.errors} distributions={distributions} guide={null} />
        <button type="submit" disabled={r.submitting}>
          Guardar la guía
        </button>
      </form>
    </main>
  )
}
