import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { FieldError } from '../../ui/FieldError.tsx'
import { fieldProps } from '../../ui/form.tsx'
import { useAction } from '../../ui/useAction.ts'
import { accountErrors, SignUp, signUp } from '../-account.ts'
import { ReturnTo } from '../-return-to.ts'

export const Route = createFileRoute('/$lang/registro')({
  head: () => ({ meta: [{ title: 'Crear cuenta · OpenGame Linux' }] }),
  validateSearch: ReturnTo,
  component: SignUpPage,
})

function SignUpPage() {
  const router = useRouter()
  const { volver: returnTo } = Route.useSearch()
  const r = useAction(SignUp, signUp, {
    onFailure: accountErrors,
    onComplete: async () => {
      await router.invalidate()
      await router.navigate({ href: returnTo ?? '/' })
    },
  })
  return (
    <main className="wrapper narrow">
      <h1>Crear cuenta</h1>
      <p className="muted">Los demás solo verán tu alias. Tu correo no se muestra en ningún aporte.</p>
      <form className="card form" {...r.form}>
        <FieldError errors={r.errors} field="form" />
        <label htmlFor="alias">Alias</label>
        <input {...fieldProps(r.errors, 'alias')} autoComplete="nickname" />
        <FieldError errors={r.errors} field="alias" />
        <label htmlFor="email">Correo</label>
        <input {...fieldProps(r.errors, 'email')} type="email" autoComplete="email" />
        <FieldError errors={r.errors} field="email" />
        <label htmlFor="password">Contraseña</label>
        <input {...fieldProps(r.errors, 'password')} type="password" autoComplete="new-password" />
        <FieldError errors={r.errors} field="password" />
        <button type="submit" disabled={r.submitting}>
          {r.submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
      <p>
        ¿Ya tienes cuenta? <Link to="/entrar" search={returnTo ? { volver: returnTo } : {}}>Entra</Link>.
      </p>
    </main>
  )
}
