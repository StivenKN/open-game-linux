// `pnpm db:protondb <reports_piiremoved.json | - | --latest>`: imports ProtonDB's monthly export, from a file or
// stdin (`tar -xzOf reports_oct1_2026.tar.gz | pnpm db:protondb -`). `--latest` streams the newest export from
// bdefore/protondb-data on GitHub, and downloads nothing when it already imported that export for today's catalog.
import { createReadStream } from 'node:fs'
import { Effect } from 'effect'
import { importProtonDb, importSummary } from '../src/server/external/protondb.ts'
import { alreadyImported, download, jsonInTarGz, latestProtonDbExport } from '../src/server/external/sources.ts'
import { PgLive } from '../src/server/runtime.ts'

const path = process.argv[2]
if (path === undefined) {
  console.error('Usage: pnpm db:protondb <reports_piiremoved.json | - | --latest>')
  process.exit(2)
}

// Opened on first read, inside the import, so a missing file fails the import instead of crashing Node.
async function* chunks(source: string): AsyncGenerator<string> {
  yield* source === '-' ? process.stdin.setEncoding('utf8') : createReadStream(source, { encoding: 'utf8' })
}

const latest = Effect.gen(function* () {
  const file = yield* latestProtonDbExport
  if (yield* alreadyImported('protondb', file.sha)) return `ProtonDB: ${file.name} ya está importado para este catálogo; nada que descargar.`
  const export_ = jsonInTarGz(yield* download(file))
  return `${importSummary(yield* importProtonDb(export_, file.sha))} Fuente: ${file.name}.`
})

const program = (path === '--latest' ? latest : Effect.map(importProtonDb(chunks(path), null), importSummary)).pipe(
  Effect.catchTags({
    ExportacionInvalida: (e) => Effect.die(`ProtonDB: ${e.reason}. Nothing changed.`),
    FuenteInalcanzable: (e) => Effect.die(`ProtonDB: ${e.reason}. Nothing changed.`),
  }),
  Effect.flatMap(Effect.log),
  Effect.provide(PgLive),
)

Effect.runPromise(program).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
