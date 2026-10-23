import { describe, expect, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { accountErrors } from '../src/routes/-account.ts'
import { en } from '../src/ui/i18n/en.ts'
import { es } from '../src/ui/i18n/es.ts'
import { auth, demoDomain } from '../src/server/auth.ts'
import { runtime } from '../src/server/runtime.ts'

const ErrorResponse = Schema.Struct({ code: Schema.String })
const AccountCount = Schema.Tuple([Schema.Struct({ n: Schema.Int })])

const accountsWith = (email: string) =>
  runtime.runPromise(
    Effect.flatMap(SqlClient.SqlClient, (s) => s`SELECT count(*)::int AS n FROM app_user WHERE email = ${email.toLowerCase()}`),
  ).then(Schema.decodeUnknownSync(AccountCount))

// The same handler /api/auth/$ hands every request to.
const signUpOverHttp = (email: string) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ name: 'colado', email, password: 'contrasena-de-prueba' }),
    }),
  )

describe('registro público', () => {
  it.each([`x@${demoDomain}`, 'X@Demo.OpenGame.TEST'])('rechaza %s con un error en el campo correo', async (email) => {
    const response = await signUpOverHttp(email)
    expect(response.status).toBe(400)
    const { code } = Schema.decodeUnknownSync(ErrorResponse)(await response.json())
    expect(accountErrors({ code }, es)).toEqual({ email: 'Ese dominio está reservado para los datos de ejemplo. Usa otro correo.' })
    expect(accountErrors({ code }, en)).toEqual({ email: 'That domain is reserved for the demo data. Use another email address.' })
    expect(await accountsWith(email)).toEqual([{ n: 0 }])
  })

  it('la semilla, que llama a auth.api sin petición, sí crea cuentas demo', async () => {
    const email = `semilla-${crypto.randomUUID()}@${demoDomain}`
    await auth.api.signUpEmail({ body: { name: 'demo_semilla', email, password: 'contrasena-de-prueba' } })
    expect(await accountsWith(email)).toEqual([{ n: 1 }])
  })
})

const signInOverHttp = (email: string, password: string) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password }),
    }),
  )

describe('entrar con una cuenta desactivada', () => {
  it('con la contraseña correcta dice por qué y no abre sesión; con otra, no revela nada', async () => {
    const email = `desactivada-${crypto.randomUUID()}@opengame.test`
    await auth.api.signUpEmail({ body: { name: 'desactivada', email, password: 'contrasena-de-prueba' } })
    await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (s) => s`UPDATE app_user SET active = false WHERE email = ${email}`))
    const codeOf = async (r: Response) => Schema.decodeUnknownSync(ErrorResponse)(await r.json()).code

    const right = await signInOverHttp(email, 'contrasena-de-prueba')
    expect([right.status, right.headers.getSetCookie()]).toEqual([403, []])
    expect(accountErrors({ code: await codeOf(right) }, es)).toEqual({ form: 'Esta cuenta está desactivada. Un administrador puede reactivarla.' })
    expect(await codeOf(await signInOverHttp(email, 'otra-contrasena'))).toBe('INVALID_EMAIL_OR_PASSWORD')
  })
})
