// `pnpm db:anticheat <games.json | - | --latest>`: imports AreWeAntiCheatYet's list, from a file or stdin.
// `--latest` downloads games.json from AreWeAntiCheatYet/AreWeAntiCheatYet on GitHub, and downloads nothing
// when it already imported that version of the file for today's catalog.
import { createReadStream } from 'node:fs'
import { Effect } from 'effect'
import { antiCheatSummary, importAntiCheat } from '../src/server/external/anticheat.ts'
import { alreadyImported, download, latestAntiCheatList, utf8 } from '../src/server/external/sources.ts'
import { PgLive } from '../src/server/runtime.ts'

const path = process.argv[2]
if (path === undefined) {
  console.error('Usage: pnpm db:anticheat <games.json | - | --latest>')
  process.exit(2)
}

// Opened on first read, inside the import, so a missing file fails the import instead of crashing Node.
async function* chunks(source: string): AsyncGenerator<string> {
  yield* source === '-' ? process.stdin.setEncoding('utf8') : createReadStream(source, { encoding: 'utf8' })
}

const latest = Effect.gen(function* () {
  const file = yield* latestAntiCheatList
  if (yield* alreadyImported('anticheat', file.sha)) return `AreWeAntiCheatYet: games.json ${file.sha.slice(0, 7)} ya está importado para este catálogo; nada que descargar.`
  const list = utf8(yield* download(file))
  return `${antiCheatSummary(yield* importAntiCheat(list, file.sha))} Fuente: games.json ${file.sha.slice(0, 7)}.`
})

const program = (path === '--latest' ? latest : Effect.map(importAntiCheat(chunks(path), null), antiCheatSummary)).pipe(
  Effect.catchTags({
    ExportacionInvalida: (e) => Effect.die(`AreWeAntiCheatYet: ${e.reason}. Nothing changed.`),
    FuenteInalcanzable: (e) => Effect.die(`AreWeAntiCheatYet: ${e.reason}. Nothing changed.`),
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
