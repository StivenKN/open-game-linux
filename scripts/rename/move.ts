import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { Schema } from 'effect'
import { Project } from 'ts-morph'

const Paths = Schema.Record(Schema.String, Schema.String)
const RenameMap = Schema.Struct({
  dirs: Paths,
  files: Paths,
  frozen: Schema.Array(Schema.String),
  text: Schema.Struct({ include: Schema.Array(Schema.String), exclude: Schema.Array(Schema.String) }),
})

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const map = Schema.decodeUnknownSync(Schema.fromJsonString(RenameMap))(readFileSync(join(import.meta.dirname, 'map.json'), 'utf8'))

type Pairs = ReadonlyArray<readonly [string, string]>
const longestFirst = (pairs: Pairs) => [...pairs].sort(([a], [b]) => b.length - a.length)
const dirs = longestFirst(Object.entries(map.dirs))
const dirsBack = longestFirst(dirs.map(([from, to]) => [to, from] as const))
const filesBack = new Map(Object.entries(map.files).map(([from, to]) => [to, from]))

const viaDirs = (path: string, table: Pairs) => {
  const dir = table.find(([from]) => path.startsWith(from))
  return dir === undefined ? path : dir[1] + path.slice(dir[0].length)
}
const target = (path: string) => map.files[path] ?? viaDirs(path, dirs)
const preMovePath = (path: string) => filesBack.get(path) ?? viaDirs(path, dirsBack)
const parentDir = (path: string) => `${posix.dirname(path)}/`

for (const [from, to] of [...dirs, ...Object.entries(map.files)]) {
  if (from.split('/').length !== to.split('/').length) throw new Error(`${from} -> ${to} changes depth`)
}
for (const [from, to] of Object.entries(map.files)) {
  if (viaDirs(parentDir(from), dirs) !== parentDir(to)) throw new Error(`${from} -> ${to} disagrees with its directory's move`)
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
const missing = tracked.filter((f) => !existsSync(join(root, f)))
if (missing.length > 0) {
  console.error(`${missing.length} tracked files are missing, first ${missing[0]}. Commit or discard the earlier run, then rerun.`)
  process.exit(1)
}
const live = tracked.filter((f) => !map.frozen.some((dir) => f.startsWith(dir)))
const moves = live.filter((f) => target(f) !== f).map((f) => [f, target(f)] as const)

const rewriteSpecifiers = () => {
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true })
  let count = 0
  for (const file of live.filter((f) => /\.tsx?$/.test(f))) {
    const newFile = target(file)
    for (const literal of project.addSourceFileAtPath(join(root, file)).getImportStringLiterals()) {
      const spec = literal.getLiteralValue()
      const [path = '', query = ''] = spec.split(/(?=\?)/)
      const alias = path.startsWith('#/')
      if (!alias && !path.startsWith('.')) continue
      const moved = target(alias ? posix.join('src', path.slice(2)) : posix.join(posix.dirname(file), path))
      const rel = alias ? `#/${posix.relative('src', moved)}` : posix.relative(posix.dirname(newFile), moved)
      const next = (alias || rel.startsWith('.') ? rel : `./${rel}`) + query
      if (next !== spec) {
        literal.setLiteralValue(next)
        count++
      }
    }
  }
  project.saveSync()
  return count
}

const moveFiles = () => {
  for (const [from, to] of moves) {
    mkdirSync(join(root, posix.dirname(to)), { recursive: true })
    renameSync(join(root, from), join(root, to))
  }
  const pruneEmpty = (dir: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) pruneEmpty(join(dir, entry.name))
    if (readdirSync(dir).length === 0) rmdirSync(dir)
  }
  for (const [from] of dirs) pruneEmpty(join(root, from))
}

const newRunsByOldRun = () => {
  const runs = new Map<string, Set<string>>()
  const add = (from: string, to: string) => {
    const a = from.split('/')
    const b = to.split('/')
    for (let i = 0; i < a.length; i++) {
      const key = a.slice(i).join('/')
      runs.set(key, (runs.get(key) ?? new Set<string>()).add(b.slice(i).join('/')))
    }
  }
  const stem = (p: string) => p.replace(/\.[^/.]+$/, '')
  for (const path of live.map(preMovePath)) {
    add(path, target(path))
    add(stem(path), stem(target(path)))
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) {
      const dir = `${parts.slice(0, i).join('/')}/`
      add(dir, target(dir))
      add(dir.slice(0, -1), target(dir).slice(0, -1))
    }
  }
  return runs
}

const rewriteMentions = () => {
  const looksLikePath = (run: string) => run.includes('/') || /\.\w+$/.test(run)
  const rewrites = new Map(
    [...newRunsByOldRun()].flatMap(([run, targets]) => {
      const [to = run] = targets
      const unambiguous = targets.size === 1
      return unambiguous && to !== run && looksLikePath(run) ? [[run, to] as const] : []
    }),
  )
  if (rewrites.size === 0) return []
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const runs = [...rewrites.keys()].sort((a, b) => b.length - a.length).map(escape)
  const notMidPath = String.raw`(?<![\w.$\[\]/-])`
  const afterRelativeOrAlias = String.raw`(?<=${notMidPath}(?:\.\.?/)+|#/)`
  const runEnds = String.raw`(?![\w-]|\.\w)`
  const pattern = new RegExp(String.raw`(?:${notMidPath}|${afterRelativeOrAlias})(?:${runs.join('|')})${runEnds}`, 'g')

  const within = (file: string, prefixes: ReadonlyArray<string>) => prefixes.some((p) => file.startsWith(target(p)))
  const log: string[] = []
  for (const file of tracked.map(target).filter((f) => within(f, map.text.include) && !within(f, map.text.exclude))) {
    const before = readFileSync(join(root, file), 'utf8')
    const after = before.replace(pattern, (match: string, offset: number) => {
      const next = rewrites.get(match) ?? match
      log.push(`${file}:${before.slice(0, offset).split('\n').length}\t${match}\t${next}`)
      return next
    })
    if (after !== before) writeFileSync(join(root, file), after)
  }
  return log
}

const specifiers = rewriteSpecifiers()
moveFiles()
const mentions = rewriteMentions()
console.log(`moved ${moves.length} files, rewrote ${specifiers} module specifiers and ${mentions.length} path mentions`)
for (const line of mentions) console.log(line)
