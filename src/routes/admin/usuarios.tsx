import { createFileRoute, notFound, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AccessChange } from '../../domain/accounts.ts'
import { Role } from '../../domain/review.ts'
import { accountsFn, changeAccessFn } from '../../fns/accounts.ts'
import { Chip } from '../../ui/Badge.tsx'
import { FieldError } from '../../ui/FieldError.tsx'
import { date } from '../../ui/format.ts'
import { ruleErrors, useAction } from '../../ui/useAction.ts'
import { role } from '../../ui/vocabulary.ts'
import { returnHere } from '../-return-to.ts'

// The router JSON-parses each query value, so an alias typed as `?q=2` arrives as the number 2. The key is
// always returned: router-core spreads the validated search over the raw query (routes/-return-to.ts).
const searchText = (q: unknown) => (typeof q === 'string' ? q : typeof q === 'number' || typeof q === 'boolean' ? String(q) : undefined)

export const Route = createFileRoute('/admin/usuarios')({
  validateSearch: (search: Record<string, unknown>): { readonly q?: string | undefined } => ({ q: searchText(search.q) }),
  beforeLoad: ({ context, location }) => {
    if (context.visitor === null) throw redirect({ to: '/entrar', search: returnHere(location) })
    if (context.visitor.role !== 'administrador') throw notFound()
  },
  loaderDeps: ({ search }) => ({ q: search.q?.trim() ?? '' }),
  loader: ({ deps }) => accountsFn({ data: deps }),
  head: () => ({ meta: [{ title: 'Usuarios · OpenGame Linux' }] }),
  component: UsersPage,
})

type Account = Awaited<ReturnType<typeof accountsFn>>['accounts'][number]

function UsersPage() {
  const { accounts, more } = Route.useLoaderData()
  const { q } = Route.useLoaderDeps()
  return (
    <main className="wrapper stack">
      <h1>Usuarios</h1>
      <p className="muted">
        Un revisor aprueba aportes; un administrador además gestiona los roles. Una cuenta desactivada navega como invitada: no puede
        reportar, guardar diagnósticos ni revisar. Cada cambio se aplica en la siguiente página que abra esa cuenta.
      </p>
      <form role="search" className="row" method="get" action="/admin/usuarios">
        <label htmlFor="q" className="sr-only">
          Buscar por alias o correo
        </label>
        <input id="q" name="q" type="search" placeholder="Alias o correo" defaultValue={q} key={q} />
        <button type="submit">Buscar</button>
      </form>
      {accounts.length === 0 ? (
        <p className="card">{q === '' ? 'Todavía no hay cuentas.' : `Ninguna cuenta tiene «${q}» en su alias o correo.`}</p>
      ) : (
        <ul className="card-list">
          {accounts.map((a) => (
            <AccountItem key={a.id} account={a} />
          ))}
        </ul>
      )}
      {more && <p className="small muted">Se muestran las {accounts.length} cuentas más recientes. Busca por alias o correo para encontrar otra.</p>}
    </main>
  )
}

function AccountItem({ account: a }: { account: Account }) {
  const router = useRouter()
  const [saved, setSaved] = useState<boolean | null>(null)
  const r = useAction(AccessChange, changeAccessFn, {
    onFailure: ruleErrors,
    onComplete: async (c) => {
      setSaved(c.changed)
      await router.invalidate()
    },
  })
  const headingId = `cuenta-${a.id}`
  return (
    <li className="card stack" aria-labelledby={headingId}>
      <p className="row">
        <strong id={headingId}>{a.alias}</strong>
        <span className="datum muted">{a.email}</span>
        <Chip>{role[a.role]}</Chip>
        {!a.active && <Chip tone="rojo">Desactivada</Chip>}
        {a.is_self && <Chip tone="azul">Tu cuenta</Chip>}
        <span className="small muted">desde el {date(a.created_at)}</span>
      </p>
      {a.is_self ? (
        <p className="small muted">Es tu cuenta: otro administrador debe cambiar tu rol o desactivarla.</p>
      ) : (
        <form className="row" {...r.form}>
          <input type="hidden" name="user_id" value={a.id} />
          <label className="row" htmlFor={`rol-${a.id}`}>
            Rol
            <select id={`rol-${a.id}`} name="role" defaultValue={a.role}>
              {Role.literals.map((l) => (
                <option key={l} value={l}>
                  {role[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" name="active" value="true" defaultChecked={a.active} />
            Cuenta activa
          </label>
          <button type="submit" className="button-secondary" disabled={r.submitting}>
            {r.submitting ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
      <FieldError errors={r.errors} field="form" />
      {saved !== null && (
        <p role="status" className="small">
          {saved ? 'Guardado.' : 'No había nada que cambiar.'}
        </p>
      )}
    </li>
  )
}
