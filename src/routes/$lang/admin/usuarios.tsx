import { createFileRoute, notFound, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { AccessChange } from '../../../domain/accounts.ts'
import { Role } from '../../../domain/review.ts'
import { accountsFn, changeAccessFn } from '../../../fns/accounts.ts'
import { Chip } from '../../../ui/Badge.tsx'
import { FieldError } from '../../../ui/FieldError.tsx'
import { useLang, useT } from '../../../ui/i18n/messages.ts'
import { ruleErrors, useAction } from '../../../ui/useAction.ts'
import { titled } from '../../-head.ts'
import { returnHere } from '../../-return-to.ts'

// The router JSON-parses each query value, so an alias typed as `?q=2` arrives as the number 2. The key is
// always returned: router-core spreads the validated search over the raw query (routes/-return-to.ts).
const searchText = (q: unknown) => (typeof q === 'string' ? q : typeof q === 'number' || typeof q === 'boolean' ? String(q) : undefined)

export const Route = createFileRoute('/$lang/admin/usuarios')({
  validateSearch: (search: Record<string, unknown>): { readonly q?: string | undefined } => ({ q: searchText(search.q) }),
  beforeLoad: ({ context, location, params }) => {
    if (context.visitor === null) throw redirect({ to: '/$lang/entrar', params: { lang: params.lang }, search: returnHere(location) })
    if (context.visitor.role !== 'administrador') throw notFound()
  },
  loaderDeps: ({ search }) => ({ q: search.q?.trim() ?? '' }),
  loader: ({ deps }) => accountsFn({ data: deps }),
  head: ({ params }) => titled(params.lang, (t) => t.header.users),
  component: UsersPage,
})

type Account = Awaited<ReturnType<typeof accountsFn>>['accounts'][number]

function UsersPage() {
  const { accounts, more } = Route.useLoaderData()
  const { q } = Route.useLoaderDeps()
  const navigate = useNavigate({ from: '/$lang/admin/usuarios' })
  const t = useT()
  const lang = useLang()
  const u = t.account.users
  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const text = new FormData(e.currentTarget).get('q')
    void navigate({ search: typeof text === 'string' && text.trim() !== '' ? { q: text.trim() } : {} })
  }
  return (
    <main className="wrapper stack">
      <h1>{t.header.users}</h1>
      <p className="muted">{u.lede}</p>
      <form role="search" className="row" method="get" action={`/${lang}/admin/usuarios`} onSubmit={onSearch}>
        <label htmlFor="q" className="sr-only">
          {u.searchLabel}
        </label>
        <input id="q" name="q" type="search" placeholder={u.searchPlaceholder} defaultValue={q} key={q} />
        <button type="submit">{u.search}</button>
      </form>
      {accounts.length === 0 ? (
        <p className="card">{q === '' ? u.none : u.noMatch(q)}</p>
      ) : (
        <ul className="card-list">
          {accounts.map((a) => (
            <AccountItem key={a.id} account={a} />
          ))}
        </ul>
      )}
      {more && <p className="small muted">{u.more(accounts.length)}</p>}
    </main>
  )
}

function AccountItem({ account: a }: { account: Account }) {
  const router = useRouter()
  const t = useT()
  const u = t.account.users
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
        <Chip>{t.role[a.role]}</Chip>
        {!a.active && <Chip tone="rojo">{u.deactivated}</Chip>}
        {a.is_self && <Chip tone="azul">{u.yours}</Chip>}
        <span className="small muted">{u.since(t.date(a.created_at))}</span>
      </p>
      {a.is_self ? (
        <p className="small muted">{u.self}</p>
      ) : (
        <form className="row" {...r.form}>
          <input type="hidden" name="user_id" value={a.id} />
          <label className="row" htmlFor={`rol-${a.id}`}>
            {u.role}
            <select id={`rol-${a.id}`} name="role" defaultValue={a.role}>
              {Role.literals.map((l) => (
                <option key={l} value={l}>
                  {t.role[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" name="active" value="true" defaultChecked={a.active} />
            {u.active}
          </label>
          <button type="submit" className="button-secondary" disabled={r.submitting}>
            {r.submitting ? u.saving : u.save}
          </button>
        </form>
      )}
      <FieldError errors={r.errors} field="form" />
      {saved !== null && (
        <p role="status" className="small">
          {saved ? u.saved : u.unchanged}
        </p>
      )}
    </li>
  )
}
