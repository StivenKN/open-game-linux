// Single writer of protondb_resumen. The export is read whole before the database is touched, then every
// row is replaced in one transaction: a rerun converges, and a failed read leaves the last import intact.
import { Array as Arr, Clock, Effect, Option, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import type { EditionId } from '../../domain/ids.ts'
import { parseReport, type ProtonDbReport, summarizeProtonDb } from '../../domain/protondb.ts'
import { GameEdition } from '../../domain/tables.ts'
import { filas, unaFila } from '../rows.ts'

export class ExportacionInvalida extends Schema.TaggedError<ExportacionInvalida>()('ExportacionInvalida', { motivo: Schema.String }) {}

export type ResultadoImportacion = {
  readonly leidos: number
  readonly descartados: number
  readonly coincidentes: number
  readonly guardados: number
  readonly exportado_en: Date
}

// A record is about 1.3 kB, but one in the October 2026 export carries 1 MB of notes. Past this limit an
// element is scanned without being kept, so a broken file cannot grow the buffer without bound.
const LIMITE_ELEMENTO = 4 * 1024 * 1024

const COMILLA = 0x22
const BARRA = 0x5c
const COMA = 0x2c
const ABRE_CORCHETE = 0x5b
const CIERRA_CORCHETE = 0x5d
const ABRE_LLAVE = 0x7b
const CIERRA_LLAVE = 0x7d
const BOM = 0xfeff
const esEspacio = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09
// String content is most of the export; one regex call skips it faster than the char loop.
const hastaComillaOBarra = /[^"\\]*/y

/**
 * Yields the text of each element of a top-level JSON array, read from text chunks. JSON.parse of the
 * whole export would pass V8's string limit. Fails on anything but one complete array. An element that is
 * missing or over the size limit comes out as '', which no reader accepts, so it is counted, not hidden.
 */
export async function* elementosDeArreglo(trozos: AsyncIterable<string>): AsyncGenerator<string> {
  let profundidad = 0
  let enCadena = false
  let escapado = false
  let empezado = false
  let terminado = false
  let esperaElemento = false
  let enElemento = false
  let partes: Array<string> = []
  let acumulado = 0

  const elemento = (trozo: string, inicio: number, fin: number) => {
    const texto = acumulado + fin - inicio > LIMITE_ELEMENTO ? '' : (partes.join('') + trozo.slice(inicio, fin)).trimEnd()
    partes = []
    acumulado = 0
    enElemento = false
    return texto
  }

  for await (const trozo of trozos) {
    const listos: Array<string> = []
    let inicio = 0
    for (let i = 0; i < trozo.length; i++) {
      if (enCadena) {
        if (escapado) {
          escapado = false
          continue
        }
        hastaComillaOBarra.lastIndex = i
        hastaComillaOBarra.test(trozo)
        i = hastaComillaOBarra.lastIndex
        if (trozo.charCodeAt(i) === BARRA) escapado = true
        else if (i < trozo.length) enCadena = false
        continue
      }
      const c = trozo.charCodeAt(i)
      if (terminado) {
        if (!esEspacio(c)) throw new ExportacionInvalida({ motivo: 'hay datos después del arreglo' })
        continue
      }
      if (!empezado) {
        if (esEspacio(c) || c === BOM) continue
        if (c !== ABRE_CORCHETE) throw new ExportacionInvalida({ motivo: 'no es un arreglo JSON' })
        empezado = true
        profundidad = 1
        continue
      }
      if (profundidad === 1 && !enElemento) {
        if (esEspacio(c)) continue
        if (c === COMA || c === CIERRA_CORCHETE) {
          if (c === COMA || esperaElemento) listos.push('')
          esperaElemento = c === COMA
          terminado = c === CIERRA_CORCHETE
          continue
        }
        enElemento = true
        inicio = i
      }
      if (c === COMILLA) enCadena = true
      else if (c === ABRE_CORCHETE || c === ABRE_LLAVE) profundidad++
      else if ((c === COMA || c === CIERRA_CORCHETE) && profundidad === 1) {
        listos.push(elemento(trozo, inicio, i))
        esperaElemento = c === COMA
        terminado = c === CIERRA_CORCHETE
      } else if (c === CIERRA_CORCHETE || c === CIERRA_LLAVE) profundidad--
    }
    if (enElemento) {
      acumulado += trozo.length - inicio
      if (acumulado > LIMITE_ELEMENTO) partes = []
      else partes.push(trozo.slice(inicio))
    }
    yield* listos
  }
  if (!empezado) throw new ExportacionInvalida({ motivo: 'la entrada está vacía' })
  if (!terminado) throw new ExportacionInvalida({ motivo: 'el archivo está truncado' })
}

const EdicionSteam = GameEdition.mapFields(Struct.pick(['id'])).mapFields(Struct.assign({ app_id: Schema.String }))

const edicionesSteam = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  filas(
    EdicionSteam,
    sql`
      SELECT e.id, e.identificador_externo AS app_id
      FROM edicion_juego e JOIN lanzador l ON l.id = e.lanzador_id
      WHERE l.nombre = 'Steam' AND e.identificador_externo IS NOT NULL`,
  ),
)

const leer = async (trozos: AsyncIterable<string>, ediciones: ReadonlyMap<string, EditionId>, hasta: number) => {
  let leidos = 0
  let descartados = 0
  let coincidentes = 0
  let exportado = 0
  const porEdicion = new Map<EditionId, [ProtonDbReport, ...ProtonDbReport[]]>()
  for await (const texto of elementosDeArreglo(trozos)) {
    leidos++
    const reporte = Option.getOrNull(parseReport(texto))
    // A report dated after the import would move the export date forward and lock out every real export.
    if (reporte === null || reporte.reported_at.getTime() > hasta) {
      descartados++
      continue
    }
    exportado = Math.max(exportado, reporte.reported_at.getTime())
    const edicion = ediciones.get(reporte.app_id)
    if (edicion === undefined) continue
    coincidentes++
    const grupo = porEdicion.get(edicion)
    if (grupo === undefined) porEdicion.set(edicion, [reporte])
    else grupo.push(reporte)
  }
  return { leidos, descartados, coincidentes, exportado, porEdicion }
}

const Anterior = Schema.Struct({ exportado_en: Schema.NullOr(Schema.Date) })

/**
 * Stores one aggregate per catalog Steam edition from a ProtonDB export, replacing the last import.
 * Refuses an export older than the stored one; the same export again converges to the same rows.
 */
export const importarProtonDb = (trozos: AsyncIterable<string>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const ediciones = new Map((yield* edicionesSteam).map((e) => [e.app_id, e.id]))
    const hasta = yield* Clock.currentTimeMillis
    const lectura = yield* Effect.tryPromise({
      try: () => leer(trozos, ediciones, hasta),
      catch: (e) =>
        e instanceof ExportacionInvalida
          ? e
          : new ExportacionInvalida({ motivo: `no se pudo leer la entrada (${e instanceof Error ? e.message : String(e)})` }),
    })
    if (lectura.exportado === 0) return yield* new ExportacionInvalida({ motivo: 'ningún reporte válido' })
    const exportado_en = new Date(lectura.exportado)
    const resumenes = [...lectura.porEdicion].map(([edicion, reportes]) => summarizeProtonDb(edicion, reportes, exportado_en))

    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`LOCK TABLE protondb_resumen IN EXCLUSIVE MODE`
        const anterior = yield* unaFila(Anterior, sql`SELECT max(exportado_en) AS exportado_en FROM protondb_resumen`)
        if (anterior.exportado_en !== null && anterior.exportado_en > exportado_en)
          return yield* new ExportacionInvalida({ motivo: 'exportación más antigua que la importada' })
        yield* sql`DELETE FROM protondb_resumen`
        for (const lote of Arr.chunksOf(resumenes, 500)) yield* sql`INSERT INTO protondb_resumen ${sql.insert(lote)}`
      }),
    )

    return {
      leidos: lectura.leidos,
      descartados: lectura.descartados,
      coincidentes: lectura.coincidentes,
      guardados: resumenes.length,
      exportado_en,
    } satisfies ResultadoImportacion
  })

const numero = new Intl.NumberFormat('es-CO')

export const resumenImportacion = (r: ResultadoImportacion): string =>
  `ProtonDB: ${numero.format(r.leidos)} reportes leídos, ${numero.format(r.descartados)} descartados, ` +
  `${numero.format(r.coincidentes)} de juegos del catálogo. ${numero.format(r.guardados)} ediciones de Steam guardadas ` +
  `(export del ${r.exportado_en.toISOString().slice(0, 10)}); el resumen anterior fue reemplazado.`
