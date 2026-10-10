// vitest globalSetup: once per run, empty the test database and migrate it.
// It drops the public schema, so it refuses any database whose name does not end in `_test`.
import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { NodeServices } from '@effect/platform-node'
import { migrar, vaciarEsquema } from '../src/servidor/esquema/migraciones.ts'
import { PgTest } from './apoyo.ts'

const BaseActual = Schema.Tuple([Schema.Struct({ nombre: Schema.String })])

export default async function preparar() {
  await Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [{ nombre }] = yield* Effect.flatMap(sql`SELECT current_database() AS nombre`, Schema.decodeUnknownEffect(BaseActual))
    if (!nombre.endsWith('_test')) return yield* Effect.die(`DATABASE_URL_TEST apunta a ${nombre}; los tests solo borran bases *_test`)
    yield* vaciarEsquema
    yield* migrar
  }).pipe(Effect.provide([PgTest, NodeServices.layer]), Effect.runPromise)
}
