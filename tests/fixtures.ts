import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'
import type { Role } from '../src/domain/review.ts'
import { idOf } from './support.ts'

export const seed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertUser = (id: string, role: Role) =>
    sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES (${id}, ${id}, ${`${id}@demo.opengame.test`}, false, ${role}, true)`
  yield* insertUser('autor', 'usuario')
  yield* insertUser('revisor', 'revisor')
  const lanzador = yield* idOf(sql`INSERT INTO lanzador (nombre) VALUES ('Steam') RETURNING id`)
  const insertEdition = (title: string) =>
    Effect.flatMap(idOf(sql`INSERT INTO juego (titulo, descripcion) VALUES (${title}, 'd') RETURNING id`), (game) =>
      idOf(sql`INSERT INTO edicion_juego (juego_id, lanzador_id) VALUES (${game}, ${lanzador}) RETURNING id`),
    )
  const ed = yield* insertEdition('Juego')
  const ed2 = yield* insertEdition('Otro juego')
  const dist = yield* idOf(sql`INSERT INTO distribucion (nombre, version) VALUES ('Linux Mint', '22') RETURNING id`)
  const capa = yield* idOf(sql`INSERT INTO version_capa (familia, variante, version) VALUES ('Proton', 'Valve', '9.0-4') RETURNING id`)
  const equipo = yield* idOf(sql`INSERT INTO equipo (usuario_id, alias) VALUES ('autor', 'portátil') RETURNING id`)
  const diag = yield* idOf(sql`
    INSERT INTO diagnostico (equipo_id, capturado_en, sistema, version_sistema, distribucion_id, arquitectura, cpu_modelo, gpu_modelo, ram_mb, soporte_vulkan)
    VALUES (${equipo}, '2026-10-01T10:00:00Z', 'Linux', '6.8', ${dist}, 'x86_64', 'cpu', 'gpu', 8192, 'desconocido') RETURNING id`)
  const perfil = yield* idOf(sql`
    INSERT INTO perfil_configuracion (edicion_id, distribucion_id, version_capa_id, autor_id, arquitectura, revision, titulo)
    VALUES (${ed}, ${dist}, ${capa}, 'autor', 'x86_64', 1, 'perfil') RETURNING id`)
  const rep = yield* idOf(sql`
    INSERT INTO reporte (edicion_id, diagnostico_id, version_capa_id, version_juego, fecha_prueba, resultado, observaciones)
    VALUES (${ed}, ${diag}, ${capa}, '1.0', '2026-10-02T10:00:00Z', 'no_inicia', 'pantalla negra') RETURNING id`)
  const tipoFallo = yield* idOf(sql`INSERT INTO tipo_fallo (codigo, descripcion) VALUES ('otro', 'Causa no identificada') RETURNING id`)
  const dependencia = yield* idOf(sql`INSERT INTO dependencia (nombre, gestor, descripcion) VALUES ('vcrun2019', 'winetricks', 'd') RETURNING id`)
  return { sql, autor: 'autor', revisor: 'revisor', lanzador, ed, ed2, dist, capa, equipo, diag, perfil, rep, tipoFallo, dependencia }
})

export type Seed = Effect.Success<typeof seed>
