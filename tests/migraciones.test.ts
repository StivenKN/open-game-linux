import { expect, layer } from '@effect/vitest'
import { Effect, Exit } from 'effect'
import { SqlClient } from 'effect/sql'
import { vaciarEsquema } from '../src/servidor/esquema/migraciones.ts'
import { enRollback, PgTest } from './apoyo.ts'

layer(PgTest)('vaciarEsquema', (it) => {
  // In a rollback, so a regressed guard drops nothing for the other test files.
  it.effect('con el nombre de otra base no borra nada', () =>
    enRollback(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`CREATE TABLE centinela (id integer)`
        expect(Exit.isFailure(yield* Effect.exit(vaciarEsquema('opengame')))).toBe(true)
        expect(yield* sql`SELECT to_regclass('public.centinela') IS NOT NULL AS sigue`).toEqual([{ sigue: true }])
      }),
    ),
  )
})
