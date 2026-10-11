import { describe, expect, it } from '@effect/vitest'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { requestHandler } from '@tanstack/react-start/server'
import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { AprobacionBloqueada, ReglaIncumplida } from '../src/dominio/fallos.ts'
import type { Rol } from '../src/dominio/revision.ts'
import { auth, exigirRevisor, exigirUsuario } from '../src/servidor/auth.ts'
import { accion, leer } from '../src/servidor/ejecutar.ts'
import { runtime } from '../src/servidor/runtime.ts'

type Desenlace<A> = { readonly ok: true; readonly valor: A } | { readonly ok: false; readonly lanzado: unknown }

const enPeticion = <A>(cookie: string | null, fn: () => Promise<A>) =>
  new Promise<Desenlace<A>>((resolver) => {
    const peticion = new Request('http://localhost:3000/_serverFn/prueba', { headers: cookie === null ? {} : { cookie } })
    void requestHandler(async () => {
      await fn().then(
        (valor) => resolver({ ok: true, valor }),
        (lanzado: unknown) => resolver({ ok: false, lanzado }),
      )
      return new Response(null)
    })(peticion, {})
  })

const lanzado = <A>(d: Desenlace<A>): unknown => (d.ok ? undefined : d.lanzado)

const sql = <A>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) => runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, f))

const cuenta = async (rol: Rol, activo = true) => {
  const correo = `${rol}-${crypto.randomUUID()}@opengame.test`
  const { headers } = await auth.api.signUpEmail({
    body: { name: `demo_${rol}`, email: correo, password: 'contrasena-de-prueba' },
    returnHeaders: true,
  })
  await sql((s) => s`UPDATE usuario SET rol = ${rol}, activo = ${activo} WHERE correo = ${correo}`)
  const [galleta] = headers.getSetCookie()
  if (galleta === undefined) throw new Error('better-auth no devolvió la cookie de sesión')
  return galleta.split(';')[0] ?? ''
}

describe('leer', () => {
  it('sin sesión, exigirRevisor redirige a /entrar', async () => {
    const d = await enPeticion(null, () => leer(exigirRevisor))
    const e = lanzado(d)
    expect(isRedirect(e) && e.options.to).toBe('/entrar')
  })

  it('un usuario sin rol de revisor recibe notFound', async () => {
    const d = await enPeticion(await cuenta('usuario'), () => leer(exigirRevisor))
    expect(isNotFound(lanzado(d))).toBe(true)
  })

  it('un revisor pasa y recibe su propio usuario', async () => {
    const d = await enPeticion(await cuenta('revisor'), () => leer(exigirRevisor))
    expect(d.ok && { alias: d.valor.alias, rol: d.valor.rol }).toEqual({ alias: 'demo_revisor', rol: 'revisor' })
  })

  it('una cuenta desactivada cuenta como visitante sin sesión', async () => {
    const d = await enPeticion(await cuenta('administrador', false), () => leer(exigirUsuario))
    expect(isRedirect(lanzado(d))).toBe(true)
  })
})

describe('accion', () => {
  const lanzadores = (nombre: string) =>
    sql((s) => s`SELECT count(*)::int AS n FROM lanzador WHERE nombre = ${nombre}`).then(
      Schema.decodeUnknownSync(Schema.Tuple([Schema.Struct({ n: Schema.Int })])),
    )
  const insertar = (nombre: string) => Effect.flatMap(SqlClient.SqlClient, (s) => s`INSERT INTO lanzador (nombre) VALUES (${nombre})`)

  it('un fallo de dominio vuelve como dato y revierte lo que el programa ya escribió', async () => {
    const nombre = `revertido-${crypto.randomUUID()}`
    const programa = Effect.andThen(insertar(nombre), Effect.fail(new ReglaIncumplida({ regla: 'fallo_duplicado' })))
    const d = await enPeticion(null, () => accion(ReglaIncumplida, programa))
    expect(d).toEqual({ ok: true, valor: { ok: false, fallo: { _tag: 'ReglaIncumplida', regla: 'fallo_duplicado' } } })
    expect(await lanzadores(nombre)).toEqual([{ n: 0 }])
  })

  it('un programa que termina bien confirma lo que escribió', async () => {
    const nombre = `confirmado-${crypto.randomUUID()}`
    const d = await enPeticion(null, () => accion(ReglaIncumplida, Effect.as(insertar(nombre), 'hecho')))
    expect(d).toEqual({ ok: true, valor: { ok: true, valor: 'hecho' } })
    expect(await lanzadores(nombre)).toEqual([{ n: 1 }])
  })

  it('no compila si el programa puede fallar con algo que `fallos` no declara', () => {
    const sinDeclarar = () =>
      // @ts-expect-error AprobacionBloqueada is not listed in fallos, so the browser could not narrow it
      accion(ReglaIncumplida, Effect.fail(new AprobacionBloqueada({ bloqueos: ['reporte_incomparable'] })))
    expect(sinDeclarar).toBeTypeOf('function')
  })
})
