import { describe, expect, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { erroresDeCuenta } from '../src/routes/-cuenta.ts'
import { auth, dominioDemo } from '../src/servidor/auth.ts'
import { runtime } from '../src/servidor/runtime.ts'

const RespuestaError = Schema.Struct({ code: Schema.String })
const Cuenta = Schema.Tuple([Schema.Struct({ n: Schema.Int })])

const cuentasCon = (correo: string) =>
  runtime.runPromise(
    Effect.flatMap(SqlClient.SqlClient, (s) => s`SELECT count(*)::int AS n FROM usuario WHERE correo = ${correo.toLowerCase()}`),
  ).then(Schema.decodeUnknownSync(Cuenta))

// The same handler /api/auth/$ hands every request to.
const registrarPorHttp = (email: string) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ name: 'colado', email, password: 'contrasena-de-prueba' }),
    }),
  )

describe('registro público', () => {
  it.each([`x@${dominioDemo}`, 'X@Demo.OpenGame.TEST'])('rechaza %s con un error en el campo correo', async (correo) => {
    const respuesta = await registrarPorHttp(correo)
    expect(respuesta.status).toBe(400)
    const { code } = Schema.decodeUnknownSync(RespuestaError)(await respuesta.json())
    expect(erroresDeCuenta({ codigo: code })).toEqual({ correo: 'Ese dominio está reservado para los datos de ejemplo. Usa otro correo.' })
    expect(await cuentasCon(correo)).toEqual([{ n: 0 }])
  })

  it('la semilla, que llama a auth.api sin petición, sí crea cuentas demo', async () => {
    const correo = `semilla-${crypto.randomUUID()}@${dominioDemo}`
    await auth.api.signUpEmail({ body: { name: 'demo_semilla', email: correo, password: 'contrasena-de-prueba' } })
    expect(await cuentasCon(correo)).toEqual([{ n: 1 }])
  })
})
