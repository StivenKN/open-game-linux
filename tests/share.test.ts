import { expect, layer } from '@effect/vitest'
import { Effect, Option } from 'effect'
import { SqlClient } from 'effect/sql'
import { GameId } from '../src/domain/ids.ts'
import { gameCard } from '../src/server/queries/share.ts'
import { inRollback, idOf, onDay, PgTest } from './support.ts'

type Value = string | number | boolean | Date | null

const today = new Date('2026-10-15T00:00:00Z')

const scenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insert = (table: string, row: Record<string, Value>) => idOf(sql`INSERT INTO ${sql(table)} ${sql.insert(row)} RETURNING id`)
  // Ids and names no other test file uses: db files run in parallel, and two transactions inserting the same keys deadlock.
  // The author is a demo account, so the card carries the stamp once one of its reports counts.
  for (const [id, email, role] of [['sh_autor', 'sh_autor@demo.opengame.test', 'usuario'], ['sh_rita', 'sh_rita@opengame.test', 'revisor']])
    yield* sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES (${id}, ${id}, ${email}, false, ${role}, true)`
  const launcher = yield* insert('launcher', { name: 'sh_lanzador' })
  const game = GameId.make(yield* insert('game', { title: 'sh_juego', description: 'd' }))
  const edition = yield* insert('game_edition', { game_id: game, launcher_id: launcher })
  const distribution = yield* insert('distribution', { name: 'sh_distro', version: '1' })
  const layerVersion = yield* insert('layer_version', { family: 'Proton', variant: 'sh', version: '1.0' })
  const machine = yield* insert('machine', { user_id: 'sh_autor', alias: 'torre' })
  const diagnostic = yield* insert('diagnostic', {
    machine_id: machine,
    captured_at: new Date('2026-09-01T00:00:00Z'),
    operating_system: 'Linux',
    os_version: '6.8',
    distribution_id: distribution,
    architecture: 'x86_64',
    cpu_model: 'cpu',
    gpu_model: 'gpu',
    ram_mb: 8192,
    vulkan_support: 'desconocido',
  })
  const report = (outcome: string, review: Record<string, Value>) =>
    insert('report', {
      edition_id: edition,
      diagnostic_id: diagnostic,
      layer_version_id: layerVersion,
      game_version: '1.0',
      tested_at: new Date('2026-10-02T12:00:00Z'),
      outcome,
      observations: 'o',
      created_at: new Date('2026-10-03T00:00:00Z'),
      ...review,
    })
  const approved = {
    review_status: 'aprobado',
    reviewer_id: 'sh_rita',
    reviewed_at: new Date('2026-10-04T00:00:00Z'),
    review_reason: 'probado',
    review_evidence: 'captura',
  }
  return { game, report, approved }
})

layer(PgTest)('la insignia y la vista previa de un juego', (it) => {
  it.effect('cuentan solo lo aprobado, como su tarjeta del catálogo: ni lo pendiente ni lo retirado', () =>
    inRollback(
      Effect.gen(function* () {
        const e = yield* scenario
        yield* e.report('no_inicia', { review_status: 'pendiente' })
        yield* e.report('no_inicia', { ...e.approved, review_status: 'retirado' })
        const card = () => onDay(today)(gameCard(e.game))
        expect(yield* card()).toEqual(Option.some({ title: 'sh_juego', status: 'sin_evidencia', reports: 0, no_recent_confirmation: false, demo: false }))
        yield* e.report('funciona', e.approved)
        expect(yield* card()).toEqual(Option.some({ title: 'sh_juego', status: 'funciona', reports: 1, no_recent_confirmation: false, demo: true }))
      }),
    ))

  it.effect('un id que no nombra un juego no tiene tarjeta', () =>
    Effect.gen(function* () {
      expect(yield* gameCard(GameId.make(999999))).toEqual(Option.none())
    }),
  )
})
