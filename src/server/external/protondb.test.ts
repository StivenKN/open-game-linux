import { describe, expect, it } from '@effect/vitest'
import { arrayElements, importSummary } from './protondb.ts'

async function* chunks(text: string, size: number) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size)
}

const elements = async (text: string, size = text.length || 1) => {
  const seen: Array<string> = []
  for await (const e of arrayElements(chunks(text, size))) seen.push(e)
  return seen
}

const invalidExport = (reason: string) => expect.objectContaining({ _tag: 'ExportacionInvalida', reason })

describe('elementosDeArreglo', () => {
  const expected = ['{"a":"}],[{","b":"comilla \\" y ] {"}', '{"c":[1,{"d":"ñandú 😀"}]}', '3', '"s,t"', 'null', '{"e":"barra \\\\","f":"]"}']
  const text = `\n[${expected[0]},\n  ${expected[1]} , ${expected[2]},${expected[3]},\t${expected[4]},${expected[5]}\n]\n`

  it('yields every element whole, wherever the chunks cut, including 1-char chunks and split surrogate pairs', async () => {
    for (let size = 1; size <= text.length; size++) expect(await elements(text, size)).toEqual(expected)
  })

  it('an empty array, with or without a byte order mark, yields nothing or its one element', async () => {
    expect(await elements(' [ ] ')).toEqual([])
    expect(await elements('﻿[{"a":1}]')).toEqual(['{"a":1}'])
  })

  it('a missing element between commas comes out empty', async () => {
    expect(await elements('[1,,2]')).toEqual(['1', '', '2'])
    expect(await elements('[1,]')).toEqual(['1', ''])
  })

  it('refuses empty, truncated, non-array and trailing input', async () => {
    await expect(elements('')).rejects.toEqual(invalidExport('la entrada está vacía'))
    await expect(elements('  \n')).rejects.toEqual(invalidExport('la entrada está vacía'))
    await expect(elements('[{"a":1},{"b":', 3)).rejects.toEqual(invalidExport('el archivo está truncado'))
    await expect(elements('[{"a":1}')).rejects.toEqual(invalidExport('el archivo está truncado'))
    await expect(elements('[{"a":"]}')).rejects.toEqual(invalidExport('el archivo está truncado'))
    await expect(elements('{"a":[1]}')).rejects.toEqual(invalidExport('no es un arreglo JSON'))
    await expect(elements('[1] 2')).rejects.toEqual(invalidExport('hay datos después del arreglo'))
  })

  it('an element over 4 MiB comes out empty, in one chunk or many, and the next one still arrives', async () => {
    const huge = `[{"a":"${'x'.repeat(4 * 1024 * 1024)}"},1]`
    expect(await elements(huge)).toEqual(['', '1'])
    expect(await elements(huge, 65536)).toEqual(['', '1'])
  })
})

describe('resumenImportacion', () => {
  it('prints the counts with Spanish digit grouping and the export date', () => {
    const text = importSummary({ read: 395467, discarded: 12, matched: 5215, saved: 4, exported_at: new Date('2026-10-01T03:00:00Z') })
    expect(text).toBe(
      'ProtonDB: 395.467 reportes leídos, 12 descartados, 5.215 de juegos del catálogo. 4 ediciones de Steam guardadas (export del 2026-10-01); el resumen anterior fue reemplazado.',
    )
  })
})
