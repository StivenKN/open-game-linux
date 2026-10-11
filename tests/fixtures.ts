import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'
import type { Rol } from '../src/dominio/revision.ts'
import { idDe } from './apoyo.ts'

export const base = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const usuario = (id: string, rol: Rol) =>
    sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES (${id}, ${id}, ${`${id}@demo.opengame.test`}, false, ${rol}, true)`
  yield* usuario('autor', 'usuario')
  yield* usuario('revisor', 'revisor')
  const lanzador = yield* idDe(sql`INSERT INTO lanzador (nombre) VALUES ('Steam') RETURNING id`)
  const edicion = (titulo: string) =>
    Effect.flatMap(idDe(sql`INSERT INTO juego (titulo, descripcion) VALUES (${titulo}, 'd') RETURNING id`), (juego) =>
      idDe(sql`INSERT INTO edicion_juego (juego_id, lanzador_id) VALUES (${juego}, ${lanzador}) RETURNING id`),
    )
  const ed = yield* edicion('Juego')
  const ed2 = yield* edicion('Otro juego')
  const dist = yield* idDe(sql`INSERT INTO distribucion (nombre, version) VALUES ('Linux Mint', '22') RETURNING id`)
  const capa = yield* idDe(sql`INSERT INTO version_capa (familia, variante, version) VALUES ('Proton', 'Valve', '9.0-4') RETURNING id`)
  const equipo = yield* idDe(sql`INSERT INTO equipo (usuario_id, alias) VALUES ('autor', 'portátil') RETURNING id`)
  const diag = yield* idDe(sql`
    INSERT INTO diagnostico (equipo_id, capturado_en, sistema, version_sistema, distribucion_id, arquitectura, cpu_modelo, gpu_modelo, ram_mb, soporte_vulkan)
    VALUES (${equipo}, '2026-10-01T10:00:00Z', 'Linux', '6.8', ${dist}, 'x86_64', 'cpu', 'gpu', 8192, 'desconocido') RETURNING id`)
  const perfil = yield* idDe(sql`
    INSERT INTO perfil_configuracion (edicion_id, distribucion_id, version_capa_id, autor_id, arquitectura, revision, titulo)
    VALUES (${ed}, ${dist}, ${capa}, 'autor', 'x86_64', 1, 'perfil') RETURNING id`)
  const rep = yield* idDe(sql`
    INSERT INTO reporte (edicion_id, diagnostico_id, version_capa_id, version_juego, fecha_prueba, resultado, observaciones)
    VALUES (${ed}, ${diag}, ${capa}, '1.0', '2026-10-02T10:00:00Z', 'no_inicia', 'pantalla negra') RETURNING id`)
  const tipoFallo = yield* idDe(sql`INSERT INTO tipo_fallo (codigo, descripcion) VALUES ('otro', 'Causa no identificada') RETURNING id`)
  const dependencia = yield* idDe(sql`INSERT INTO dependencia (nombre, gestor, descripcion) VALUES ('vcrun2019', 'winetricks', 'd') RETURNING id`)
  return { sql, autor: 'autor', revisor: 'revisor', lanzador, ed, ed2, dist, capa, equipo, diag, perfil, rep, tipoFallo, dependencia }
})

export type Base = Effect.Success<typeof base>
