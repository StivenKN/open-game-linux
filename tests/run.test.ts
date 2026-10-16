import { describe, expect, it } from '@effect/vitest'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { createServerEntry } from '@tanstack/react-start/server'
import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { ApprovalBlocked, RuleViolated } from '../src/domain/errors.ts'
import type { Role } from '../src/domain/review.ts'
import { auth, requireReviewer, requireUser } from '../src/server/auth.ts'
import { runAction, runRead } from '../src/server/run.ts'
import { runtime } from '../src/server/runtime.ts'

type Settled<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly thrown: unknown }

const inRequest = <A>(cookie: string | null, fn: () => Promise<A>) =>
  new Promise<Settled<A>>((resolve) => {
    const request = new Request('http://localhost:3000/_serverFn/prueba', { headers: cookie === null ? {} : { cookie } })
    void createServerEntry({
      fetch: async () => {
        await fn().then(
          (value) => resolve({ ok: true, value }),
          (thrown: unknown) => resolve({ ok: false, thrown }),
        )
        return new Response(null)
      },
    }).fetch(request, {})
  })

const thrownOf = <A>(d: Settled<A>): unknown => (d.ok ? undefined : d.thrown)

const sql = <A>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) => runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, f))

const sessionCookie = async (role: Role, active = true) => {
  const email = `${role}-${crypto.randomUUID()}@opengame.test`
  const { headers } = await auth.api.signUpEmail({
    body: { name: `demo_${role}`, email, password: 'contrasena-de-prueba' },
    returnHeaders: true,
  })
  await sql((s) => s`UPDATE usuario SET rol = ${role}, activo = ${active} WHERE correo = ${email}`)
  const [cookie] = headers.getSetCookie()
  if (cookie === undefined) throw new Error('better-auth returned no session cookie')
  return cookie.split(';')[0] ?? ''
}

describe('runRead', () => {
  it('without a session, requireReviewer redirects to /entrar', async () => {
    const d = await inRequest(null, () => runRead(requireReviewer))
    const e = thrownOf(d)
    expect(isRedirect(e) && e.options.to).toBe('/entrar')
  })

  it('un usuario sin rol de revisor recibe notFound', async () => {
    const d = await inRequest(await sessionCookie('usuario'), () => runRead(requireReviewer))
    expect(isNotFound(thrownOf(d))).toBe(true)
  })

  it('un revisor pasa y recibe su propio usuario', async () => {
    const d = await inRequest(await sessionCookie('revisor'), () => runRead(requireReviewer))
    expect(d.ok && { alias: d.value.alias, rol: d.value.role }).toEqual({ alias: 'demo_revisor', rol: 'revisor' })
  })

  it('una cuenta desactivada cuenta como visitante sin sesión', async () => {
    const d = await inRequest(await sessionCookie('administrador', false), () => runRead(requireUser))
    expect(isRedirect(thrownOf(d))).toBe(true)
  })
})

describe('runAction', () => {
  const countLaunchers = (name: string) =>
    sql((s) => s`SELECT count(*)::int AS n FROM lanzador WHERE nombre = ${name}`).then(
      Schema.decodeUnknownSync(Schema.Tuple([Schema.Struct({ n: Schema.Int })])),
    )
  const insertLauncher = (name: string) => Effect.flatMap(SqlClient.SqlClient, (s) => s`INSERT INTO lanzador (nombre) VALUES (${name})`)

  it('un fallo de dominio vuelve como dato y revierte lo que el programa ya escribió', async () => {
    const name = `revertido-${crypto.randomUUID()}`
    const program = Effect.andThen(insertLauncher(name), Effect.fail(new RuleViolated({ rule: 'fallo_duplicado' })))
    const d = await inRequest(null, () => runAction(RuleViolated, program))
    expect(d).toEqual({ ok: true, value: { ok: false, error: { _tag: 'ReglaIncumplida', rule: 'fallo_duplicado' } } })
    expect(await countLaunchers(name)).toEqual([{ n: 0 }])
  })

  it('un programa que termina bien confirma lo que escribió', async () => {
    const name = `confirmado-${crypto.randomUUID()}`
    const d = await inRequest(null, () => runAction(RuleViolated, Effect.as(insertLauncher(name), 'hecho')))
    expect(d).toEqual({ ok: true, value: { ok: true, value: 'hecho' } })
    expect(await countLaunchers(name)).toEqual([{ n: 1 }])
  })

  it('no compila si el programa puede fallar con algo que `fallos` no declara', () => {
    const undeclared = () =>
      // @ts-expect-error AprobacionBloqueada is not listed in fallos, so the browser could not narrow it
      runAction(RuleViolated, Effect.fail(new ApprovalBlocked({ blockers: ['reporte_incomparable'] })))
    expect(undeclared).toBeTypeOf('function')
  })
})
