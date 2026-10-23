// Single writer of protondb_summary. The export is read whole before the database is touched, then every
// row is replaced in one transaction: a rerun converges, and a failed read leaves the last import intact.
import { Array as Arr, Clock, Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import type { EditionId } from '../../domain/ids.ts'
import { parseReport, type ProtonDbReport, summarizeProtonDb } from '../../domain/protondb.ts'
import { oneRow } from '../rows.ts'
import { InvalidExport, readInput, recordImport, steamEditions } from './sources.ts'

export type ImportResult = {
  readonly read: number
  readonly discarded: number
  readonly matched: number
  readonly saved: number
  readonly exported_at: Date
}

// A record is about 1.3 kB, but one in the October 2026 export carries 1 MB of notes. Past this limit an
// element is scanned without being kept, so a broken file cannot grow the buffer without bound.
const ELEMENT_LIMIT = 4 * 1024 * 1024

const QUOTE = 0x22
const BACKSLASH = 0x5c
const COMMA = 0x2c
const OPEN_BRACKET = 0x5b
const CLOSE_BRACKET = 0x5d
const OPEN_BRACE = 0x7b
const CLOSE_BRACE = 0x7d
const BOM = 0xfeff
const isWhitespace = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09
// String content is most of the export; one regex call skips it faster than the char loop.
const untilQuoteOrBackslash = /[^"\\]*/y

/**
 * Yields the text of each element of a top-level JSON array, read from text chunks. JSON.parse of the
 * whole export would pass V8's string limit. Fails on anything but one complete array. An element that is
 * missing or over the size limit comes out as '', which no reader accepts, so it is counted, not hidden.
 */
export async function* arrayElements(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let depth = 0
  let inString = false
  let escaped = false
  let started = false
  let finished = false
  let expectingElement = false
  let inElement = false
  let parts: Array<string> = []
  let buffered = 0

  const takeElement = (chunk: string, start: number, end: number) => {
    const text = buffered + end - start > ELEMENT_LIMIT ? '' : (parts.join('') + chunk.slice(start, end)).trimEnd()
    parts = []
    buffered = 0
    inElement = false
    return text
  }

  for await (const chunk of chunks) {
    const ready: Array<string> = []
    let start = 0
    for (let i = 0; i < chunk.length; i++) {
      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }
        untilQuoteOrBackslash.lastIndex = i
        untilQuoteOrBackslash.test(chunk)
        i = untilQuoteOrBackslash.lastIndex
        if (chunk.charCodeAt(i) === BACKSLASH) escaped = true
        else if (i < chunk.length) inString = false
        continue
      }
      const c = chunk.charCodeAt(i)
      if (finished) {
        if (!isWhitespace(c)) throw new InvalidExport({ reason: 'hay datos después del arreglo' })
        continue
      }
      if (!started) {
        if (isWhitespace(c) || c === BOM) continue
        if (c !== OPEN_BRACKET) throw new InvalidExport({ reason: 'no es un arreglo JSON' })
        started = true
        depth = 1
        continue
      }
      if (depth === 1 && !inElement) {
        if (isWhitespace(c)) continue
        if (c === COMMA || c === CLOSE_BRACKET) {
          if (c === COMMA || expectingElement) ready.push('')
          expectingElement = c === COMMA
          finished = c === CLOSE_BRACKET
          continue
        }
        inElement = true
        start = i
      }
      if (c === QUOTE) inString = true
      else if (c === OPEN_BRACKET || c === OPEN_BRACE) depth++
      else if ((c === COMMA || c === CLOSE_BRACKET) && depth === 1) {
        ready.push(takeElement(chunk, start, i))
        expectingElement = c === COMMA
        finished = c === CLOSE_BRACKET
      } else if (c === CLOSE_BRACKET || c === CLOSE_BRACE) depth--
    }
    if (inElement) {
      buffered += chunk.length - start
      if (buffered > ELEMENT_LIMIT) parts = []
      else parts.push(chunk.slice(start))
    }
    yield* ready
  }
  if (!started) throw new InvalidExport({ reason: 'la entrada está vacía' })
  if (!finished) throw new InvalidExport({ reason: 'el archivo está truncado' })
}

const readExport = async (chunks: AsyncIterable<string>, editions: ReadonlyMap<string, EditionId>, until: number) => {
  let read = 0
  let discarded = 0
  let matched = 0
  let exported = 0
  const byEdition = new Map<EditionId, [ProtonDbReport, ...ProtonDbReport[]]>()
  for await (const text of arrayElements(chunks)) {
    read++
    const report = Option.getOrNull(parseReport(text))
    // A report dated after the import would move the export date forward and lock out every real export.
    if (report === null || report.reported_at.getTime() > until) {
      discarded++
      continue
    }
    exported = Math.max(exported, report.reported_at.getTime())
    const edition = editions.get(report.app_id)
    if (edition === undefined) continue
    matched++
    const group = byEdition.get(edition)
    if (group === undefined) byEdition.set(edition, [report])
    else group.push(report)
  }
  return { read, discarded, matched, exported, byEdition }
}

const Previous = Schema.Struct({ exported_at: Schema.NullOr(Schema.Date) })

/**
 * Stores one aggregate per catalog Steam edition from a ProtonDB export, replacing the last import.
 * Refuses an export older than the stored one; the same export again converges to the same rows.
 * `file` is the export's blob sha when `--latest` downloaded it, else null (see `recordImport`).
 */
export const importProtonDb = (chunks: AsyncIterable<string>, file: string | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const steam = yield* steamEditions
    const editions = new Map(steam.map((e) => [e.app_id, e.id]))
    const until = yield* Clock.currentTimeMillis
    const parsed = yield* readInput(() => readExport(chunks, editions, until))
    if (parsed.exported === 0) return yield* new InvalidExport({ reason: 'ningún reporte válido' })
    const exported_at = new Date(parsed.exported)
    const summaries = [...parsed.byEdition].map(([edition, reports]) => summarizeProtonDb(edition, reports, exported_at))

    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`LOCK TABLE protondb_summary IN EXCLUSIVE MODE`
        const previous = yield* oneRow(Previous, sql`SELECT max(exported_at) AS exported_at FROM protondb_summary`)
        if (previous.exported_at !== null && previous.exported_at > exported_at)
          return yield* new InvalidExport({ reason: 'exportación más antigua que la importada' })
        yield* sql`DELETE FROM protondb_summary`
        for (const batch of Arr.chunksOf(summaries, 500)) yield* sql`INSERT INTO protondb_summary ${sql.insert(batch)}`
        yield* recordImport('protondb', file, steam)
      }),
    )

    return {
      read: parsed.read,
      discarded: parsed.discarded,
      matched: parsed.matched,
      saved: summaries.length,
      exported_at,
    } satisfies ImportResult
  })

const numberFormat = new Intl.NumberFormat('es-CO')

export const importSummary = (r: ImportResult): string =>
  `ProtonDB: ${numberFormat.format(r.read)} reportes leídos, ${numberFormat.format(r.discarded)} descartados, ` +
  `${numberFormat.format(r.matched)} de juegos del catálogo. ${numberFormat.format(r.saved)} ediciones de Steam guardadas ` +
  `(export del ${r.exported_at.toISOString().slice(0, 10)}); el resumen anterior fue reemplazado.`
