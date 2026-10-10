// Display formatting shared by every page. Every stored time is an instant (timestamptz), printed in
// the app's audience zone, fixed so SSR and the browser agree (no hydration drift). Hours are 24-hour
// digits only: ICU builds differ in how they space "p. m.", which would break hydration.
const zona = 'America/Bogota'
const dia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: zona })
const hora = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona })

/** "2 de oct", the Colombia day of an instant */
export const fecha = (d: Date) => dia.format(d)

/** "2 de oct, 19:00", Colombia time */
export const momento = (d: Date) => `${dia.format(d)}, ${hora.format(d)}`

/** "1 reporte aprobado", "4 reportes aprobados" */
export const contar = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** 8192 -> "8 GB", 1536 -> "1536 MB". Section 8 stores memory in MB. */
export const memoria = (mb: number) => (mb > 0 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`)

const unDecimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/** 61.5 -> "61,5" */
export const fps = (n: number) => unDecimal.format(n)
