import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Schema } from 'effect'
import { Node, Project, type SourceFile, SymbolFlags, type Type } from 'ts-morph'

// Renames declarations per map.json `symbols` through the TypeScript language service; rerunning changes nothing.
// `--list <prefix>` prints the declarations under a path prefix that the map leaves alone. Run `pnpm tsr generate`
// first: without the route tree, reads through route loaders have no types to link.
//
// `symbols` is keyed by file, then by a declaration's path: its enclosing declarations' names and its own,
// joined by dots (`planificar.actual` is the parameter `actual` of `planificar`). A path renames every
// declaration it names, so all members of a union move together. A `:prop` suffix names an object-literal
// property instead, for a returned object whose local shares the path.
const SymbolMap = Schema.Struct({
  glossary: Schema.Record(Schema.String, Schema.String),
  symbols: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String)),
  text: Schema.Struct({ include: Schema.Array(Schema.String), exclude: Schema.Array(Schema.String), keepInDocs: Schema.Array(Schema.String) }),
})

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const map = Schema.decodeUnknownSync(Schema.fromJsonString(SymbolMap))(readFileSync(join(import.meta.dirname, 'map.json'), 'utf8'))
const project = new Project({ tsConfigFilePath: join(root, 'tsconfig.json') })
const service = project.getLanguageService()

type Entries = Readonly<Record<string, string>>

const nameNodeOf = (node: Node) => {
  if (
    Node.isVariableDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isTypeAliasDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isParameterDeclaration(node) ||
    Node.isBindingElement(node) ||
    Node.isTypeParameterDeclaration(node) ||
    Node.isPropertySignature(node) ||
    Node.isPropertyAssignment(node) ||
    Node.isPropertyDeclaration(node) ||
    Node.isMethodDeclaration(node)
  ) {
    const name = node.getNameNode()
    return name !== undefined && Node.isIdentifier(name) ? name : undefined
  }
  return Node.isShorthandPropertyAssignment(node) ? node.getNameNode() : undefined
}

const isDeclaration = (node: Node) => nameNodeOf(node) !== undefined
const isObjectProperty = (node: Node) => Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)
const isProperty = (node: Node) => isObjectProperty(node) || Node.isPropertySignature(node) || Node.isPropertyDeclaration(node)
const nameOf = (node: Node) => nameNodeOf(node)?.getText() ?? ''

const declarationsIn = (file: SourceFile) => file.getDescendants().filter(isDeclaration)

const originalKeyOf = (node: Node, entries: Entries): string => {
  const enclosing = node.getFirstAncestor(isDeclaration)
  const prefix = enclosing === undefined ? '' : `${originalKeyOf(enclosing, entries).replace(/:prop$/, '')}.`
  const suffix = isObjectProperty(node) ? ':prop' : ''
  const sibling = (key: string) => key.startsWith(prefix) && key.endsWith(suffix) && !key.slice(prefix.length, key.length - suffix.length).includes('.')
  const renamedFrom = Object.keys(entries).find((key) => sibling(key) && entries[key] === nameOf(node))
  return renamedFrom ?? `${prefix}${nameOf(node)}${suffix}`
}

const inProject = (symbol: { getDeclarations(): Node[] }) =>
  symbol.getDeclarations().some((d) => {
    const path = d.getSourceFile().getFilePath()
    return path.startsWith(root) && !path.includes('/node_modules/')
  })

const assertNoCapture = (node: Node, to: string, key: string, entries: Entries) => {
  if (isProperty(node)) {
    if (node.getParentOrThrow().getChildren().some((s) => s !== node && nameOf(s) === to)) throw new Error(`${nameOf(node)} -> ${to}: a sibling member is already ${to}`)
    return
  }
  const name = nameNodeOf(node)
  if (name === undefined) return
  const target = name.getSymbol()
  const namedBySameKey = (s: { getDeclarations(): Node[] }) =>
    s.getDeclarations().every((d) => d.getSourceFile() === node.getSourceFile() && isDeclaration(d) && originalKeyOf(d, entries) === key)
  const renamed = service.findRenameLocations(name, { usePrefixAndSuffixText: true })
  for (const site of renamed.flatMap((l) => l.getSourceFile().getDescendantAtPos(l.getTextSpan().getStart()) ?? [])) {
    const clash = site
      .getSymbolsInScope(SymbolFlags.Value | SymbolFlags.Type | SymbolFlags.Namespace | SymbolFlags.Alias)
      .find((s) => s.getName() === to && s !== target && inProject(s) && !namedBySameKey(s))
    if (clash !== undefined) throw new Error(`${nameOf(node)} -> ${to} would capture ${to} at ${site.getSourceFile().getFilePath()}:${site.getStartLineNumber()}`)
  }
}

const collapseSelfPairs = (file: SourceFile) => {
  let count = 0
  for (const node of file.getDescendants().reverse()) {
    if (node.wasForgotten()) continue
    const pair = Node.isPropertyAssignment(node) ? [node.getNameNode(), node.getInitializer()] : Node.isBindingElement(node) ? [node.getPropertyNameNode(), node.getNameNode()] : []
    const [key, value] = pair
    if (key === undefined || value === undefined || !Node.isIdentifier(key) || !Node.isIdentifier(value) || key.getText() !== value.getText()) continue
    node.replaceWithText(node.getText().replace(/^[\w$]+\s*:\s*/, ''))
    count++
  }
  return count
}

/**
 * Applies the language service's rename locations with their prefix and suffix text, which keeps every object
 * shape. Applied here rather than through ts-morph's rename because a name that is both a value and a type
 * (`Usuario`) reports an aliased import specifier twice, and applying both garbled it into `UserUsuarioUser`.
 */
const applyRename = (name: Node, to: string) => {
  const locations = new Map<string, { file: SourceFile; start: number; end: number; text: string }>()
  for (const l of service.findRenameLocations(name, { usePrefixAndSuffixText: true })) {
    const file = l.getSourceFile()
    const span = l.getTextSpan()
    locations.set(`${file.getFilePath()}:${span.getStart()}`, { file, start: span.getStart(), end: span.getEnd(), text: `${l.getPrefixText() ?? ''}${to}${l.getSuffixText() ?? ''}` })
  }
  const edits = [...locations.values()].sort((a, b) => b.start - a.start)
  for (const { file, start, end, text } of edits) file.replaceText([start, end], text)
  return new Set(edits.map((e) => e.file))
}

const fileAt = (path: string) => project.getSourceFileOrThrow(join(root, path))

// Object-literal properties go before type members: renaming a member reaches a literal's property but not the
// reads typed by that literal.
type Phase = 'local' | 'literal' | 'member'
const phaseOf = (node: Node): Phase => (isObjectProperty(node) ? 'literal' : isProperty(node) ? 'member' : 'local')

// Renaming `{ a }` through its name would rename the local `a`, so a shorthand waits for its local's rename.
const skipped = new Set<Node>()

const nextRename = (phase: Phase) => {
  for (const [file, entries] of Object.entries(map.symbols)) {
    for (const node of declarationsIn(fileAt(file))) {
      if (phaseOf(node) !== phase || skipped.has(node)) continue
      const key = originalKeyOf(node, entries)
      const to = entries[key]
      if (to !== undefined && nameOf(node) !== to) return { file, key, from: nameOf(node), to, node }
    }
  }
  return undefined
}

const unmatchedEntries = () =>
  Object.entries(map.symbols).flatMap(([file, entries]) => {
    const keys = new Set(declarationsIn(fileAt(file)).map((node) => originalKeyOf(node, entries)))
    return Object.keys(entries).filter((key) => !keys.has(key)).map((key) => `${file}\t${key}`)
  })

const members = (type: Type): ReadonlyArray<Type> => (type.isUnion() ? type.getUnionTypes().flatMap(members) : [type])

const hasProperty = (type: Type, name: string) => members(type).some((t) => (t.getProperty(name) ?? t.getApparentType().getProperty(name)) !== undefined)

const expectedTypes = (literal: Node): ReadonlyArray<Type> => {
  const parent = literal.getParent()
  if (Node.isCallExpression(parent) && parent.getArguments()[0] === literal) {
    const callee = parent.getExpression()
    if (!Node.isPropertyAccessExpression(callee) || !['toEqual', 'toStrictEqual', 'toMatchObject'].includes(callee.getName())) return []
    let receiver = callee.getExpression()
    while (Node.isPropertyAccessExpression(receiver)) receiver = receiver.getExpression()
    const actual = Node.isCallExpression(receiver) && receiver.getExpression().getText() === 'expect' ? receiver.getArguments()[0] : undefined
    return actual === undefined ? [] : [actual.getType()]
  }
  if (Node.isPropertyAssignment(parent)) {
    const name = parent.getName()
    return expectedTypes(parent.getParentOrThrow()).flatMap(members).flatMap((t) => t.getProperty(name)?.getTypeAtLocation(literal) ?? [])
  }
  if (Node.isArrayLiteralExpression(parent)) return expectedTypes(parent).flatMap(members).flatMap((t) => t.getNumberIndexType() ?? [])
  return []
}

// The language service cannot link every reference: reads through an `as const` literal or a mapped type,
// `Pick<T, 'a'>` and `T['a']` keys, `'a' in x`, literals typed only by inference, and `toEqual` expectations.
const fixUnlinked = (files: ReadonlySet<SourceFile>, renamed: ReadonlyMap<string, ReadonlySet<string>>) => {
  const renamedPropertyOf = (from: string, type: Type | undefined) => {
    if (type === undefined || hasProperty(type, from)) return undefined
    const tos = [...(renamed.get(from) ?? [])].filter((to) => hasProperty(type, to))
    return tos.length === 1 ? tos[0] : undefined
  }
  const keyTarget = (from: string, literal: Node) => {
    const contextual = Node.isObjectLiteralExpression(literal) ? literal.getContextualType() : undefined
    const expected = expectedTypes(literal)
    return renamedPropertyOf(from, contextual) ?? (expected.some((t) => hasProperty(t, from)) ? undefined : expected.map((t) => renamedPropertyOf(from, t)).find((to) => to !== undefined))
  }
  const log: string[] = []
  for (let changed = true; changed; ) {
    changed = false
    for (const file of files) {
      for (const node of file.getDescendants()) {
        if (node.wasForgotten() || !renamed.has(node.getText().replace(/^['"]|['"]$/g, ''))) continue
        const from = node.getText().replace(/^['"]|['"]$/g, '')
        const parent = node.getParent()
        let to: string | undefined
        if (Node.isIdentifier(node) && Node.isPropertyAccessExpression(parent) && parent.getNameNode() === node) to = renamedPropertyOf(from, parent.getExpression().getType())
        else if (Node.isIdentifier(node) && Node.isPropertyAssignment(parent) && parent.getNameNode() === node) to = keyTarget(from, parent.getParentOrThrow())
        else if (Node.isIdentifier(node) && Node.isShorthandPropertyAssignment(parent)) to = keyTarget(from, parent.getParentOrThrow())
        else if (Node.isIdentifier(node) && Node.isBindingElement(parent) && (parent.getPropertyNameNode() ?? parent.getNameNode()) === node) to = renamedPropertyOf(from, parent.getParentOrThrow().getType())
        else if (Node.isStringLiteral(node) && Node.isBinaryExpression(parent) && parent.getOperatorToken().getText() === 'in' && parent.getLeft() === node) to = renamedPropertyOf(from, parent.getRight().getType())
        else if (Node.isStringLiteral(node) && Node.isArrayLiteralExpression(parent)) {
          // `Struct.pick(['a'])` carries no type; `Struct.pick(T.fields, ['a'])` does.
          const call = parent.getParent()
          if (Node.isCallExpression(call) && /\.(pick|omit)$/.test(call.getExpression().getText())) {
            const [first] = call.getArguments()
            const targets = [...(renamed.get(from) ?? [])]
            to = first !== undefined && first !== parent ? renamedPropertyOf(from, first.getType()) : targets.length === 1 ? targets[0] : undefined
          }
        } else if (Node.isStringLiteral(node) && Node.isLiteralTypeNode(parent)) {
          const owner = parent.getParentWhile((n) => Node.isUnionTypeNode(n) || Node.isLiteralTypeNode(n)) ?? parent
          const holder = owner.getParent()
          if (Node.isIndexedAccessTypeNode(holder) && holder.getIndexTypeNode() === owner) to = renamedPropertyOf(from, holder.getObjectTypeNode().getType())
          else if (Node.isTypeReference(holder) && ['Pick', 'Omit'].includes(holder.getTypeName().getText()) && holder.getTypeArguments()[1] === owner) to = renamedPropertyOf(from, holder.getTypeArguments()[0]?.getType())
        }
        if (to === undefined) continue
        const line = node.getStartLineNumber()
        if ((Node.isBindingElement(parent) && parent.getPropertyNameNode() === undefined) || Node.isShorthandPropertyAssignment(parent)) parent.replaceWithText(`${to}: ${parent.getText()}`)
        else node.replaceWithText(node.getText().replace(from, to))
        log.push(`${file.getFilePath().slice(root.length + 1)}:${line}\t${from}\t${to}`)
        changed = true
        break
      }
    }
  }
  return log
}

const parentOf = (key: string) => `${key.replace(/:prop$/, '').replace(/[^.]*$/, '')}${key.endsWith(':prop') ? ':prop' : ''}`
const twins = Object.entries(map.symbols).flatMap(([file, entries]) => {
  const seen = new Map<string, string>()
  return Object.entries(entries).flatMap(([key, to]) => {
    const slot = `${parentOf(key)}\t${to}`
    const twin = seen.get(slot)
    seen.set(slot, key)
    return twin === undefined ? [] : [`${file}\t${twin} and ${key} -> ${to}`]
  })
})
if (twins.length > 0) throw new Error(`sibling keys share a target, so a rerun could not tell them apart:\n${twins.join('\n')}`)

// `/entrar`, `u6-diagnostico.png` and `?tipoFallo=` name a URL, a file or a search key, not the export.
const notAfterPathCharacter = String.raw`(?<![\w/.?&=#$[\]-])`
const notBeforePathCharacter = String.raw`(?![\w/=#\]-]|\.\w)`

const renameInCodeSpans = (exports: ReadonlyMap<string, string>) => {
  const renamable = [...exports.keys()].filter((name) => !map.text.keepInDocs.includes(name))
  if (renamable.length === 0) return []
  const names = new RegExp(`${notAfterPathCharacter}(${renamable.join('|')})${notBeforePathCharacter}`, 'g')
  const tracked = execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  const within = (file: string, prefixes: ReadonlyArray<string>) => prefixes.some((p) => file.startsWith(p))
  const changed: string[] = []
  for (const file of tracked.filter((f) => within(f, map.text.include) && !within(f, map.text.exclude))) {
    const before = readFileSync(join(root, file), 'utf8')
    const after = before.replace(/`[^`\n]+`/g, (span) => span.replace(names, (name: string) => exports.get(name) ?? name))
    if (after === before) continue
    writeFileSync(join(root, file), after)
    changed.push(file)
  }
  return changed
}

const missing = unmatchedEntries()
if (missing.length > 0) throw new Error(`map entries that name no declaration:\n${missing.join('\n')}`)

if (process.argv[2] === '--list') {
  const prefix = process.argv[3] ?? 'src/'
  for (const file of project.getSourceFiles()) {
    const path = file.getFilePath().slice(root.length + 1)
    if (!path.startsWith(prefix)) continue
    const entries = map.symbols[path] ?? {}
    const keys = new Set(declarationsIn(file).map((node) => originalKeyOf(node, entries)))
    for (const key of keys) if (entries[key] === undefined) console.log(`${path}\t${key}`)
  }
} else {
  const log: string[] = []
  const touched = new Set<SourceFile>()
  const attempted = new Set<string>()
  const renamedProperties = new Map<string, Set<string>>()
  const exported = new Map<string, string | null>()
  for (const phase of ['local', 'literal', 'member'] as const) {
    for (let next = nextRename(phase); next !== undefined; next = nextRename(phase)) {
      const { file, key, from, to, node } = next
      if (Node.isShorthandPropertyAssignment(node)) {
        skipped.add(node)
        console.warn(`skipped ${file}\t${key}: shorthand of a local the map leaves as ${from}`)
        continue
      }
      const attempt = `${file}:${node.getStart()}\t${key}\t${from}`
      if (attempted.has(attempt)) throw new Error(`${attempt} did not rename to ${to}`)
      attempted.add(attempt)
      assertNoCapture(node, to, key, map.symbols[file] ?? {})
      const name = nameNodeOf(node)
      if (name === undefined) throw new Error(`${file}\t${key} has no name`)
      if (Node.isExportGetable(node) && node.isExported()) exported.set(from, exported.has(from) && exported.get(from) !== to ? null : to)
      for (const changed of applyRename(name, to)) touched.add(changed)
      if (phase !== 'local') renamedProperties.set(from, (renamedProperties.get(from) ?? new Set<string>()).add(to))
      log.push(`${file}\t${key}\t${from}\t${to}`)
    }
  }
  const unlinked = fixUnlinked(new Set(project.getSourceFiles()), renamedProperties)
  const collapsed = [...touched].reduce((n, file) => n + collapseSelfPairs(file), 0)
  const stale = unmatchedEntries()
  if (stale.length > 0) throw new Error(`map entries lost during the run:\n${stale.join('\n')}`)
  project.saveSync()
  const docs = renameInCodeSpans(new Map([...exported].filter((pair): pair is [string, string] => pair[1] !== null)))
  console.log(`renamed ${log.length} declarations, rewrote ${unlinked.length} unlinked references, collapsed ${collapsed} a: a pairs, updated ${docs.length} docs`)
  for (const line of log) console.log(line)
  for (const line of unlinked) console.log(`unlinked\t${line}`)
}
