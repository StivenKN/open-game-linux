// `pnpm db:protondb <reports_piiremoved.json | ->`: imports ProtonDB's monthly export, from a file or stdin:
// `tar -xzOf reports_oct1_2026.tar.gz | pnpm db:protondb -`. Run it again after adding Steam games.
import { createReadStream } from 'node:fs'
import { Effect } from 'effect'
import { importProtonDb, importSummary } from '../src/server/external/protondb.ts'
import { PgLive } from '../src/server/runtime.ts'

const path = process.argv[2]
if (path === undefined) {
  console.error('Usage: pnpm db:protondb <reports_piiremoved.json | ->')
  process.exit(2)
}

// Opened on first read, inside the import, so a missing file fails the import instead of crashing Node.
async function* chunks(source: string): AsyncGenerator<string> {
  yield* source === '-' ? process.stdin.setEncoding('utf8') : createReadStream(source, { encoding: 'utf8' })
}

const program = importProtonDb(chunks(path)).pipe(
  Effect.catchTag('ExportacionInvalida', (e) => Effect.die(`ProtonDB: ${e.reason}. Nothing changed.`)),
  Effect.flatMap((r) => Effect.log(importSummary(r))),
  Effect.provide(PgLive),
)

Effect.runPromise(program).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
