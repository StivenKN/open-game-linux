import { execFileSync } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Schema } from 'effect'

// Renames route params per map.json `params`: every whole-word use inside `include`, and the route files whose
// names carry one. symbols.ts cannot, because a param's name lives in file names and path strings, not in a
// declaration. Run it before symbols.ts, whose map names the renamed files.
const ParamMap = Schema.Struct({
  params: Schema.Struct({ rename: Schema.Record(Schema.String, Schema.String), include: Schema.Array(Schema.String) }),
  frozen: Schema.Array(Schema.String),
})

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const map = Schema.decodeUnknownSync(Schema.fromJsonString(ParamMap))(readFileSync(join(import.meta.dirname, 'map.json'), 'utf8'))

// `_` may follow a param: `$juegoId_` is TanStack's opt-out of the parent layout.
const token = new RegExp(String.raw`(?<![A-Za-z0-9])(${Object.keys(map.params.rename).join('|')})(?![A-Za-z0-9])`, 'g')
const renamed = (text: string) => text.replace(token, (name: string) => map.params.rename[name] ?? name)

const tracked = execFileSync('git', ['ls-files', '-z', '--', ...map.params.include], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter((f) => f !== '' && !map.frozen.some((dir) => f.startsWith(dir)))

let mentions = 0
for (const file of tracked) {
  const before = readFileSync(join(root, file), 'utf8')
  const after = renamed(before)
  if (after === before) continue
  mentions += before.match(token)?.length ?? 0
  writeFileSync(join(root, file), after)
}
const moves = tracked.filter((f) => f.startsWith('src/routes/') && renamed(f) !== f)
for (const file of moves) renameSync(join(root, file), join(root, renamed(file)))

console.log(`renamed ${mentions} param mentions and moved ${moves.length} route files`)
for (const file of moves) console.log(`${file}\t${renamed(file)}`)
