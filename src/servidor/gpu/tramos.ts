/** Device ids as sorted runs of 4-digit hex (`'0402-0406 040a'`), the form familias.generado.ts stores them in. */
export const codificarTramos = (numeros: ReadonlyArray<number>): string => {
  const orden = [...new Set(numeros)].sort((a, b) => a - b)
  const salida: Array<string> = []
  let desde = orden[0] ?? 0
  let hasta = desde
  for (const n of [...orden.slice(1), Number.POSITIVE_INFINITY]) {
    if (n === hasta + 1) {
      hasta = n
      continue
    }
    salida.push(desde === hasta ? hex4(desde) : `${hex4(desde)}-${hex4(hasta)}`)
    desde = n
    hasta = n
  }
  return orden.length === 0 ? '' : salida.join(' ')
}

export const decodificarTramos = (texto: string): ReadonlyArray<number> =>
  texto === ''
    ? []
    : texto.split(' ').flatMap((tramo) => {
        const [desde = 0, hasta = desde] = tramo.split('-').map((h) => parseInt(h, 16))
        return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)
      })

const hex4 = (n: number) => n.toString(16).padStart(4, '0')
