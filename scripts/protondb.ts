// `pnpm db:protondb <reports_piiremoved.json | ->`: imports ProtonDB's monthly export, from a file or stdin:
// `tar -xzOf reports_oct1_2026.tar.gz | pnpm db:protondb -`. Run it again after adding Steam games.
import { createReadStream } from 'node:fs'
import { Effect } from 'effect'
import { importarProtonDb, resumenImportacion } from '../src/servidor/externo/protondb.ts'
import { PgLive } from '../src/servidor/runtime.ts'

const ruta = process.argv[2]
if (ruta === undefined) {
  console.error('Uso: pnpm db:protondb <reports_piiremoved.json | ->')
  process.exit(2)
}

const programa = importarProtonDb(ruta === '-' ? process.stdin.setEncoding('utf8') : createReadStream(ruta, { encoding: 'utf8' })).pipe(
  Effect.catchTag('ExportacionInvalida', (e) => Effect.die(`ProtonDB: ${e.motivo}. No se cambió nada.`)),
  Effect.flatMap((r) => Effect.log(resumenImportacion(r))),
  Effect.provide(PgLive),
)

Effect.runPromise(programa).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
