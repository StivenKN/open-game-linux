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

const fechaHoraUtc = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

/** "10 oct 2026, 6:43 p. m. UTC": a capture time, printed in UTC so server and browser agree. */
export const fechaHora = (d: Date) => `${fechaHoraUtc.format(d)} UTC`

// Instants (timestamptz: a test, a capture) in the app's audience zone, fixed so SSR and the browser
// agree. 24-hour digits only: ICU builds differ in how they space "p. m.", which would break hydration.
const diaBogota = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
const horaBogota = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Bogota' })

/** "2 de oct, 19:00", Colombia time */
export const momento = (d: Date) => `${diaBogota.format(d)}, ${horaBogota.format(d)}`
