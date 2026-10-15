import { Schema } from 'effect'

export class ExportacionInvalida extends Schema.TaggedError<ExportacionInvalida>()('ExportacionInvalida', { motivo: Schema.String }) {}

export type ResultadoImportacion = {
  readonly leidos: number
  readonly descartados: number
  readonly coincidentes: number
  readonly guardados: number
  readonly exportado_en: Date
}

// A record is about 1.3 kB; a bigger element means a broken file, not a report.
const LIMITE_ELEMENTO = 1024 * 1024

const COMILLA = 0x22
const BARRA = 0x5c
const COMA = 0x2c
const ABRE_CORCHETE = 0x5b
const CIERRA_CORCHETE = 0x5d
const ABRE_LLAVE = 0x7b
const CIERRA_LLAVE = 0x7d
const BOM = 0xfeff
const esEspacio = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09

/**
 * Yields the text of each element of a top-level JSON array, read from text chunks. JSON.parse of the
 * whole export would pass V8's string limit. Fails on anything but one complete array.
 */
export async function* elementosDeArreglo(trozos: AsyncIterable<string>): AsyncGenerator<string> {
  let profundidad = 0
  let enCadena = false
  let escapado = false
  let empezado = false
  let terminado = false
  // An element is expected after a comma, so `[1,]` and `[1,,2]` yield an empty element instead of hiding one.
  let esperaElemento = false
  let enElemento = false
  let partes: Array<string> = []
  let acumulado = 0

  const elemento = (trozo: string, inicio: number, fin: number) => {
    const texto = (partes.join('') + trozo.slice(inicio, fin)).trimEnd()
    if (texto.length > LIMITE_ELEMENTO) throw new ExportacionInvalida({ motivo: 'elemento demasiado grande' })
    partes = []
    acumulado = 0
    enElemento = false
    return texto
  }

  for await (const trozo of trozos) {
    let inicio = 0
    for (let i = 0; i < trozo.length; i++) {
      const c = trozo.charCodeAt(i)
      if (enCadena) {
        if (escapado) escapado = false
        else if (c === BARRA) escapado = true
        else if (c === COMILLA) enCadena = false
        continue
      }
      if (terminado) {
        if (!esEspacio(c)) throw new ExportacionInvalida({ motivo: 'hay datos después del arreglo' })
        continue
      }
      if (!empezado) {
        if (esEspacio(c) || c === BOM) continue
        if (c !== ABRE_CORCHETE) throw new ExportacionInvalida({ motivo: 'no es un arreglo JSON' })
        empezado = true
        profundidad = 1
        continue
      }
      if (profundidad === 1 && !enElemento) {
        if (esEspacio(c)) continue
        if (c === COMA || c === CIERRA_CORCHETE) {
          if (c === COMA || esperaElemento) yield ''
          esperaElemento = c === COMA
          terminado = c === CIERRA_CORCHETE
          continue
        }
        enElemento = true
        inicio = i
      }
      if (c === COMILLA) enCadena = true
      else if (c === ABRE_CORCHETE || c === ABRE_LLAVE) profundidad++
      else if ((c === COMA || c === CIERRA_CORCHETE) && profundidad === 1) {
        yield elemento(trozo, inicio, i)
        esperaElemento = c === COMA
        terminado = c === CIERRA_CORCHETE
      } else if (c === CIERRA_CORCHETE || c === CIERRA_LLAVE) profundidad--
    }
    if (enElemento) {
      partes.push(trozo.slice(inicio))
      acumulado += trozo.length - inicio
      if (acumulado > LIMITE_ELEMENTO) throw new ExportacionInvalida({ motivo: 'elemento demasiado grande' })
    }
  }
  if (!empezado) throw new ExportacionInvalida({ motivo: 'la entrada está vacía' })
  if (!terminado) throw new ExportacionInvalida({ motivo: 'el archivo está truncado' })
}

const numero = new Intl.NumberFormat('es-CO')

export const resumenImportacion = (r: ResultadoImportacion): string =>
  `ProtonDB: ${numero.format(r.leidos)} reportes leídos, ${numero.format(r.descartados)} descartados, ` +
  `${numero.format(r.coincidentes)} de juegos del catálogo. ${numero.format(r.guardados)} ediciones de Steam guardadas ` +
  `(export del ${r.exportado_en.toISOString().slice(0, 10)}); el resumen anterior fue reemplazado.`
