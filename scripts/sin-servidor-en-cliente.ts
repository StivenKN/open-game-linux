// Build guard (pnpm check): fails if server-only code reached the browser bundle (spike gotcha 3).
// Ran against this sketch's build in /tmp: dist/client has no match; Effect Schema ships at ~29 kB gzip.
import { readdirSync, readFileSync } from 'node:fs'

const dir = 'dist/client/assets'
// mem_info_vram_total only appears in the detector script, which the /opengame-detect.sh handler reads on the server.
const marcas = /better-auth\/(?!react)|PgClient|withTransaction|getSession|og_solo_revision|DATABASE_URL|mem_info_vram_total/
const fugas = readdirSync(dir).filter((f) => f.endsWith('.js') && marcas.test(readFileSync(`${dir}/${f}`, 'utf8')))
if (fugas.length > 0) {
  console.error(`Código de servidor en el bundle del navegador: ${fugas.join(', ')}. Una ruta o ui/ importa src/servidor/.`)
  process.exit(1)
}
