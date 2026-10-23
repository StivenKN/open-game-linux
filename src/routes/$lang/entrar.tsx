import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { FieldError } from '../../ui/FieldError.tsx'
import { fieldProps } from '../../ui/form.tsx'
import { useAction } from '../../ui/useAction.ts'
import { SignIn, signIn, accountErrors } from '../-account.ts'
import { ReturnTo } from '../-return-to.ts'

export const Route = createFileRoute('/$lang/entrar')({
  head: () => ({ meta: [{ title: 'Entrar · OpenGame Linux' }] }),
  validateSearch: ReturnTo,
  component: SignInPage,
})

function SignInPage() {
  const router = useRouter()
  const { volver: returnTo } = Route.useSearch()
  const r = useAction(SignIn, signIn, {
    onFailure: accountErrors,
    onComplete: async () => {
      await router.invalidate()
      await router.navigate({ href: returnTo ?? '/' })
    },
  })
  return (
    <main className="wrapper narrow">
      <h1>Entrar</h1>
      <p className="muted">Entra para guardar tu diagnóstico y publicar reportes.</p>
      <form className="card form" {...r.form}>
        <FieldError errors={r.errors} field="form" />
        <label htmlFor="email">Correo</label>
        <input {...fieldProps(r.errors, 'email')} type="email" autoComplete="email" />
        <FieldError errors={r.errors} field="email" />
        <label htmlFor="password">Contraseña</label>
        <input {...fieldProps(r.errors, 'password')} type="password" autoComplete="current-password" />
        <FieldError errors={r.errors} field="password" />
        <button type="submit" disabled={r.submitting}>
          {r.submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p>
        ¿No tienes cuenta? <Link to="/registro" search={returnTo ? { volver: returnTo } : {}}>Crea una</Link>.
      </p>
    </main>
  )
}
