import { Effect } from 'effect'
import { NodeServices } from '@effect/platform-node'
import { baseActual, migrar, vaciarEsquema } from '../src/servidor/esquema/migraciones.ts'
import { PgTest } from './apoyo.ts'

export default async function preparar() {
  await Effect.gen(function* () {
    const nombre = yield* baseActual
    if (!nombre.endsWith('_test')) return yield* Effect.die(`DATABASE_URL_TEST apunta a ${nombre}; los tests solo borran bases *_test`)
    yield* vaciarEsquema
    yield* migrar
  }).pipe(Effect.provide([PgTest, NodeServices.layer]), Effect.runPromise)
}
