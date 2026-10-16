import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

type Check = 'missing' | 'bytes' | 'pixels' | 'markup' | 'payload'
type Difference = { readonly file: string; readonly check: Check; readonly detail: string }

const HARNESS = dirname(new URL(import.meta.url).pathname)

export const compare = async (base: string, head: string, diffDir: string) => {
  const map = markupMap()
  const files = [...new Set([...list(join(base, 'captures')), ...list(join(head, 'captures'))])].sort()
  const differences: Array<Difference> = []
  for (const file of files) {
    const a = join(base, 'captures', file)
    const b = join(head, 'captures', file)
    if (!existsSync(a) || !existsSync(b)) {
      differences.push({ file, check: 'missing', detail: `  only in ${existsSync(a) ? 'base' : 'head'}` })
      continue
    }
    if (file.endsWith('.png')) {
      const detail = await pixels(a, b, join(diffDir, file))
      if (detail !== null) differences.push({ file, check: 'pixels', detail })
    } else if (file.endsWith('.html')) {
      differences.push(...html(file, readFileSync(a, 'utf8'), unmapMarkup(readFileSync(b, 'utf8'), map)))
    } else {
      const detail = firstDifference(readFileSync(a, 'utf8'), readFileSync(b, 'utf8'))
      if (detail !== null) differences.push({ file, check: 'bytes', detail })
    }
  }
  for (const d of differences) console.log(`✗ ${d.file} [${d.check}]\n${d.detail}`)
  console.log(`parity: ${differences.length} differences across ${files.length} captures`)
  return differences.length
}

const list = (dir: string): Array<string> =>
  existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(dir.length + 1)) : []

const html = (file: string, a: string, b: string): Array<Difference> => {
  const differences: Array<Difference> = []
  const markup = firstDifference(withoutScripts(a), withoutScripts(b))
  if (markup !== null) differences.push({ file, check: 'markup', detail: markup })
  const [pa, pb] = [erasedKeys(a), erasedKeys(b)]
  const values = firstDifference(pa.values, pb.values)
  if (values !== null || pa.keys !== pb.keys) differences.push({ file, check: 'payload', detail: `  keys ${pa.keys} vs ${pb.keys}${values === null ? '' : `\n${values}`}` })
  return differences
}

const eraseAssetNames = (text: string) => text.replaceAll(/\/assets\/[\w.-]+/g, '/assets/~')

const withoutScripts = (html: string) => eraseAssetNames(html.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''))

const inlineScripts = (html: string) => [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')

const token = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|([{,])\s*([A-Za-z_$][\w$]*|\d+|"(?:[^"\\]|\\.)*")\s*:|[^"'`{,]+|[\s\S]/gy

// The dehydrated router state is JavaScript (seroval), not JSON.
// TanStack route ids in strings carry param names (`#juegos#$juegoId#juegos#1`), which P5 renames.
const erasedKeys = (html: string) => {
  let keys = 0
  const values = eraseAssetNames(inlineScripts(html)).replaceAll(token, (match, opener: string | undefined) => {
    if (opener !== undefined) {
      keys++
      return `${opener}:`
    }
    return /^"[#/]|^"__root__/.test(match) ? match.replaceAll(/\$[A-Za-z_]\w*/g, '$') : match
  })
  return { keys, values }
}

const markupMap = (): ReadonlyMap<string, string> => {
  const raw: unknown = JSON.parse(readFileSync(join(HARNESS, 'markup-map.json'), 'utf8'))
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('markup-map.json must be an object of old name to new name')
  const inverse = new Map<string, string>()
  for (const [old, renamed] of Object.entries(raw)) {
    if (typeof renamed !== 'string') throw new Error(`markup-map.json: ${old} must map to a string`)
    inverse.set(renamed, old)
  }
  return inverse
}

const unmapMarkup = (html: string, inverse: ReadonlyMap<string, string>) => {
  if (inverse.size === 0) return html
  const names = [...inverse.keys()].sort((x, y) => y.length - x.length).map((n) => n.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const name = new RegExp(`(?<![\\w-])(?:${names.join('|')})(?![\\w-])`, 'g')
  return html.replaceAll(/<[^>]+>/g, (tag) => tag.replaceAll(name, (n) => inverse.get(n) ?? n))
}

const firstDifference = (a: string, b: string) => {
  if (a === b) return null
  let i = 0
  while (a[i] === b[i]) i++
  const around = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 60), i + 60))
  return `  base ${around(a)}\n  head ${around(b)}`
}

const pixels = async (a: string, b: string, diff: string) => {
  if (readFileSync(a).equals(readFileSync(b))) return null
  mkdirSync(dirname(diff), { recursive: true })
  const { code, stderr } = await exec('magick', ['compare', '-metric', 'AE', a, b, diff])
  if (code === 0) return null
  if (code === null) return '  PNG bytes differ; install ImageMagick (magick) to measure the pixel difference'
  return `  AE ${stderr.trim()}, diff image ${diff}`
}

const exec = (command: string, args: ReadonlyArray<string>) =>
  new Promise<{ code: number | null; stderr: string }>((done) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()))
    child.on('error', () => done({ code: null, stderr }))
    child.on('close', (code) => done({ code, stderr }))
  })
