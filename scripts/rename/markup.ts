import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Schema } from 'effect'
import { type JsxAttribute, Node, Project, type SourceFile } from 'ts-morph'

// `node scripts/rename/markup.ts [--list]` renames styles.css and the JSX per scripts/parity/markup-map.json, the map
// the parity harness reads to undo the renames in the head's HTML. `--list` prints the names the map leaves alone and
// the computed ones. A rendered field's id is its name and its error's id is `error-<name>` (ui/form.tsx,
// ui/FieldError.tsx), so the run writes those pairs into `ids`. Run symbols.ts after it for the decoding schemas.
const Names = Schema.Record(Schema.String, Schema.String)
const MarkupMap = Schema.Struct({ classes: Names, ids: Names, customProperties: Names, dataAttributes: Names, formFields: Names })
type Section = keyof typeof MarkupMap.fields
type Names = Readonly<Record<string, string>>

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const mapFile = join(root, 'scripts/parity/markup-map.json')
const authored = Schema.decodeUnknownSync(Schema.fromJsonString(MarkupMap))(readFileSync(mapFile, 'utf8'))

const segmentsOf = (name: string) => name.split(/[[\]]+/).filter((s) => s !== '')

const fieldSegments = (formFields: Names): Names => {
  const segments: Record<string, string> = {}
  for (const [from, to] of Object.entries(formFields)) {
    const [a, b] = [segmentsOf(from), segmentsOf(to)]
    if (a.length !== b.length) throw new Error(`formFields.${from} -> ${to}: the names have a different number of segments`)
    a.forEach((segment, i) => {
      if (segments[segment] !== undefined && segments[segment] !== b[i]) throw new Error(`formFields: segment ${segment} maps to both ${segments[segment]} and ${b[i]}`)
      segments[segment] = b[i]
    })
  }
  return segments
}

const fieldIds = (formFields: Names): Names =>
  Object.fromEntries(Object.entries(formFields).flatMap(([from, to]) => [[from, to], [`error-${from}`, `error-${to}`]]))

const map: Readonly<Record<Section, Names>> = { ...authored, ids: { ...authored.ids, ...fieldIds(authored.formFields) } }
const segments = fieldSegments(map.formFields)

for (const [section, names] of Object.entries(map)) {
  const chained = Object.keys(names).filter((from) => Object.values(names).includes(from) && names[from] !== from)
  if (chained.length > 0) throw new Error(`markup-map.json: ${section} renames ${chained.join(', ')}, which another entry renames to; a rerun would rename twice`)
}

const namesOf = { class: map.classes, id: map.ids, field: segments, customProperty: map.customProperties, dataAttribute: map.dataAttributes }
type Kind = keyof typeof namesOf
type TextKind = 'class' | 'id' | 'field'
const separators: Record<TextKind, RegExp> = { class: /(\s+)/, id: /(\s+)/, field: /([[\]]+)/ }

type Change = { readonly where: string; readonly from: string; readonly to: string }
const changes: Array<Change> = []
const computed: Array<string> = []
const seen = new Map<Kind, Map<string, Set<string>>>()
const see = (kind: Kind, name: string, where: string) => {
  const names = seen.get(kind) ?? new Map<string, Set<string>>()
  seen.set(kind, names.set(name, (names.get(name) ?? new Set()).add(where)))
}

type Edges = { readonly startsAtBoundary: boolean; readonly endsAtBoundary: boolean }
const whole: Edges = { startsAtBoundary: true, endsAtBoundary: true }

const renamePiece = (piece: string, kind: TextKind, edges: Edges, where: string) => {
  const parts = piece.split(separators[kind])
  return parts
    .map((part, i) => {
      if (i % 2 === 1 || part === '') return part
      if ((i === 0 && !edges.startsAtBoundary) || (i === parts.length - 1 && !edges.endsAtBoundary)) {
        computed.push(`${where}\t${kind} part ${JSON.stringify(part)}`)
        return part
      }
      see(kind, part, where)
      const to = namesOf[kind][part]
      if (to === undefined || to === part) return part
      changes.push({ where, from: part, to })
      return to
    })
    .join('')
}

const whereOf = (node: Node) => `${node.getSourceFile().getFilePath().slice(root.length + 1)}:${node.getStartLineNumber()}`

const renameExpression = (node: Node, kind: TextKind): void => {
  const where = whereOf(node)
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    const to = renamePiece(node.getLiteralText(), kind, whole, where)
    const quote = node.getText()[0]
    if (to !== node.getLiteralText()) node.replaceWithText(`${quote}${to}${quote}`)
  } else if (Node.isTemplateExpression(node)) {
    const head = node.getHead()
    const headText = renamePiece(head.getLiteralText(), kind, { startsAtBoundary: true, endsAtBoundary: false }, where)
    const spans = node.getTemplateSpans().map((span, i, all) => {
      const text = renamePiece(span.getLiteral().getLiteralText(), kind, { startsAtBoundary: false, endsAtBoundary: i === all.length - 1 }, where)
      return `\${${span.getExpression().getText()}}${text}`
    })
    const rebuilt = `\`${headText}${spans.join('')}\``
    if (rebuilt !== node.getText()) node.replaceWithText(rebuilt)
  } else if (Node.isConditionalExpression(node)) {
    renameExpression(node.getWhenTrue(), kind)
    renameExpression(node.getWhenFalse(), kind)
  } else if (Node.isBinaryExpression(node) && ['&&', '||', '??'].includes(node.getOperatorToken().getText())) {
    if (node.getOperatorToken().getText() !== '&&') renameExpression(node.getLeft(), kind)
    renameExpression(node.getRight(), kind)
  } else if (Node.isParenthesizedExpression(node) || Node.isJsxExpression(node)) {
    const inner = node.getExpression()
    if (inner !== undefined) renameExpression(inner, kind)
  } else computed.push(`${where}\t${kind} ${node.getText()}`)
}

const idAttributes = new Set(['id', 'htmlFor', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage', 'aria-flowto'])
const fieldOwners: Readonly<Record<string, string>> = { input: 'name', select: 'name', textarea: 'name', button: 'name', Field: 'name', OptionalGroup: 'name', FieldError: 'field' }

const kindOf = (attribute: JsxAttribute): TextKind | undefined => {
  const name = attribute.getNameNode().getText()
  const element = attribute.getParentOrThrow().getParentOrThrow()
  const tag = Node.isJsxOpeningElement(element) || Node.isJsxSelfClosingElement(element) ? element.getTagNameNode().getText() : ''
  if (name === 'className') return 'class'
  if (idAttributes.has(name)) return 'id'
  if (fieldOwners[tag] === name) return 'field'
  return undefined
}

const renameJsx = (file: SourceFile) => {
  for (const attribute of file.getDescendants().filter(Node.isJsxAttribute)) {
    if (attribute.wasForgotten()) continue
    const name = attribute.getNameNode().getText()
    if (name.startsWith('data-')) {
      see('dataAttribute', name, whereOf(attribute))
      const to = map.dataAttributes[name]
      if (to !== undefined && to !== name) {
        changes.push({ where: whereOf(attribute), from: name, to })
        attribute.getNameNode().replaceWithText(to)
      }
      continue
    }
    const kind = kindOf(attribute)
    const value = attribute.getInitializer()
    if (kind !== undefined && value !== undefined) renameExpression(value, kind)
  }
}

const renameFieldReferences = (file: SourceFile) => {
  for (const node of file.getDescendants()) {
    if (node.wasForgotten()) continue
    if (Node.isCallExpression(node) && ['fieldProps', 'errorId'].includes(node.getExpression().getText())) {
      const name = node.getArguments().at(-1)
      if (name !== undefined) renameExpression(name, 'field')
    } else if (Node.isElementAccessExpression(node) && isFieldErrors(node.getExpression()))
      renameExpression(node.getArgumentExpressionOrThrow(), 'field')
  }
}

const cssNames: ReadonlyArray<readonly [Kind, RegExp]> = [
  ['class', /(?<!\d)\.(-?[A-Za-z_][\w-]*)/g],
  ['customProperty', /(?<![\w-])(--[A-Za-z][\w-]*)/g],
  ['dataAttribute', /(?<![\w-])(data-[a-z][\w-]*)/g],
]

const renameCss = (path: string, text: string) =>
  cssNames.reduce(
    (css, [kind, pattern]) =>
      css.replace(pattern, (whole: string, name: string) => {
        see(kind, name, path)
        const to = namesOf[kind][name]
        if (to === undefined || to === name) return whole
        changes.push({ where: path, from: name, to })
        return whole.replace(name, to)
      }),
    text,
  )

const project = new Project({ tsConfigFilePath: join(root, 'tsconfig.json') })
const fieldErrors = project.getSourceFileOrThrow(join(root, 'src/ui/useAction.ts')).getTypeAliasOrThrow('FieldErrors')
// Each edit rebuilds the program, so the alias's type is read again for each comparison.
const isFieldErrors = (node: Node) => node.getType().compilerType === fieldErrors.getType().compilerType
const files = project.getSourceFiles().filter((f) => {
  const path = f.getFilePath().slice(root.length + 1)
  return path.startsWith('src/') || path.startsWith('tests/')
})

for (const file of files) {
  renameJsx(file)
  renameFieldReferences(file)
}
const stylesheet = join(root, 'src/styles.css')
const css = readFileSync(stylesheet, 'utf8')
const renamedCss = renameCss('src/styles.css', css)

const listOnly = process.argv.includes('--list')
if (listOnly) {
  for (const [kind, names] of seen) {
    const mapped = namesOf[kind]
    for (const [name, where] of [...names].sort(([a], [b]) => a.localeCompare(b)))
      if (mapped[name] === undefined && !Object.values(mapped).includes(name)) console.log(`${kind}\t${name}\t${where.size}\t${[...where][0]}`)
  }
  for (const line of computed) console.log(`computed\t${line}`)
} else {
  if (renamedCss !== css) writeFileSync(stylesheet, renamedCss)
  project.saveSync()
  const written = `${JSON.stringify({ ...authored, ids: Object.fromEntries(Object.entries(map.ids).sort(([a], [b]) => a.localeCompare(b))) }, null, 2)}\n`
  if (written !== readFileSync(mapFile, 'utf8')) writeFileSync(mapFile, written)
  console.log(`renamed ${changes.length} markup names`)
  for (const c of changes) console.log(`${c.where}\t${c.from}\t${c.to}`)
}
