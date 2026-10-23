import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { FieldError } from '../../ui/FieldError.tsx'
import { fieldProps } from '../../ui/form.tsx'
import { localizedPath } from '../../ui/i18n/lang.ts'
import { useLang, useT } from '../../ui/i18n/messages.ts'
import { useAction } from '../../ui/useAction.ts'
import { SignIn, signIn, accountErrors } from '../-account.ts'
import { titled } from '../-head.ts'
import { ReturnTo } from '../-return-to.ts'

export const Route = createFileRoute('/$lang/entrar')({
  head: ({ params }) => titled(params.lang, (t) => t.header.signIn),
  validateSearch: ReturnTo,
  component: SignInPage,
})

function SignInPage() {
  const router = useRouter()
  const t = useT()
  const lang = useLang()
  const { volver: returnTo } = Route.useSearch()
  const r = useAction(SignIn, signIn, {
    onFailure: accountErrors,
    onComplete: async () => {
      await router.invalidate()
      await router.navigate({ href: localizedPath(lang, returnTo ?? '/') })
    },
  })
  return (
    <main className="wrapper narrow">
      <h1>{t.header.signIn}</h1>
      <p className="muted">{t.account.signIn.lede}</p>
      <form className="card form" {...r.form}>
        <FieldError errors={r.errors} field="form" />
        <label htmlFor="email">{t.account.email}</label>
        <input {...fieldProps(r.errors, 'email')} type="email" autoComplete="email" />
        <FieldError errors={r.errors} field="email" />
        <label htmlFor="password">{t.account.password}</label>
        <input {...fieldProps(r.errors, 'password')} type="password" autoComplete="current-password" />
        <FieldError errors={r.errors} field="password" />
        <button type="submit" disabled={r.submitting}>
          {r.submitting ? t.account.signIn.submitting : t.account.signIn.submit}
        </button>
      </form>
      <p>
        {t.account.signIn.noAccount((text) => (
          <Link to="/$lang/registro" params={{ lang }} search={returnTo ? { volver: returnTo } : {}}>
            {text}
          </Link>
        ))}
      </p>
    </main>
  )
}
