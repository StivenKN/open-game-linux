// The single writer of user contributions: reporte (+ reporte_fallo, version_capa upsert), solucion, and
// juego/edicion_juego (RF-03). diagnostico/equipo/distribucion belong to aportes/diagnostico.ts.
// Every app-side 8.7/8.9 write rule the DB cannot express lives here or in revision.ts, nowhere else.
//
// Each program runs inside the one transaction servidor/ejecutar.ts `accion` opens, so a failure after a
// partial insert rolls back. Rule failures are data for the form: ReglaIncumplida or PerfilNoComparable.
import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { discrepancias, type NuevaSolucion, type NuevoJuego, type NuevoReporte, PerfilObjetivo } from '../../dominio/aportes.ts'
import { type NoAutenticado, PerfilNoComparable, type Regla, ReglaIncumplida, type SinPermiso } from '../../dominio/fallos.ts'
import { JuegoId, ReporteId, SolucionId, VersionCapaId } from '../../dominio/ids.ts'
import { estadosVigentes } from '../../dominio/revision.ts'
import { Diagnostico, Equipo, PerfilConfiguracion, Reporte } from '../../dominio/tablas.ts'
import { exigirRevisor, exigirUsuario, type Visitante } from '../auth.ts'
import { conReglasDeBd } from '../esquema/restricciones.ts'
import { filas, type Infra } from '../filas.ts'

/** A writer program: run by `accion` in one transaction, for a signed-in visitor. */
export type Escritura<A, E> = Effect.Effect<A, E | NoAutenticado | Infra, SqlClient.SqlClient | Visitante>

const falla = (regla: Regla) => Effect.fail(new ReglaIncumplida({ regla }))

const DiagnosticoDeReporte = Schema.Struct({
  usuario_id: Equipo.fields.usuario_id,
  ...Diagnostico.mapFields(Struct.pick(['sistema', 'distribucion_id', 'arquitectura', 'capturado_en'])).fields,
})

const ConIdReporte = Schema.Struct({ id: ReporteId })

/**
 * RF-08. Rules, in order (the first failure is returned):
 *   the diagnosis exists and is on one of the viewer's equipos -> equipo_ajeno (also when missing: no existence leak)
 *   the diagnosis is Linux                                    -> diagnostico_no_linux
 *   fecha_prueba >= capturado_en                              -> fecha_antes_del_diagnostico
 *   version_capa resolved (upsert for `nueva`)                -> version_capa_no_exacta (DB CHECK, mapped)
 *   with perfil_id: the profile is pending or approved        -> perfil_no_disponible
 *                   discrepancias(...) is empty               -> PerfilNoComparable (8.7, checked again at approval)
 *   insert reporte (pending by default) + reporte_fallo rows  -> fallo_duplicado (DB PK, mapped)
 * The failing-result rule already held when `n` decoded (NuevoReporte's member per resultado).
 */
export const registrarReporte = (n: NuevoReporte): Escritura<{ readonly id: ReporteId }, ReglaIncumplida | PerfilNoComparable> =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient

    const [d] = yield* filas(
      DiagnosticoDeReporte,
      sql`SELECT e.usuario_id, d.sistema, d.distribucion_id, d.arquitectura, d.capturado_en
          FROM diagnostico d JOIN equipo e ON e.id = d.equipo_id WHERE d.id = ${n.diagnostico_id}`,
    )
    if (d === undefined || d.usuario_id !== usuario.id) return yield* falla('equipo_ajeno')
    if (d.sistema !== 'Linux' || d.distribucion_id === null) return yield* falla('diagnostico_no_linux')
    if (n.fecha_prueba < d.capturado_en) return yield* falla('fecha_antes_del_diagnostico')

    const version_capa_id = yield* resolverVersionCapa(n.version_capa)

    if (n.perfil_id !== null) {
      const [perfil] = yield* filas(
        PerfilObjetivo,
        sql`SELECT edicion_id, version_capa_id, distribucion_id, arquitectura, version_juego_objetivo
            FROM perfil_configuracion WHERE id = ${n.perfil_id} AND estado_revision IN ${sql.in(estadosVigentes)}`,
      )
      if (perfil === undefined) return yield* falla('perfil_no_disponible')
      const encontradas = discrepancias(
        { edicion_id: n.edicion_id, version_capa_id, distribucion_id: d.distribucion_id, arquitectura: d.arquitectura, version_juego: n.version_juego },
        perfil,
      )
      if (Arr.isReadonlyArrayNonEmpty(encontradas)) return yield* Effect.fail(new PerfilNoComparable({ discrepancias: encontradas }))
    }

    const [creado] = yield* filas(
      ConIdReporte,
      sql`INSERT INTO reporte ${sql.insert({
        edicion_id: n.edicion_id,
        diagnostico_id: n.diagnostico_id,
        version_capa_id,
        perfil_id: n.perfil_id,
        version_juego: n.version_juego,
        version_lanzador: n.version_lanzador,
        fecha_prueba: n.fecha_prueba,
        resultado: n.resultado,
        fps_promedio: n.medicion?.fps_promedio ?? null,
        resolucion: n.medicion?.resolucion ?? null,
        calidad_grafica: n.medicion?.calidad_grafica ?? null,
        metodo_medicion: n.medicion?.metodo_medicion ?? null,
        observaciones: n.observaciones,
      })} RETURNING id`,
    )
    if (creado === undefined) return yield* Effect.die('INSERT INTO reporte no devolvió id')
    if (Arr.isReadonlyArrayNonEmpty(n.fallos))
      yield* conReglasDeBd(
        sql`INSERT INTO reporte_fallo ${sql.insert(n.fallos.map((f) => ({ reporte_id: creado.id, tipo_fallo_id: f.tipo_fallo_id, detalle: f.detalle })))}`,
      )
    return { id: creado.id }
  })

const ConIdCapa = Schema.Struct({ id: VersionCapaId })

/** `existente` is taken as is (the FK backs it); `nueva` converges on one row per (familia, variante, version). */
const resolverVersionCapa = (ref: NuevoReporte['version_capa']) =>
  Effect.gen(function* () {
    if (ref._tag === 'existente') return ref.id
    const sql = yield* SqlClient.SqlClient
    // DO UPDATE instead of DO NOTHING so RETURNING also yields the id of a row that already existed.
    const [capa] = yield* conReglasDeBd(
      filas(
        ConIdCapa,
        sql`INSERT INTO version_capa (familia, variante, version) VALUES (${ref.familia}, ${ref.variante}, ${ref.version})
            ON CONFLICT ON CONSTRAINT version_capa_uq DO UPDATE SET familia = EXCLUDED.familia RETURNING id`,
      ),
    )
    if (capa === undefined) return yield* Effect.die('INSERT INTO version_capa no devolvió id')
    return capa.id
  })

const OrigenSolucion = Reporte.mapFields(Struct.pick(['edicion_id']))
const PerfilRecomendado = PerfilConfiguracion.mapFields(Struct.pick(['edicion_id']))
const ConIdSolucion = Schema.Struct({ id: SolucionId })

/**
 * RF-08 solution, by any signed-in user (8.8: the author may differ from the report's). Rules:
 *   the report is public and has a fallo of that tipo -> solucion_sin_fallo (composite FK solucion_fallo_fk backs it)
 *   a recommended profile is pending or approved      -> perfil_no_disponible
 *   ...and belongs to the report's edition            -> solucion_perfil_otra_edicion
 */
export const registrarSolucion = (s: NuevaSolucion): Escritura<{ readonly id: SolucionId }, ReglaIncumplida> =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient

    const [origen] = yield* filas(
      OrigenSolucion,
      sql`SELECT r.edicion_id FROM reporte_fallo f JOIN reporte r ON r.id = f.reporte_id
          WHERE f.reporte_id = ${s.reporte_id} AND f.tipo_fallo_id = ${s.tipo_fallo_id} AND r.estado_revision IN ${sql.in(estadosVigentes)}`,
    )
    if (origen === undefined) return yield* falla('solucion_sin_fallo')

    if (s.perfil_id !== null) {
      const [perfil] = yield* filas(
        PerfilRecomendado,
        sql`SELECT edicion_id FROM perfil_configuracion WHERE id = ${s.perfil_id} AND estado_revision IN ${sql.in(estadosVigentes)}`,
      )
      if (perfil === undefined) return yield* falla('perfil_no_disponible')
      if (perfil.edicion_id !== origen.edicion_id) return yield* falla('solucion_perfil_otra_edicion')
    }

    const [creada] = yield* filas(
      ConIdSolucion,
      sql`INSERT INTO solucion ${sql.insert({
        reporte_id: s.reporte_id,
        tipo_fallo_id: s.tipo_fallo_id,
        autor_id: usuario.id,
        perfil_id: s.perfil_id,
        titulo: s.titulo,
        instrucciones: s.instrucciones,
      })} RETURNING id`,
    )
    if (creada === undefined) return yield* Effect.die('INSERT INTO solucion no devolvió id')
    return { id: creada.id }
  })

const ConIdJuego = Schema.Struct({ id: JuegoId })

/**
 * RF-03, reviewers and administrators only: a game and its editions, written together. Rules:
 *   one edition per launcher                    -> edicion_repetida (DB UQ edicion_juego_juego_lanzador_uq)
 *   a store id names one game on its launcher   -> identificador_en_uso (DB UQ edicion_juego_externo_uq)
 */
export const crearJuego = (j: NuevoJuego): Escritura<{ readonly id: JuegoId }, ReglaIncumplida | SinPermiso> =>
  Effect.gen(function* () {
    yield* exigirRevisor
    const sql = yield* SqlClient.SqlClient
    const [creado] = yield* filas(ConIdJuego, sql`INSERT INTO juego ${sql.insert({ titulo: j.titulo, descripcion: j.descripcion })} RETURNING id`)
    if (creado === undefined) return yield* Effect.die('INSERT INTO juego no devolvió id')
    yield* conReglasDeBd(sql`INSERT INTO edicion_juego ${sql.insert(j.ediciones.map((e) => ({ juego_id: creado.id, ...e })))}`)
    return { id: creado.id }
  })
