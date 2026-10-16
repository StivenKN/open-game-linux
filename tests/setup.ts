import { Effect } from 'effect'
import { NodeServices } from '@effect/platform-node'
import { migrate, dropSchema } from '../src/server/schema/migrations.ts'
import { PgTest } from './support.ts'

export default async function prepare() {
  const database = new URL(process.env.DATABASE_URL_TEST ?? 'postgres:').pathname.slice(1)
  if (!database.endsWith('_test')) throw new Error(`DATABASE_URL_TEST apunta a «${database}»; los tests solo borran bases *_test`)
  await Effect.andThen(dropSchema(database), migrate).pipe(Effect.provide([PgTest, NodeServices.layer]), Effect.runPromise)
}
