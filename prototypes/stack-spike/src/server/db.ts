import { Layer, ManagedRuntime, Redacted } from 'effect'
import { PgClient } from '@effect/sql-pg'

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://spike:spike@localhost:55432/spike'

export const PgLive = PgClient.layer({ url: Redacted.make(DATABASE_URL) })

// One runtime per server process. Server functions call runtime.runPromise / runPromiseExit.
export const runtime = ManagedRuntime.make(Layer.mergeAll(PgLive))
