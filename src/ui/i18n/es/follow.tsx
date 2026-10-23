import type { ReactNode } from 'react'
import { count } from '../../format.ts'

/** Following a game: its button and news on the game page, and the "Seguidos" page with every followed game. */
export const follow = {
  signIn: 'Entra para seguirlo',
  follow: 'Seguir',
  unfollow: 'Dejar de seguir',
  news: {
    label: 'Novedades',
    since: (date: string) => `Novedades desde el ${date}`,
    approved: (n: number) => `${count(n, 'reporte aprobado nuevo', 'reportes aprobados nuevos')}.`,
    status: (from: ReactNode, to: ReactNode) => (
      <>
        El estado pasó de {from} a {to}
      </>
    ),
    markSeen: 'Marcar como visto',
  },
  page: {
    title: 'Seguidos',
    intro: 'Los juegos que sigues y lo que cambió desde la última vez que marcaste cada uno como visto. Solo cuentan los reportes aprobados.',
    empty: 'Todavía no sigues ningún juego. Abre su ficha desde el catálogo y pulsa «Seguir».',
    noNews: (date: string) => `Sin novedades desde el ${date}.`,
  },
}
