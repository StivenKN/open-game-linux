// One Effect runtime per server process. Server fns reach it only through servidor/ejecutar.ts.
import { Config, ManagedRuntime } from 'effect'
import { PgClient } from '@effect/sql-pg'

/** Shared by the runtime, scripts (migrar, sembrar, rol) and tests (with a test DATABASE_URL). */
export const PgLive = PgClient.layerConfig({ url: Config.Redacted('DATABASE_URL'), maxConnections: Config.succeed(10) })

export const runtime = ManagedRuntime.make(PgLive)

// Gotcha 11: without this, every dev HMR reload leaks a pool.
if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose())
