import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { discrepancias, type NuevaSolucion, type NuevoJuego, type NuevoReporte, PerfilObjetivo } from '../../dominio/aportes.ts'
import { type NoAutenticado, PerfilNoComparable, type Regla, ReglaIncumplida, type SinPermiso } from '../../dominio/fallos.ts'
import { JuegoId, ReporteId, SolucionId, VersionCapaId } from '../../dominio/ids.ts'
import { estadosVigentes } from '../../dominio/revision.ts'
import { Diagnostico, Equipo, PerfilConfiguracion, Reporte } from '../../dominio/tablas.ts'
import { exigirRevisor, exigirUsuario, type Visitante } from '../auth.ts'
import { conReglasDeBd } from '../esquema/restricciones.ts'
import { filas, type Infra, unaFila } from '../filas.ts'

export type Escritura<A, E> = Effect.Effect<A, E | NoAutenticado | Infra, SqlClient.SqlClient | Visitante>

const falla = (regla: Regla) => Effect.fail(new ReglaIncumplida({ regla }))

const DiagnosticoDeReporte = Schema.Struct({
  usuario_id: Equipo.fields.usuario_id,
  ...Diagnostico.mapFields(Struct.pick(['sistema', 'distribucion_id', 'arquitectura', 'capturado_en'])).fields,
})

const ConIdReporte = Schema.Struct({ id: ReporteId })

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

const ConIdCapa = Schema.Struct({ id: VersionCapaId })

const resolverVersionCapa = (ref: NuevoReporte['version_capa']) =>
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

const OrigenSolucion = Reporte.mapFields(Struct.pick(['edicion_id']))
const PerfilRecomendado = PerfilConfiguracion.mapFields(Struct.pick(['edicion_id']))
const ConIdSolucion = Schema.Struct({ id: SolucionId })

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

const ConIdJuego = Schema.Struct({ id: JuegoId })

export const crearJuego = (j: NuevoJuego): Escritura<{ readonly id: JuegoId }, ReglaIncumplida | SinPermiso> =>
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
