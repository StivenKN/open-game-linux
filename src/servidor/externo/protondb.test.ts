import { describe, expect, it } from '@effect/vitest'
import { elementosDeArreglo, resumenImportacion } from './protondb.ts'

async function* trozos(texto: string, tamano: number) {
  for (let i = 0; i < texto.length; i += tamano) yield texto.slice(i, i + tamano)
}

const elementos = async (texto: string, tamano = texto.length || 1) => {
  const vistos: Array<string> = []
  for await (const e of elementosDeArreglo(trozos(texto, tamano))) vistos.push(e)
  return vistos
}

const falla = (motivo: string) => expect.objectContaining({ _tag: 'ExportacionInvalida', motivo })

describe('elementosDeArreglo', () => {
  const esperados = ['{"a":"}],[{","b":"comilla \\" y ] {"}', '{"c":[1,{"d":"ñandú 😀"}]}', '3', '"s,t"', 'null', '{"e":"barra \\\\","f":"]"}']
  const texto = `\n[${esperados[0]},\n  ${esperados[1]} , ${esperados[2]},${esperados[3]},\t${esperados[4]},${esperados[5]}\n]\n`

  it('yields every element whole, wherever the chunks cut, including 1-char chunks and split surrogate pairs', async () => {
    for (let tamano = 1; tamano <= texto.length; tamano++) expect(await elementos(texto, tamano)).toEqual(esperados)
  })

  it('an empty array, with or without a byte order mark, yields nothing or its one element', async () => {
    expect(await elementos(' [ ] ')).toEqual([])
    expect(await elementos('﻿[{"a":1}]')).toEqual(['{"a":1}'])
  })

  it('a missing element between commas comes out empty', async () => {
    expect(await elementos('[1,,2]')).toEqual(['1', '', '2'])
    expect(await elementos('[1,]')).toEqual(['1', ''])
  })

  it('refuses empty, truncated, non-array and trailing input', async () => {
    await expect(elementos('')).rejects.toEqual(falla('la entrada está vacía'))
    await expect(elementos('  \n')).rejects.toEqual(falla('la entrada está vacía'))
    await expect(elementos('[{"a":1},{"b":', 3)).rejects.toEqual(falla('el archivo está truncado'))
    await expect(elementos('[{"a":1}')).rejects.toEqual(falla('el archivo está truncado'))
    await expect(elementos('[{"a":"]}')).rejects.toEqual(falla('el archivo está truncado'))
    await expect(elementos('{"a":[1]}')).rejects.toEqual(falla('no es un arreglo JSON'))
    await expect(elementos('[1] 2')).rejects.toEqual(falla('hay datos después del arreglo'))
  })

  it('an element over 4 MiB comes out empty, in one chunk or many, and the next one still arrives', async () => {
    const enorme = `[{"a":"${'x'.repeat(4 * 1024 * 1024)}"},1]`
    expect(await elementos(enorme)).toEqual(['', '1'])
    expect(await elementos(enorme, 65536)).toEqual(['', '1'])
  })
})

describe('resumenImportacion', () => {
  it('prints the counts with Spanish digit grouping and the export date', () => {
    const texto = resumenImportacion({ leidos: 395467, descartados: 12, coincidentes: 5215, guardados: 4, exportado_en: new Date('2026-10-01T03:00:00Z') })
    expect(texto).toBe(
      'ProtonDB: 395.467 reportes leídos, 12 descartados, 5.215 de juegos del catálogo. 4 ediciones de Steam guardadas (export del 2026-10-01); el resumen anterior fue reemplazado.',
    )
  })
})
