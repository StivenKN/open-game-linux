// Read models of the adoption guides (RF-09). Only `publicada` is public; seeders author them (no authoring UI).
import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { NoEncontrado } from '../../dominio/fallos.ts'
import { GuiaId } from '../../dominio/ids.ts'
import { GuiaAdopcion } from '../../dominio/tablas.ts'
import { esDemo, etiquetaDistribucion } from './etiquetas.ts'

/** distribucion null = a general guide, not tied to one distribution (8.11 "debe permitir"). */
const extra = { distribucion: Schema.NullOr(Schema.String), ejemplo: Schema.Boolean }

const FilaGuia = GuiaAdopcion.mapFields(Struct.pick(['id', 'tipo', 'titulo', 'actualizado_en'])).mapFields(Struct.assign(extra))

const DetalleGuia = GuiaAdopcion.mapFields(Struct.pick(['id', 'tipo', 'titulo', 'contenido', 'revision', 'actualizado_en'])).mapFields(
  Struct.assign({ ...extra, autor: Schema.String }),
)

export const guias = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  SqlSchema.findAll({
    Request: Schema.Void,
    Result: FilaGuia,
    execute: () => sql`
      SELECT g.id, g.tipo, g.titulo, g.actualizado_en, ${sql.literal(etiquetaDistribucion('d'))} AS distribucion,
             ${sql.literal(esDemo('u'))} AS ejemplo
      FROM guia_adopcion g
      JOIN usuario u ON u.id = g.autor_id
      LEFT JOIN distribucion d ON d.id = g.distribucion_id
      WHERE g.estado = 'publicada'
      ORDER BY g.tipo, g.titulo`,
  })(undefined),
)

export const guia = (id: GuiaId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const fila = yield* SqlSchema.findOneOption({
      Request: GuiaId,
      Result: DetalleGuia,
      execute: (id) => sql`
        SELECT g.id, g.tipo, g.titulo, g.contenido, g.revision, g.actualizado_en, ${sql.literal(etiquetaDistribucion('d'))} AS distribucion,
               u.alias AS autor, ${sql.literal(esDemo('u'))} AS ejemplo
        FROM guia_adopcion g
        JOIN usuario u ON u.id = g.autor_id
        LEFT JOIN distribucion d ON d.id = g.distribucion_id
        WHERE g.id = ${id} AND g.estado = 'publicada'`,
    })(id)
    if (Option.isNone(fila)) return yield* new NoEncontrado()
    return fila.value
  })
