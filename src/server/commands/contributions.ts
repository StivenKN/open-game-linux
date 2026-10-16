import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { mismatches, type NewSolution, type NewGame, type NewReport, TargetProfile } from '../../domain/contributions.ts'
import { type Unauthenticated, IncomparableProfile, type Rule, RuleViolated, type Forbidden } from '../../domain/errors.ts'
import { GameId, ReportId, SolutionId, LayerVersionId } from '../../domain/ids.ts'
import { activeStatuses } from '../../domain/review.ts'
import { Diagnostic, Machine, Profile, Report } from '../../domain/tables.ts'
import { exigirRevisor, exigirUsuario, type Visitante } from '../auth.ts'
import { conReglasDeBd } from '../schema/constraints.ts'
import { filas, type Infra, unaFila } from '../rows.ts'

export type Escritura<A, E> = Effect.Effect<A, E | Unauthenticated | Infra, SqlClient.SqlClient | Visitante>

const falla = (regla: Rule) => Effect.fail(new RuleViolated({ rule: regla }))

const DiagnosticoDeReporte = Schema.Struct({
  usuario_id: Machine.fields.usuario_id,
  ...Diagnostic.mapFields(Struct.pick(['sistema', 'distribucion_id', 'arquitectura', 'capturado_en'])).fields,
})

const ConIdReporte = Schema.Struct({ id: ReportId })

export const registrarReporte = (n: NewReport): Escritura<{ readonly id: ReportId }, RuleViolated | IncomparableProfile> =>
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
        TargetProfile,
        sql`SELECT edicion_id, version_capa_id, distribucion_id, arquitectura, version_juego_objetivo
            FROM perfil_configuracion WHERE id = ${n.perfil_id} AND estado_revision IN ${sql.in(activeStatuses)}`,
      )
      if (perfil === undefined) return yield* falla('perfil_no_disponible')
      const encontradas = mismatches(
        { edicion_id: n.edicion_id, version_capa_id, distribucion_id: d.distribucion_id, arquitectura: d.arquitectura, version_juego: n.version_juego },
        perfil,
      )
      if (Arr.isReadonlyArrayNonEmpty(encontradas)) return yield* Effect.fail(new IncomparableProfile({ mismatches: encontradas }))
    }

    const creado = yield* unaFila(
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
    if (Arr.isReadonlyArrayNonEmpty(n.fallos))
      yield* conReglasDeBd(
        sql`INSERT INTO reporte_fallo ${sql.insert(n.fallos.map((f) => ({ reporte_id: creado.id, tipo_fallo_id: f.tipo_fallo_id, detalle: f.detalle })))}`,
      )
    return { id: creado.id }
  })

const ConIdCapa = Schema.Struct({ id: LayerVersionId })

const resolverVersionCapa = (ref: NewReport['version_capa']) =>
  Effect.gen(function* () {
    if (ref._tag === 'existente') return ref.id
    const sql = yield* SqlClient.SqlClient
    // DO UPDATE instead of DO NOTHING so RETURNING also yields the id of a row that already existed.
    const capa = yield* conReglasDeBd(
      unaFila(
        ConIdCapa,
        sql`INSERT INTO version_capa (familia, variante, version) VALUES (${ref.familia}, ${ref.variante}, ${ref.version})
            ON CONFLICT ON CONSTRAINT version_capa_uq DO UPDATE SET familia = EXCLUDED.familia RETURNING id`,
      ),
    )
    return capa.id
  })

const OrigenSolucion = Report.mapFields(Struct.pick(['edicion_id']))
const PerfilRecomendado = Profile.mapFields(Struct.pick(['edicion_id']))
const ConIdSolucion = Schema.Struct({ id: SolutionId })

export const registrarSolucion = (s: NewSolution): Escritura<{ readonly id: SolutionId }, RuleViolated> =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient

    const [origen] = yield* filas(
      OrigenSolucion,
      sql`SELECT r.edicion_id FROM reporte_fallo f JOIN reporte r ON r.id = f.reporte_id
          WHERE f.reporte_id = ${s.reporte_id} AND f.tipo_fallo_id = ${s.tipo_fallo_id} AND r.estado_revision IN ${sql.in(activeStatuses)}`,
    )
    if (origen === undefined) return yield* falla('solucion_sin_fallo')

    if (s.perfil_id !== null) {
      const [perfil] = yield* filas(
        PerfilRecomendado,
        sql`SELECT edicion_id FROM perfil_configuracion WHERE id = ${s.perfil_id} AND estado_revision IN ${sql.in(activeStatuses)}`,
      )
      if (perfil === undefined) return yield* falla('perfil_no_disponible')
      if (perfil.edicion_id !== origen.edicion_id) return yield* falla('solucion_perfil_otra_edicion')
    }

    const creada = yield* unaFila(
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
    return { id: creada.id }
  })

const ConIdJuego = Schema.Struct({ id: GameId })

export const crearJuego = (j: NewGame): Escritura<{ readonly id: GameId }, RuleViolated | Forbidden> =>
  Effect.gen(function* () {
    yield* exigirRevisor
    const sql = yield* SqlClient.SqlClient
    const creado = yield* unaFila(
      ConIdJuego,
      sql`INSERT INTO juego ${sql.insert({ titulo: j.titulo, descripcion: j.descripcion, nivel_x86_min: j.nivel_x86_min })} RETURNING id`,
    )
    yield* conReglasDeBd(sql`INSERT INTO edicion_juego ${sql.insert(j.ediciones.map((e) => ({ juego_id: creado.id, ...e })))}`)
    yield* sql`INSERT INTO juego_api ${sql.insert(Arr.dedupe(j.apis).map((api) => ({ juego_id: creado.id, api })))}`
    return { id: creado.id }
  })
