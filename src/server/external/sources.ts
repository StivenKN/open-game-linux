// Where the external imports get their data, and the single writer of external_import. `--latest` costs one
// GitHub contents listing per source; the file is downloaded only when it or the catalog's Steam games changed.
import { createHash } from 'node:crypto'
import { Effect, Schema, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import type { ExternalSource } from '../../domain/literals.ts'
import { ExternalImport, GameEdition } from '../../domain/tables.ts'
import { rows } from '../rows.ts'

export class InvalidExport extends Schema.TaggedError<InvalidExport>()('ExportacionInvalida', { reason: Schema.String }) {}

export class UnreachableSource extends Schema.TaggedError<UnreachableSource>()('FuenteInalcanzable', { reason: Schema.String }) {}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Runs an importer's whole read; a failure that is not already an InvalidExport becomes one. */
export const readInput = <A>(read: () => Promise<A>) =>
  Effect.tryPromise({
    try: read,
    catch: (e) => (e instanceof InvalidExport ? e : new InvalidExport({ reason: `no se pudo leer la entrada (${message(e)})` })),
  })

const SteamEdition = GameEdition.mapFields(Struct.pick(['id'])).mapFields(Struct.assign({ app_id: Schema.String }))
export type SteamEdition = typeof SteamEdition.Type

/** The catalog's Steam editions with an app id, the only rows an external import can match. */
export const steamEditions = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  rows(
    SteamEdition,
    sql`
      SELECT e.id, e.external_id AS app_id
      FROM game_edition e JOIN launcher l ON l.id = e.launcher_id
      WHERE l.name = 'Steam' AND e.external_id IS NOT NULL`,
  ),
)

const steamAppsDigest = (editions: ReadonlyArray<SteamEdition>) =>
  createHash('sha256')
    .update(editions.map((e) => e.app_id).sort().join('\n'))
    .digest('hex')

/**
 * Called inside an importer's transaction with the editions it matched against. `file` is the upstream file's
 * blob sha for `--latest`, or null for a file or stdin, whose origin is unknown.
 */
export const recordImport = (source: ExternalSource, file: string | null, editions: ReadonlyArray<SteamEdition>) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    file === null
      ? sql`DELETE FROM external_import WHERE source = ${source}`
      : sql`
          INSERT INTO external_import ${sql.insert({ source, file_sha: file, steam_apps: steamAppsDigest(editions) })}
          ON CONFLICT (source) DO UPDATE SET file_sha = EXCLUDED.file_sha, steam_apps = EXCLUDED.steam_apps`,
  )

/** True when `source` last imported this upstream file against the catalog's current Steam games. */
export const alreadyImported = (source: ExternalSource, file: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [last] = yield* rows(ExternalImport, sql`SELECT * FROM external_import WHERE source = ${source}`)
    return last !== undefined && last.file_sha === file && last.steam_apps === steamAppsDigest(yield* steamEditions)
  })

export type UpstreamFile = { readonly name: string; readonly sha: string; readonly size: number; readonly url: string }

const ListedFile = Schema.Struct({
  name: Schema.String,
  sha: Schema.String,
  size: Schema.Int,
  type: Schema.String,
  download_url: Schema.NullOr(Schema.String),
})
const decodeListing = Schema.decodeUnknownEffect(Schema.Array(ListedFile))

// The response body as it arrives. GitHub asks API clients for a User-Agent. Node's fetch already fails a body
// that sends nothing for 5 minutes; the deadline, which covers reading the body too, also ends a trickle.
const get = (url: string, timeoutMs: number) =>
  Effect.tryPromise({
    try: async () => {
      const { ok, status, body } = await fetch(url, { headers: { 'User-Agent': 'opengame-linux' }, signal: AbortSignal.timeout(timeoutMs) })
      if (!ok || body === null) throw new Error(`HTTP ${status}`)
      return body
    },
    catch: (e) => new UnreachableSource({ reason: `${url} no respondió (${message(e)})` }),
  })

const listing = (directory: string) =>
  Effect.gen(function* () {
    const url = `https://api.github.com/repos/${directory}`
    const body = yield* get(url, 60_000)
    const files = yield* Effect.tryPromise({ try: () => new Response(body).json(), catch: () => undefined }).pipe(
      Effect.flatMap(decodeListing),
      Effect.mapError(() => new UnreachableSource({ reason: `${url} no devolvió una lista de archivos` })),
    )
    return files.flatMap(({ name, sha, size, type, download_url: url }) => (type === 'file' && url !== null ? [{ name, sha, size, url }] : []))
  })

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const exportName = /^reports_([a-z]{3})(\d{1,2})_(\d{4})\.tar\.gz$/

// The export's own name carries its date, as in reports_oct1_2026.tar.gz; anything else in reports/ is not an export.
const exportDay = (name: string): number | null => {
  const [, month = '', day, year] = exportName.exec(name) ?? []
  const m = months.indexOf(month)
  return m === -1 ? null : Date.UTC(Number(year), m, Number(day))
}

/** The newest `reports_<month><day>_<year>.tar.gz` in a listing of ProtonDB's reports/ directory. */
export const newestExport = (files: ReadonlyArray<UpstreamFile>): UpstreamFile | undefined => {
  let newest: { file: UpstreamFile; day: number } | undefined
  for (const file of files) {
    const day = exportDay(file.name)
    if (day !== null && (newest === undefined || day > newest.day)) newest = { file, day }
  }
  return newest?.file
}

const found = (file: UpstreamFile | undefined, missing: string) =>
  file === undefined ? Effect.fail(new UnreachableSource({ reason: missing })) : Effect.succeed(file)

export const latestProtonDbExport = Effect.flatMap(listing('bdefore/protondb-data/contents/reports'), (files) =>
  found(newestExport(files), 'bdefore/protondb-data no tiene ningún export en reports/'),
)

export const latestAntiCheatList = Effect.flatMap(listing('AreWeAntiCheatYet/AreWeAntiCheatYet/contents'), (files) =>
  found(
    files.find((f) => f.name === 'games.json'),
    'AreWeAntiCheatYet no tiene games.json',
  ),
)

/**
 * Passes the bytes through, then fails unless they are the listed file: its size and git blob sha. A branch URL
 * can serve the previous content for minutes after a commit, and recording the new sha with old bytes would skip
 * the new version until the next one. The importers read everything before writing, so a mismatch changes nothing.
 */
export const checkedAgainst = (file: UpstreamFile) => {
  const hash = createHash('sha1').update(`blob ${file.size}\0`)
  let size = 0
  return new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
    transform(chunk, controller) {
      hash.update(chunk)
      size += chunk.byteLength
      controller.enqueue(chunk)
    },
    flush() {
      if (size !== file.size || hash.digest('hex') !== file.sha)
        throw new InvalidExport({ reason: `lo descargado no es la versión de ${file.name} que lista GitHub` })
    },
  })
}

/** The file's bytes as they arrive. The 70 MB ProtonDB export took 9 minutes at 200 KB/s, so it gets 2 hours. */
export const download = (file: UpstreamFile) => Effect.map(get(file.url, 2 * 60 * 60_000), (body) => body.pipeThrough(checkedAgainst(file)))

export async function* utf8(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  for await (const chunk of chunks) yield decoder.decode(chunk, { stream: true })
  yield decoder.decode()
}

const BLOCK = 512

const field = (header: Uint8Array, start: number, length: number) => {
  const bytes = header.subarray(start, start + length)
  const end = bytes.indexOf(0)
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end))
}

const octal = (header: Uint8Array, start: number, length: number) => {
  const text = field(header, start, length).trim()
  return /^[0-7]+$/.test(text) ? Number.parseInt(text, 8) : NaN
}

// The checksum is the byte sum of the header with its own 8-byte field read as spaces.
const checksumMatches = (header: Uint8Array) => {
  let sum = 8 * 0x20
  for (let i = 0; i < BLOCK; i++) if (i < 148 || i >= 156) sum += header[i] ?? 0
  return sum === octal(header, 148, 8)
}

const REGULAR = new Set([0, 0x30, 0x37])

/**
 * Yields the bytes of the first regular file in a tar stream whose name ends in `suffix`, as they arrive,
 * so an export never touches the disk or sits whole in memory. Every other entry, including pax and GNU
 * long-name records, is skipped; the name is the header's 100-byte field, so a longer one is not matched.
 * It reads the stream to its end, so `checkedAgainst` sees every byte. Fails on a header that is not tar, a
 * truncated stream, or no such file.
 */
export async function* tarFile(chunks: AsyncIterable<Uint8Array>, suffix: string): AsyncGenerator<Uint8Array> {
  const header = new Uint8Array(BLOCK)
  let filled = 0
  let skip = 0
  let left = 0
  let found = false
  for await (const chunk of chunks) {
    let i = 0
    while (i < chunk.length) {
      if (left > 0) {
        const part = chunk.subarray(i, i + left)
        left -= part.length
        i += part.length
        yield part
      } else if (found) i = chunk.length
      else if (skip > 0) {
        const n = Math.min(skip, chunk.length - i)
        skip -= n
        i += n
      } else {
        const n = Math.min(BLOCK - filled, chunk.length - i)
        header.set(chunk.subarray(i, i + n), filled)
        filled += n
        i += n
        if (filled < BLOCK) continue
        filled = 0
        if (header.every((b) => b === 0)) throw new InvalidExport({ reason: `el .tar no contiene un archivo ${suffix}` })
        const size = octal(header, 124, 12)
        if (!checksumMatches(header) || Number.isNaN(size)) throw new InvalidExport({ reason: 'no es un archivo .tar' })
        if (REGULAR.has(header[156] ?? -1) && field(header, 0, 100).endsWith(suffix)) {
          left = size
          found = true
        } else skip = Math.ceil(size / BLOCK) * BLOCK
      }
    }
  }
  if (found && left === 0) return
  throw new InvalidExport({ reason: left > 0 || skip > 0 || filled > 0 ? 'el .tar está truncado' : `el .tar no contiene un archivo ${suffix}` })
}

/** The text of the one .json file in a .tar.gz stream, as ProtonDB publishes it. Nothing is written to disk. */
export const jsonInTarGz = (stream: ReadableStream<BufferSource>) => utf8(tarFile(stream.pipeThrough(new DecompressionStream('gzip')), '.json'))
