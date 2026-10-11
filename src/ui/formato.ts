// Display formatting shared by every page. Every stored time is an instant (timestamptz), printed in
// the app's audience zone, fixed so SSR and the browser agree (no hydration drift). Hours are 24-hour
// digits only: ICU builds differ in how they space "p. m.", which would break hydration.
const zona = 'America/Bogota'
const dia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: zona })
const hora = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona })

export const fecha = (d: Date) => dia.format(d)

export const momento = (d: Date) => `${dia.format(d)}, ${hora.format(d)}`

export const contar = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export const memoria = (mb: number) => (mb > 0 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`)

const unDecimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

export const fps = (n: number) => unDecimal.format(n)
