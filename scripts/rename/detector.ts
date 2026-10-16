import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Schema } from 'effect'

// Renames identifiers inside the detector scripts per map.json `detector`, keyed by file. A key renames a whole
// word only where the script reads it as code: shell words and `$name`, `${...}` and `$(...)` inside double quotes,
// awk programs outside their string literals, PowerShell outside quotes. Everything else in quotes is text the
// scripts print or send, and stays. A key written with its single quotes ('Marca') renames that exact PowerShell
// literal, for property names Sort-Object takes as strings. Rerunning renames nothing.
const DetectorMap = Schema.Struct({ detector: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String)) })

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const { detector } = Schema.decodeUnknownSync(Schema.fromJsonString(DetectorMap))(readFileSync(join(import.meta.dirname, 'map.json'), 'utf8'))

type Segment = { readonly code: boolean; readonly text: string }

const closing = (source: string, open: number, pair: '()' | '{}') => {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '\\') i++
    else if (source[i] === pair[0]) depth++
    else if (source[i] === pair[1] && --depth === 0) return i
  }
  throw new Error(`unclosed ${pair[0]} at offset ${open}`)
}

const commandStart = String.raw`(?:^|[|(;&]|\$\()\s*`
const awkOption = String.raw`\s+(?:-F\s*(?:'[^']*'|\S+)|-v\s+\S+)`
const awkProgramNext = new RegExp(String.raw`${commandStart}awk(?:${awkOption})*\s+$`)

const awkSegments = (program: string): ReadonlyArray<Segment> => {
  const out: Segment[] = []
  let at = 0
  for (const m of program.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    out.push({ code: true, text: program.slice(at, m.index) }, { code: false, text: m[0] })
    at = m.index + m[0].length
  }
  return [...out, { code: true, text: program.slice(at) }]
}

const doubleQuoted = (body: string): ReadonlyArray<Segment> => {
  const out: Segment[] = []
  let text = ''
  const flush = () => {
    if (text !== '') out.push({ code: false, text })
    text = ''
  }
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '\\') {
      text += body.slice(i, i + 2)
      i++
    } else if (c === '$' && (body[i + 1] === '(' || body[i + 1] === '{')) {
      const end = closing(body, i + 1, body[i + 1] === '(' ? '()' : '{}')
      flush()
      out.push(...(body[i + 1] === '(' ? [{ code: true, text: '$' }, ...shellSegments(body.slice(i + 1, end + 1))] : [{ code: true, text: body.slice(i, end + 1) }]))
      i = end
    } else if (c === '$' && /[A-Za-z_]/.test(body[i + 1] ?? '')) {
      const name = /^\$[A-Za-z_]\w*/.exec(body.slice(i))?.[0] ?? '$'
      flush()
      out.push({ code: true, text: name })
      i += name.length - 1
    } else if (c === '`') throw new Error('backticks in a double-quoted string are not supported')
    else text += c
  }
  flush()
  return out
}

function shellSegments(source: string): ReadonlyArray<Segment> {
  const out: Segment[] = []
  let code = ''
  const flush = () => {
    if (code !== '') out.push({ code: true, text: code })
    code = ''
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '\\') {
      code += source.slice(i, i + 2)
      i++
    } else if (c === '#' && /\s/.test(source[i - 1] ?? '\n')) {
      const end = source.indexOf('\n', i)
      code += source.slice(i, end === -1 ? undefined : end)
      i = (end === -1 ? source.length : end) - 1
    } else if (c === "'") {
      const end = source.indexOf("'", i + 1)
      if (end === -1) throw new Error(`unclosed single quote at offset ${i}`)
      const lineBefore = source.slice(source.lastIndexOf('\n', i - 1) + 1, i)
      flush()
      out.push({ code: false, text: "'" }, ...(awkProgramNext.test(lineBefore) ? awkSegments(source.slice(i + 1, end)) : [{ code: false, text: source.slice(i + 1, end) }]), { code: false, text: "'" })
      i = end
    } else if (c === '"') {
      let end = i + 1
      while (source[end] !== '"') {
        if (source[end] === '\\') end++
        else if (source[end] === '$' && source[end + 1] === '(') end = closing(source, end + 1, '()')
        end++
        if (end >= source.length) throw new Error(`unclosed double quote at offset ${i}`)
      }
      flush()
      out.push({ code: false, text: '"' }, ...doubleQuoted(source.slice(i + 1, end)), { code: false, text: '"' })
      i = end
    } else if (c === '<' && source[i + 1] === '<' && source[i + 2] !== '<') throw new Error('heredocs are not supported')
    else if (c === '`') throw new Error('backticks are not supported')
    else code += c
  }
  flush()
  return out
}

const powershellSegments = (source: string, quotedKeys: ReadonlySet<string>): ReadonlyArray<Segment> => {
  const out: Segment[] = []
  let code = ''
  const flush = () => {
    if (code !== '') out.push({ code: true, text: code })
    code = ''
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '@' && (source[i + 1] === "'" || source[i + 1] === '"') && source[i + 2] === '\n') throw new Error('here-strings are not supported')
    if (c === '#') {
      const end = source.indexOf('\n', i)
      code += source.slice(i, end === -1 ? undefined : end)
      i = (end === -1 ? source.length : end) - 1
    } else if (c === "'") {
      let end = i + 1
      while (source[end] !== "'" || source[end + 1] === "'") {
        end += source[end] === "'" ? 2 : 1
        if (end >= source.length) throw new Error(`unclosed single quote at offset ${i}`)
      }
      const literal = source.slice(i, end + 1)
      flush()
      out.push({ code: quotedKeys.has(literal), text: literal })
      i = end
    } else if (c === '"') {
      let end = i + 1
      while (source[end] !== '"') {
        end += source[end] === '`' ? 2 : 1
        if (end >= source.length) throw new Error(`unclosed double quote at offset ${i}`)
      }
      const literal = source.slice(i, end + 1)
      if (literal.includes('$')) throw new Error(`expandable string ${literal} is not supported`)
      flush()
      out.push({ code: false, text: literal })
      i = end
    } else code += c
  }
  flush()
  return out
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const renameFile = (file: string, entries: Readonly<Record<string, string>>) => {
  const powershell = file.endsWith('.ps1')
  const quotedKeys = new Set(Object.keys(entries).filter((k) => k.startsWith("'")))
  const names = Object.keys(entries).filter((k) => !quotedKeys.has(k))
  // PowerShell names may hold hyphens (Get-OgGpu) and ignore case.
  const word = powershell ? '[\\w-]' : '\\w'
  const pattern = new RegExp(`(?<!${word})(${names.map(escape).join('|')})(?!${word})`, powershell ? 'gi' : 'g')
  const hits = new Map<string, number>()
  const count = (key: string) => hits.set(key, (hits.get(key) ?? 0) + 1)

  const before = readFileSync(join(root, file), 'utf8')
  const segments = powershell ? powershellSegments(before, quotedKeys) : shellSegments(before)
  if (segments.map((s) => s.text).join('') !== before) throw new Error(`${file}: the lexer lost text`)
  const after = segments
    .map((s) => {
      if (!s.code) return s.text
      if (quotedKeys.has(s.text)) {
        count(s.text)
        return entries[s.text] ?? s.text
      }
      return s.text.replace(pattern, (name: string) => {
        const to = entries[name]
        if (to === undefined) throw new Error(`${file}: ${name} appears in a casing the map does not list`)
        count(name)
        return to
      })
    })
    .join('')

  const inText = segments
    .filter((s) => !s.code)
    .flatMap((s) => [...s.text.matchAll(pattern)].map((m) => m[0]))
  const unused = Object.keys(entries).filter((k) => !hits.has(k))
  const total = [...hits.values()].reduce((a, b) => a + b, 0)
  console.log(`${file}: ${total} renames across ${hits.size} names`)
  for (const [key, n] of hits) console.log(`  ${key} -> ${entries[key] ?? '?'}  x${n}`)
  if (inText.length > 0) console.log(`  left in quoted text: ${[...new Set(inText)].join(', ')}`)
  if (unused.length > 0 && total > 0) throw new Error(`${file}: map entries with no use: ${unused.join(', ')}`)
  if (after !== before) writeFileSync(join(root, file), after)
  return total
}

const total = Object.entries(detector).reduce((sum, [file, entries]) => sum + renameFile(file, entries), 0)
console.log(`detector: ${total} renames`)
