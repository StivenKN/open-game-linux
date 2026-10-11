import { Effect } from 'effect'
import { NodeServices } from '@effect/platform-node'
import { migrar, vaciarEsquema } from '../src/servidor/esquema/migraciones.ts'
import { PgTest } from './apoyo.ts'

export default async function preparar() {
  const base = new URL(process.env.DATABASE_URL_TEST ?? 'postgres:').pathname.slice(1)
  if (!base.endsWith('_test')) throw new Error(`DATABASE_URL_TEST apunta a «${base}»; los tests solo borran bases *_test`)
  await Effect.andThen(vaciarEsquema(base), migrar).pipe(Effect.provide([PgTest, NodeServices.layer]), Effect.runPromise)
}
