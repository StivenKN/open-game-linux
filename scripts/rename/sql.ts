import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Schema } from 'effect'
import { Node, Project, type SourceFile, SyntaxKind } from 'ts-morph'

const DatabaseMap = Schema.Struct({
  database: Schema.Struct({
    tables: Schema.Record(Schema.String, Schema.String),
    columns: Schema.Record(Schema.String, Schema.String),
    aliases: Schema.Record(Schema.String, Schema.String),
    constraints: Schema.Record(Schema.String, Schema.String),
    indexes: Schema.Record(Schema.String, Schema.String),
    triggers: Schema.Record(Schema.String, Schema.String),
    functions: Schema.Record(Schema.String, Schema.String),
    sqlStrings: Schema.Array(Schema.String),
    exclude: Schema.Array(Schema.String),
  }),
})

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const { database } = Schema.decodeUnknownSync(Schema.fromJsonString(DatabaseMap))(readFileSync(join(import.meta.dirname, 'map.json'), 'utf8'))

const inSql = new Map([...Object.entries(database.tables), ...Object.entries(database.columns), ...Object.entries(database.aliases), ...Object.entries(database.constraints), ...Object.entries(database.functions)])
const catalogNames = new Map([...Object.entries(database.constraints), ...Object.entries(database.indexes), ...Object.entries(database.triggers), ...Object.entries(database.functions)])

const renameRowFieldKeys = (text: string) =>
  text.replace(/\bjsonb?_build_object\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (call, args: string) =>
    call.replace(args, args.replace(/(^|,)(\s*)'([A-Za-z_]\w*)'/g, (_, before: string, space: string, key: string) => `${before}${space}'${inSql.get(key) ?? key}'`)),
  )

const renameSqlText = (text: string) =>
  renameRowFieldKeys(text).replace(/'(?:[^']|'')*'|[A-Za-z_][\w$]*/g, (token) => (token.startsWith("'") ? token : (inSql.get(token) ?? token)))

const project = new Project({ tsConfigFilePath: join(root, 'tsconfig.json') })
const relative = (file: SourceFile) => file.getFilePath().slice(root.length + 1)
const included = (file: SourceFile) => {
  const path = relative(file)
  return ['src/', 'scripts/', 'tests/'].some((p) => path.startsWith(p)) && !database.exclude.some((p) => path.startsWith(p))
}

const isSqlTag = (node: Node) => (Node.isIdentifier(node) ? node.getText() === 'sql' : Node.isPropertyAccessExpression(node) && node.getName() === 'sql')
const isSqlIdentifierCall = (node: Node) => Node.isCallExpression(node) && isSqlTag(node.getExpression()) && node.getArguments().length === 1
const isTemplateText = (node: Node) => Node.isNoSubstitutionTemplateLiteral(node) || Node.isTemplateHead(node) || Node.isTemplateMiddle(node) || Node.isTemplateTail(node)

const tableParameter = /^(table|tabla)$/
const namesTable = (literal: Node): boolean => {
  const parent = literal.getParent()
  if (Node.isPropertyAssignment(parent)) return tableParameter.test(parent.getName())
  if (Node.isCallExpression(parent)) {
    const index = parent.getArguments().indexOf(literal)
    const parameter = parent.getExpression().getType().getCallSignatures()[0]?.getParameters()[index]
    return parameter !== undefined && tableParameter.test(parameter.getName())
  }
  if (Node.isLiteralTypeNode(parent)) return tableParameter.test(parent.getFirstAncestorByKind(SyntaxKind.Parameter)?.getName() ?? '')
  if (Node.isBinaryExpression(parent)) {
    const other = parent.getLeft() === literal ? parent.getRight() : parent.getLeft()
    return Node.isIdentifier(other) && tableParameter.test(other.getText())
  }
  return false
}

type Edit = { readonly start: number; readonly end: number; readonly text: string; readonly line: string }

const editsIn = (file: SourceFile): ReadonlyArray<Edit> => {
  const path = relative(file)
  const allTemplates = database.sqlStrings.includes(path)
  const edits: Edit[] = []
  const edit = (node: Node, text: string, what: string) => {
    if (text !== node.getText()) edits.push({ start: node.getStart(), end: node.getEnd(), text, line: `${path}:${node.getStartLineNumber()}\t${what}` })
  }
  for (const node of file.getDescendants()) {
    if (isTemplateText(node)) {
      const owner = Node.isTemplateSpan(node.getParent()) ? node.getParent().getParent() : node.getParent()
      const tagged = Node.isTemplateExpression(owner) ? owner.getParent() : owner
      if (allTemplates || (Node.isTaggedTemplateExpression(tagged) && isSqlTag(tagged.getTag()))) edit(node, renameSqlText(node.getText()), 'sql')
    } else if (Node.isStringLiteral(node)) {
      const value = node.getLiteralValue()
      const parent = node.getParent()
      const to = isSqlIdentifierCall(parent) || namesTable(node) ? inSql.get(value) : catalogNames.get(value)
      if (to !== undefined) edit(node, `'${to}'`, `${value}\t${to}`)
    } else if (Node.isPropertyAssignment(node) || Node.isPropertySignature(node)) {
      const name = node.getNameNode()
      const to = Node.isIdentifier(name) ? catalogNames.get(name.getText()) : undefined
      if (to !== undefined) edit(name, to, `${name.getText()}\t${to}`)
    }
  }
  return edits
}

const log: string[] = []
// Edits are spliced into the file text by range: ts-morph's node replacement re-indents a multi-line template.
for (const file of project.getSourceFiles().filter(included)) {
  const edits = editsIn(file)
  if (edits.length === 0) continue
  let text = file.getFullText()
  for (const e of [...edits].sort((a, b) => b.start - a.start)) text = `${text.slice(0, e.start)}${e.text}${text.slice(e.end)}`
  writeFileSync(file.getFilePath(), text)
  log.push(...edits.map((e) => e.line))
}

console.log(`renamed SQL in ${new Set(log.map((l) => l.split(':')[0])).size} files, ${log.length} edits`)
for (const line of log) console.log(line)
