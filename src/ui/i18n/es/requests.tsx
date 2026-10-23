import type { ReactNode } from 'react'
import { count } from '../../format.ts'

/** Words of a sentence that the page wraps in a link: the dictionary picks them, the page renders the link. */
type Linked = (text: string) => ReactNode

/** The game requests at /pedidos: asking for a missing game, joining a request, and the reviewer's actions. */
export const requests = {
  title: 'Pedidos de juegos',
  lede: (myContributions: Linked) => (
    <>
      ¿Falta un juego en el catálogo? Pídelo. Si alguien ya lo pidió, te sumas a su pedido. Un revisor lo agrega con sus datos, y en{' '}
      {myContributions('Mis aportes')} ves cuándo está listo.
    </>
  ),
  signIn: (signIn: Linked) => <>{signIn('Entra')} para pedir un juego o sumarte a un pedido.</>,
  open: 'Pedidos abiertos',
  none: 'No hay pedidos abiertos.',
  form: {
    heading: 'Pedir un juego',
    title: 'Título',
    steam: 'Enlace o App ID de Steam (opcional)',
    steamHelp: 'Con él, nadie pide el mismo juego dos veces y el revisor rellena la ficha desde la tienda.',
    submit: 'Pedirlo',
  },
  inCatalog: (title: string) => `«${title}» ya está en el catálogo.`,
  viewGame: 'Ver su ficha',
  requested: (title: string) => `Pediste «${title}». Cuando un revisor lo agregue, lo verás en «Mis aportes».`,
  joined: (title: string, n: number) => `Te sumaste al pedido de «${title}». Ya lo piden ${n} personas.`,
  viewOnSteam: 'Ver en Steam',
  requesters: (n: number) => count(n, 'persona lo pide', 'personas lo piden'),
  since: (date: string) => `desde el ${date}`,
  join: 'Sumarme',
  withdraw: 'Ya no lo pido',
  rejectReason: 'Motivo (para rechazar)',
  createGame: 'Crear el juego',
  reject: 'Rechazar',
}
