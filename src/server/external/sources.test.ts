import { readFileSync } from 'node:fs'
import { describe, expect, it } from '@effect/vitest'
import { Option } from 'effect'
import { parseReport } from '../../domain/protondb.ts'
import { arrayElements } from './protondb.ts'
import { jsonInTarGz, newestExport, tarFile, utf8, type UpstreamFile } from './sources.ts'

const file = (name: string): UpstreamFile => ({ name, sha: name.length.toString(16).padStart(40, '0'), url: `https://example.test/${name}` })

describe('newestExport', () => {
  it('picks the newest export by the date in its name, not by listing order or text order', () => {
    const files = ['reports_dec1_2025.tar.gz', 'reports_oct1_2026.tar.gz', 'reports_aug4_2026.tar.gz', 'reports_sep1_2026.tar.gz', 'README.md'].map(file)
    expect(newestExport(files)?.name).toBe('reports_oct1_2026.tar.gz')
    expect(newestExport([file('reports_jan2_2026.tar.gz'), file('reports_dec31_2025.tar.gz')])?.name).toBe('reports_jan2_2026.tar.gz')
  })

  it('ignores names that are not an export and finds none in an empty or unrelated listing', () => {
    const others = ['reports_oct1_2026.tar.gz.part', 'reports_xyz1_2027.tar.gz', 'reports_oct1_2026.json', 'README.md'].map(file)
    expect(newestExport(others)).toBeUndefined()
    expect(newestExport([])).toBeUndefined()
  })
})

async function* chunked(bytes: Uint8Array, size: number) {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size)
}

const collect = async <A>(items: AsyncIterable<A>) => {
  const seen: Array<A> = []
  for await (const item of items) seen.push(item)
  return seen
}

const fixture = readFileSync(new URL('./fixtures/reports_test.tar.gz', import.meta.url))
// The fixture holds export/, export/README.md, then export/reports_piiremoved.json, as GNU tar writes them.
const tar = new Uint8Array(await new Response(new Blob([fixture]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
const text = (chunks: AsyncIterable<Uint8Array>) => collect(utf8(chunks)).then((parts) => parts.join(''))
const invalidExport = (reason: string) => expect.objectContaining({ _tag: 'ExportacionInvalida', reason })

describe('jsonInTarGz', () => {
  it('streams the export out of the .tar.gz into the same reader as a file, and each report parses', async () => {
    const elements = await collect(arrayElements(jsonInTarGz(new Blob([fixture]).stream())))
    expect(elements.map((e) => Option.map(parseReport(e), (r) => [r.app_id, r.works]))).toEqual([Option.some(['1000', true]), Option.some(['2000', false])])
  })
})

describe('tarFile', () => {
  it('yields the .json entry whole, skipping the others, wherever the chunks cut it', async () => {
    const expected = await text(tarFile(chunked(tar, tar.length), '.json'))
    expect(JSON.parse(expected)).toHaveLength(2)
    expect(expected).toContain('ñandú')
    for (const size of [1, 7, 100, 511, 512, 513, 1500]) expect(await text(tarFile(chunked(tar, size), '.json'))).toBe(expected)
  })

  it('refuses a truncated archive, one with no such file, and bytes that are not tar', async () => {
    // Cut inside the .json entry's header, then inside its data.
    for (const end of [2000, 2500]) await expect(collect(tarFile(chunked(tar.subarray(0, end), 64), '.json'))).rejects.toEqual(invalidExport('el .tar está truncado'))
    await expect(collect(tarFile(chunked(tar, 512), '.csv'))).rejects.toEqual(invalidExport('el .tar no contiene un archivo .csv'))
    await expect(collect(tarFile(chunked(new TextEncoder().encode('[{"no":"es tar"}]'.padEnd(1024)), 512), '.json'))).rejects.toEqual(
      invalidExport('no es un archivo .tar'),
    )
    await expect(collect(tarFile(chunked(new Uint8Array(0), 1), '.json'))).rejects.toEqual(invalidExport('el .tar no contiene un archivo .json'))
  })
})
