// One Effect runtime per server process. Server fns reach it only through servidor/ejecutar.ts.
import { Config, ManagedRuntime } from 'effect'
import { PgClient } from '@effect/sql-pg'

/** Shared by the runtime and the scripts (migrar, sembrar, rol). Tests build their own layer on DATABASE_URL_TEST. */
export const PgLive = PgClient.layerConfig({ url: Config.Redacted('DATABASE_URL'), maxConnections: Config.succeed(10) })

export const runtime = ManagedRuntime.make(PgLive)

// Without this, every dev HMR reload leaks a pool.
if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose())
