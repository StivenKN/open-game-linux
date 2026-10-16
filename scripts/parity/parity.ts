import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { capture, parseSource } from './capture.ts'
import { compare } from './compare.ts'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { ref: { type: 'string' }, out: { type: 'string' }, base: { type: 'string' }, head: { type: 'string', default: '.' } },
})

const captureOrReuse = async (arg: string, out: string, label: string) => {
  if (existsSync(join(arg, 'captures'))) return resolve(arg)
  await capture(await parseSource(arg), out, label)
  return out
}

const main = async () => {
  switch (positionals[0]) {
    case 'capture': {
      if (values.ref === undefined || values.out === undefined) throw new Error('usage: pnpm parity capture --ref <ref|dir> --out <dir>')
      await capture(await parseSource(values.ref), resolve(values.out), 'side')
      return 0
    }
    case 'compare': {
      if (values.base === undefined) throw new Error('usage: pnpm parity compare --base <ref|dir> [--head <ref|dir>] [--out <dir>]')
      const out = resolve(values.out ?? mkdtempSync(join(tmpdir(), 'opengame-parity-')))
      console.log(`parity output in ${out}`)
      const [base, head] = await Promise.all([captureOrReuse(values.base, join(out, 'base'), 'base'), captureOrReuse(values.head, join(out, 'head'), 'head')])
      return (await compare(base, head, join(out, 'diff'))) === 0 ? 0 : 1
    }
    default:
      throw new Error('usage: pnpm parity <capture|compare> …')
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e)
    process.exit(2)
  },
)
