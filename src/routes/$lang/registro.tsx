import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { FieldError } from '../../ui/FieldError.tsx'
import { fieldProps } from '../../ui/form.tsx'
import { localizedPath } from '../../ui/i18n/lang.ts'
import { useLang, useT } from '../../ui/i18n/messages.ts'
import { useAction } from '../../ui/useAction.ts'
import { accountErrors, SignUp, signUp } from '../-account.ts'
import { titled } from '../-head.ts'
import { ReturnTo } from '../-return-to.ts'

export const Route = createFileRoute('/$lang/registro')({
  head: ({ params }) => titled(params.lang, (t) => t.header.signUp),
  validateSearch: ReturnTo,
  component: SignUpPage,
})

function SignUpPage() {
  const router = useRouter()
  const t = useT()
  const lang = useLang()
  const { volver: returnTo } = Route.useSearch()
  const r = useAction(SignUp, signUp, {
    onFailure: accountErrors,
    onComplete: async () => {
      await router.invalidate()
      await router.navigate({ href: localizedPath(lang, returnTo ?? '/') })
    },
  })
  return (
    <main className="wrapper narrow">
      <h1>{t.header.signUp}</h1>
      <p className="muted">{t.account.signUp.lede}</p>
      <form className="card form" {...r.form}>
        <FieldError errors={r.errors} field="form" />
        <label htmlFor="alias">{t.account.signUp.alias}</label>
        <input {...fieldProps(r.errors, 'alias')} autoComplete="nickname" />
        <FieldError errors={r.errors} field="alias" />
        <label htmlFor="email">{t.account.email}</label>
        <input {...fieldProps(r.errors, 'email')} type="email" autoComplete="email" />
        <FieldError errors={r.errors} field="email" />
        <label htmlFor="password">{t.account.password}</label>
        <input {...fieldProps(r.errors, 'password')} type="password" autoComplete="new-password" />
        <FieldError errors={r.errors} field="password" />
        <button type="submit" disabled={r.submitting}>
          {r.submitting ? t.account.signUp.submitting : t.account.signUp.submit}
        </button>
      </form>
      <p>
        {t.account.signUp.haveAccount((text) => (
          <Link to="/$lang/entrar" params={{ lang }} search={returnTo ? { volver: returnTo } : {}}>
            {text}
          </Link>
        ))}
      </p>
    </main>
  )
}
