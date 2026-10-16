import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

type Check = 'missing' | 'bytes' | 'pixels' | 'markup' | 'payload'
type Difference = { readonly file: string; readonly check: Check; readonly detail: string }

const HARNESS = dirname(new URL(import.meta.url).pathname)

export const compare = async (base: string, head: string, diffDir: string) => {
  const map = parseMarkupMap(JSON.parse(readFileSync(join(HARNESS, 'markup-map.json'), 'utf8')))
  const literals = readFrozenLiterals(base)
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
      differences.push(...html(file, readFileSync(a, 'utf8'), unmapMarkup(readFileSync(b, 'utf8'), map), literals))
    } else {
      const read = (path: string) => {
        const text = readFileSync(path, 'utf8')
        return basename(file) === 'signin.json' ? withSecretLengthsOnly(text) : text
      }
      const detail = firstDifference(read(a), read(b))
      if (detail !== null) differences.push({ file, check: 'bytes', detail })
    }
  }
  for (const d of differences) console.log(`✗ ${d.file} [${d.check}]\n${d.detail}`)
  console.log(`parity: ${differences.length} differences across ${files.length} captures`)
  console.log(`harness: ${harnessHash()}`)
  return differences.length
}

const list = (dir: string): Array<string> =>
  existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(dir.length + 1)) : []

const html = (file: string, a: string, b: string, literals: ReadonlySet<string>): Array<Difference> => {
  const differences: Array<Difference> = []
  const markup = firstDifference(withoutScripts(a), withoutScripts(b))
  if (markup !== null) differences.push({ file, check: 'markup', detail: markup })
  const [pa, pb] = [eraseIdentifierKeys(a, literals), eraseIdentifierKeys(b, literals)]
  const values = firstDifference(pa.values, pb.values)
  if (values !== null || pa.keys !== pb.keys) differences.push({ file, check: 'payload', detail: `  keys ${pa.keys} vs ${pb.keys}${values === null ? '' : `\n${values}`}` })
  return differences
}

const eraseAssetNames = (text: string) => text.replaceAll(/\/assets\/[\w.-]+/g, '/assets/~')

const withoutScripts = (html: string) => eraseAssetNames(html.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''))

const inlineScripts = (html: string) => [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')

const withoutParamNames = (text: string) => text.replaceAll(/\$[A-Za-z_]\w*/g, '$')

const isDataKey = (name: string, literals: ReadonlySet<string>) => /^\d+$/.test(name) || literals.has(name)

// The dehydrated router state is JavaScript (seroval), not JSON.
const token = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|([{,])\s*([A-Za-z_$][\w$]*|\d+|"(?:[^"\\]|\\.)*")\s*:|[^"'`{,]+|[\s\S]/gy

export const eraseIdentifierKeys = (html: string, literals: ReadonlySet<string>) => {
  let keys = 0
  const values = eraseAssetNames(inlineScripts(html)).replaceAll(token, (match, opener: string | undefined, key: string | undefined) => {
    if (opener === undefined || key === undefined) return /^"[#/]|^"__root__/.test(match) ? withoutParamNames(match) : match
    keys++
    const name = key.startsWith('"') ? key.slice(1, -1) : key
    if (isDataKey(name, literals)) return `${opener}${key}:`
    if (name.startsWith('/')) return `${opener}${withoutParamNames(key)}:`
    return `${opener}:`
  })
  return { keys, values }
}

const readFrozenLiterals = (base: string): ReadonlySet<string> => {
  const file = join(base, 'frozen-literals.json')
  if (!existsSync(file)) throw new Error(`${file} is missing; capture the base again with this harness`)
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(raw) || !raw.every((l) => typeof l === 'string')) throw new Error(`${file} must be an array of strings`)
  return new Set(raw)
}

const sections = ['classes', 'ids', 'customProperties', 'dataAttributes', 'formFields'] as const
type Section = (typeof sections)[number]
export type HeadToBaseNames = Readonly<Record<Section, ReadonlyMap<string, string>>>

const prefixes: Partial<Record<Section, string>> = { customProperties: '--', dataAttributes: 'data-' }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export const parseMarkupMap = (raw: unknown): HeadToBaseNames => {
  if (!isRecord(raw)) throw new Error('markup-map.json must be an object')
  const unknown = Object.keys(raw).filter((k) => !sections.some((s) => s === k))
  if (unknown.length > 0) throw new Error(`markup-map.json: unknown sections ${unknown.join(', ')}; use ${sections.join(', ')}`)
  const inverse = (section: Section) => {
    const pairs = raw[section] ?? {}
    if (!isRecord(pairs)) throw new Error(`markup-map.json: ${section} must be an object of old name to new name`)
    const prefix = prefixes[section] ?? ''
    const back = new Map<string, string>()
    for (const [old, renamed] of Object.entries(pairs)) {
      if (typeof renamed !== 'string') throw new Error(`markup-map.json: ${section}.${old} must map to a string`)
      if (!old.startsWith(prefix) || !renamed.startsWith(prefix)) throw new Error(`markup-map.json: ${section} names start with ${prefix}`)
      if (back.has(renamed)) throw new Error(`markup-map.json: ${section} maps two names to ${renamed}`)
      back.set(renamed, old)
    }
    return back
  }
  return {
    classes: inverse('classes'),
    ids: inverse('ids'),
    customProperties: inverse('customProperties'),
    dataAttributes: inverse('dataAttributes'),
    formFields: inverse('formFields'),
  }
}

const idReferences = new Set(['id', 'for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage', 'aria-flowto'])
const reactUseIdPrefix = /^_[Rr]_[0-9a-z]+_/
const urlReferences = new Set(['fill', 'stroke', 'clip-path', 'mask', 'filter'])
const formControls = new Set(['input', 'select', 'textarea', 'button'])

export const unmapMarkup = (html: string, map: HeadToBaseNames) => {
  const back = (names: ReadonlyMap<string, string>) => (name: string) => names.get(name) ?? name
  const backId = (id: string) => {
    const prefix = reactUseIdPrefix.exec(id)?.[0] ?? ''
    return prefix + back(map.ids)(id.slice(prefix.length))
  }
  const each = (value: string, names: ReadonlyMap<string, string>) => value.replaceAll(/\S+/g, back(names))
  return html.replaceAll(/<([A-Za-z][\w-]*)([^>]*)>/g, (_, element: string, attributes: string) => {
    const mapped = attributes.replaceAll(/([^\s"'=/]+)(?:="([^"]*)")?/g, (whole, name: string, value: string | undefined) => {
      if (name.startsWith('data-')) return back(map.dataAttributes)(name) + whole.slice(name.length)
      if (value === undefined) return whole
      if (name === 'class') return `class="${each(value, map.classes)}"`
      if (idReferences.has(name)) return `${name}="${value.replaceAll(/\S+/g, backId)}"`
      if (urlReferences.has(name)) return `${name}="${value.replaceAll(/url\(#([^)\s]+)\)/g, (_, id: string) => `url(#${backId(id)})`)}"`
      if (name === 'style') return `style="${value.replaceAll(/--[\w-]+/g, back(map.customProperties))}"`
      if (name === 'name' && formControls.has(element)) return `name="${back(map.formFields)(value)}"`
      return whole
    })
    return `<${element}${mapped}>`
  })
}

const withSecretLengthsOnly = (text: string) => {
  const [status, body] = text.split('\n', 2)
  const masked = JSON.stringify(JSON.parse(body), (key, value: unknown) => (/token|secret/i.test(key) && typeof value === 'string' ? `<${value.length} characters>` : value))
  return `${status}\n${masked}\n`
}

const harnessHash = () => {
  const hash = createHash('sha256')
  for (const file of readdirSync(HARNESS).sort()) hash.update(readFileSync(join(HARNESS, file)))
  return hash.digest('hex')
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
