import { Config, ManagedRuntime } from 'effect'
import { PgClient } from '@effect/sql-pg'

export const PgLive = PgClient.layerConfig({ url: Config.Redacted('DATABASE_URL'), maxConnections: Config.succeed(10) })

export const runtime = ManagedRuntime.make(PgLive)

// Without this, every dev HMR reload leaks a pool.
if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose())
