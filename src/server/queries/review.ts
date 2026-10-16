import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { DistributionId } from '../../domain/ids.ts'
import { WorkingOutcome } from '../../domain/literals.ts'
import { type ContributionRef, type Blocker, activeStatuses, type ContributionType } from '../../domain/review.ts'
import { Diagnostic, Game, Launcher, Profile, Report, Solution, FailureType, User } from '../../domain/tables.ts'
import { approvalBlockers } from '../commands/review.ts'
import { requireReviewer } from '../auth.ts'
import { rows } from '../rows.ts'
import { isDemo, layerLabel, distributionLabel, profileLabel } from './labels.ts'

const Name = Schema.String

const Common = {
  creado_en: Schema.Date,
  estado_revision: Profile.fields.estado_revision,
  autor: User.fields.alias,
  demo: Schema.Boolean,
  es_propio: Schema.Boolean,
  juego: Game.fields.titulo,
  lanzador: Launcher.fields.nombre,
}

const ProfileQueueItem = Schema.Struct({
  ...Common,
  ...Profile.mapFields(Struct.pick(['id', 'titulo', 'revision', 'arquitectura', 'version_juego_objetivo', 'parametros_lanzamiento'])).fields,
  distribucion: Name,
  capa: Name,
  pasos: Schema.Int,
  reportes_funcionales: Schema.Int,
})

const ReportQueueItem = Schema.Struct({
  ...Common,
  ...Report.mapFields(
    Struct.pick(['id', 'resultado', 'version_juego', 'fecha_prueba', 'fps_promedio', 'resolucion', 'calidad_grafica', 'metodo_medicion', 'observaciones']),
  ).fields,
  distribucion: Name,
  distribucion_id: DistributionId,
  arquitectura: Diagnostic.fields.arquitectura,
  capa: Name,
  perfil: Schema.NullOr(Name),
  fallos: Schema.Array(Schema.Struct({ codigo: FailureType.fields.codigo, detalle: Schema.String })),
})

const SolutionQueueItem = Schema.Struct({
  ...Common,
  ...Solution.mapFields(Struct.pick(['id', 'titulo', 'instrucciones', 'reporte_id'])).fields,
  tipo_fallo: FailureType.fields.codigo,
  fallo: Schema.String,
  estado_reporte: Report.fields.estado_revision,
  perfil: Schema.NullOr(Name),
})

const withBlockers = <A extends { readonly estado_revision: string }>(items: ReadonlyArray<A>, refOf: (a: A) => ContributionRef) =>
  Effect.forEach(items, (e) =>
    Effect.map(e.estado_revision === 'pendiente' ? approvalBlockers(refOf(e)) : Effect.succeed([]), (blockers: ReadonlyArray<Blocker>) => ({ ...e, blockers })),
  )

export const queue = (type: ContributionType) =>
  Effect.gen(function* () {
    const reviewer = yield* requireReviewer
    const sql = yield* SqlClient.SqlClient
    const active = sql.in(activeStatuses)
    const demo = sql.literal(isDemo('u'))
    const order = sql`(estado_revision = 'pendiente') DESC, creado_en`

    switch (type) {
      case 'perfil': {
        const items = yield* rows(
          ProfileQueueItem,
          sql`SELECT * FROM (
                SELECT p.id, p.titulo, p.revision, p.arquitectura, p.version_juego_objetivo, p.parametros_lanzamiento, p.creado_en, p.estado_revision,
                       u.alias AS autor, ${demo} AS demo, p.autor_id = ${reviewer.id} AS es_propio,
                       j.titulo AS juego, l.nombre AS lanzador, ${sql.literal(distributionLabel('di'))} AS distribucion,
                       ${sql.literal(layerLabel('c'))} AS capa,
                       (SELECT count(*)::int FROM paso_configuracion WHERE perfil_id = p.id) AS pasos,
                       (SELECT count(*)::int FROM reporte r WHERE r.perfil_id = p.id AND r.estado_revision = 'aprobado'
                          AND r.resultado IN ${sql.in(WorkingOutcome.literals)}) AS reportes_funcionales
                FROM perfil_configuracion p JOIN usuario u ON u.id = p.autor_id
                  JOIN edicion_juego e ON e.id = p.edicion_id JOIN juego j ON j.id = e.juego_id JOIN lanzador l ON l.id = e.lanzador_id
                  JOIN distribucion di ON di.id = p.distribucion_id JOIN version_capa c ON c.id = p.version_capa_id
                WHERE p.estado_revision IN ${active}) q
              ORDER BY ${order}`,
        )
        return { type, items: yield* withBlockers(items, (e) => ({ _tag: 'perfil', id: e.id })) }
      }
      case 'reporte': {
        const items = yield* rows(
          ReportQueueItem,
          sql`SELECT * FROM (
                SELECT r.id, r.resultado, r.version_juego, r.fecha_prueba, r.fps_promedio, r.resolucion, r.calidad_grafica, r.metodo_medicion,
                       r.observaciones, r.creado_en, r.estado_revision,
                       u.alias AS autor, ${demo} AS demo, eq.usuario_id = ${reviewer.id} AS es_propio,
                       j.titulo AS juego, l.nombre AS lanzador, ${sql.literal(distributionLabel('di'))} AS distribucion, d.distribucion_id, d.arquitectura,
                       ${sql.literal(layerLabel('c'))} AS capa,
                       ${sql.literal(profileLabel('p'))} AS perfil,
                       COALESCE((SELECT json_agg(json_build_object('codigo', t.codigo, 'detalle', f.detalle) ORDER BY t.id)
                                 FROM reporte_fallo f JOIN tipo_fallo t ON t.id = f.tipo_fallo_id WHERE f.reporte_id = r.id), '[]') AS fallos
                FROM reporte r JOIN diagnostico d ON d.id = r.diagnostico_id JOIN equipo eq ON eq.id = d.equipo_id JOIN usuario u ON u.id = eq.usuario_id
                  JOIN edicion_juego e ON e.id = r.edicion_id JOIN juego j ON j.id = e.juego_id JOIN lanzador l ON l.id = e.lanzador_id
                  JOIN distribucion di ON di.id = d.distribucion_id JOIN version_capa c ON c.id = r.version_capa_id
                  LEFT JOIN perfil_configuracion p ON p.id = r.perfil_id
                WHERE r.estado_revision IN ${active}) q
              ORDER BY ${order}`,
        )
        return { type, items: yield* withBlockers(items, (e) => ({ _tag: 'reporte', id: e.id })) }
      }
      case 'solucion': {
        const items = yield* rows(
          SolutionQueueItem,
          sql`SELECT * FROM (
                SELECT s.id, s.titulo, s.instrucciones, s.reporte_id, s.creado_en, s.estado_revision,
                       u.alias AS autor, ${demo} AS demo, s.autor_id = ${reviewer.id} AS es_propio,
                       j.titulo AS juego, l.nombre AS lanzador, t.codigo AS tipo_fallo, f.detalle AS fallo, r.estado_revision AS estado_reporte,
                       ${sql.literal(profileLabel('p'))} || ' (' || p.estado_revision || ')' AS perfil
                FROM solucion s JOIN usuario u ON u.id = s.autor_id
                  JOIN reporte_fallo f ON f.reporte_id = s.reporte_id AND f.tipo_fallo_id = s.tipo_fallo_id JOIN tipo_fallo t ON t.id = s.tipo_fallo_id
                  JOIN reporte r ON r.id = s.reporte_id JOIN edicion_juego e ON e.id = r.edicion_id
                  JOIN juego j ON j.id = e.juego_id JOIN lanzador l ON l.id = e.lanzador_id
                  LEFT JOIN perfil_configuracion p ON p.id = s.perfil_id
                WHERE s.estado_revision IN ${active}) q
              ORDER BY ${order}`,
        )
        return { type, items: yield* withBlockers(items, (e) => ({ _tag: 'solucion', id: e.id })) }
      }
    }
  })
