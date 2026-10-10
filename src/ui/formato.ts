// Display formatting shared by the verdict components. Dates are DB `date` values decoded at UTC
// midnight, so they format in UTC: the server and the browser print the same day (no hydration drift).
const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "2 de oct" */
export const fecha = (d: Date) => fechaCorta.format(d)

/** "1 reporte aprobado", "4 reportes aprobados" */
export const contar = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** 8192 -> "8 GB", 1536 -> "1536 MB". Section 8 stores memory in MB. */
export const memoria = (mb: number) => (mb > 0 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`)

const unDecimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/** 61.5 -> "61,5" */
export const fps = (n: number) => unDecimal.format(n)
