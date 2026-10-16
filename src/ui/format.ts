// Display formatting shared by every page. Every stored time is an instant (timestamptz), printed in
// the app's audience zone, fixed so SSR and the browser agree (no hydration drift). Hours are 24-hour
// digits only: ICU builds differ in how they space "p. m.", which would break hydration. Dates always
// carry the year, so a test from two years ago never reads as recent, with no clock needed to render.
const zone = 'America/Bogota'
const dayFormat = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone })
const timeFormat = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone })

export const date = (d: Date) => dayFormat.format(d)

export const dateTime = (d: Date) => `${dayFormat.format(d)}, ${timeFormat.format(d)}`

export const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const memory = (mb: number) => (mb > 0 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`)

const oneDecimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

export const fps = (n: number) => oneDecimal.format(n)

/** Swap and zram sizes: /proc/swaps reports a page less than the device, so exact GB never shows. */
export const approximateMemory = (mb: number) => (mb < 1024 ? `${mb} MB` : `${oneDecimal.format(mb / 1024)} GB`)
