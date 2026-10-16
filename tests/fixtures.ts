import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'
import type { Role } from '../src/domain/review.ts'
import { idOf } from './support.ts'

export const seed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertUser = (id: string, role: Role) =>
    sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES (${id}, ${id}, ${`${id}@demo.opengame.test`}, false, ${role}, true)`
  yield* insertUser('autor', 'usuario')
  yield* insertUser('revisor', 'revisor')
  const launcher = yield* idOf(sql`INSERT INTO launcher (name) VALUES ('Steam') RETURNING id`)
  const insertEdition = (title: string) =>
    Effect.flatMap(idOf(sql`INSERT INTO game (title, description) VALUES (${title}, 'd') RETURNING id`), (game) =>
      idOf(sql`INSERT INTO game_edition (game_id, launcher_id) VALUES (${game}, ${launcher}) RETURNING id`),
    )
  const ed = yield* insertEdition('Juego')
  const ed2 = yield* insertEdition('Otro juego')
  const dist = yield* idOf(sql`INSERT INTO distribution (name, version) VALUES ('Linux Mint', '22') RETURNING id`)
  const layerVersion = yield* idOf(sql`INSERT INTO layer_version (family, variant, version) VALUES ('Proton', 'Valve', '9.0-4') RETURNING id`)
  const machine = yield* idOf(sql`INSERT INTO machine (user_id, alias) VALUES ('autor', 'portátil') RETURNING id`)
  const diag = yield* idOf(sql`
    INSERT INTO diagnostic (machine_id, captured_at, operating_system, os_version, distribution_id, architecture, cpu_model, gpu_model, ram_mb, vulkan_support)
    VALUES (${machine}, '2026-10-01T10:00:00Z', 'Linux', '6.8', ${dist}, 'x86_64', 'cpu', 'gpu', 8192, 'desconocido') RETURNING id`)
  const profile = yield* idOf(sql`
    INSERT INTO profile (edition_id, distribution_id, layer_version_id, author_id, architecture, revision, title)
    VALUES (${ed}, ${dist}, ${layerVersion}, 'autor', 'x86_64', 1, 'perfil') RETURNING id`)
  const rep = yield* idOf(sql`
    INSERT INTO report (edition_id, diagnostic_id, layer_version_id, game_version, tested_at, outcome, observations)
    VALUES (${ed}, ${diag}, ${layerVersion}, '1.0', '2026-10-02T10:00:00Z', 'no_inicia', 'pantalla negra') RETURNING id`)
  const tipoFallo = yield* idOf(sql`INSERT INTO failure_type (code, description) VALUES ('otro', 'Causa no identificada') RETURNING id`)
  const dependency = yield* idOf(sql`INSERT INTO dependency (name, package_manager, description) VALUES ('vcrun2019', 'winetricks', 'd') RETURNING id`)
  return { sql, author: 'autor', revisor: 'revisor', launcher, ed, ed2, dist, layer: layerVersion, machine, diag, profile, rep, tipoFallo, dependency }
})

export type Seed = Effect.Success<typeof seed>
