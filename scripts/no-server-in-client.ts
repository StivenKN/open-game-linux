import { readdirSync, readFileSync } from 'node:fs'

const dir = '.output/public/assets'
const markers = /better-auth\/(?!react)|PgClient|withTransaction|getSession|og_review_only|DATABASE_URL|mem_info_vram_total|OPENGAME_TABLA_GPU|Win32_VideoController|resvgjs|satori_/
const leaks = readdirSync(dir).filter((f) => f.endsWith('.js') && markers.test(readFileSync(`${dir}/${f}`, 'utf8')))
if (leaks.length > 0) {
  console.error(`Server code in the browser bundle: ${leaks.join(', ')}. A route or ui/ file imports src/server/ or src/images/.`)
  process.exit(1)
}
