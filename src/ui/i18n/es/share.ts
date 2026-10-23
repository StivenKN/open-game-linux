import { count } from '../../format.ts'

const basedOn = (n: number) => `Según ${count(n, 'reporte aprobado', 'reportes aprobados')}`

/** What leaves the app: link previews, the status badge and its embed codes, and the images' own text. */
export const share = {
  site: {
    imageAlt: 'OpenGame Linux: lleva tu biblioteca de Windows a Linux.',
    heading: 'Lleva tu biblioteca de Windows a Linux.',
    lede: 'Cómo les fue a jugadores que ya probaron cada juego, según los reportes que aprobó un revisor.',
  },
  /** A game's link preview: its state as the title says it, the approved reports behind it, and the demo stamp. */
  game: {
    title: (game: string, status: string) => `${game} en Linux: ${status}`,
    noReports: 'Todavía no hay reportes aprobados. ¿Lo jugaste en Linux? Cuenta cómo te fue.',
    reports: (n: number, noRecent: boolean) => `${basedOn(n)} de jugadores en Linux.${noRecent ? ' Sin confirmación en el último año.' : ''}`,
    demo: 'Datos de ejemplo, de cuentas de demostración.',
  },
  /** The text drawn into the preview image and the badge. */
  image: {
    gameNotFound: 'No encontramos ese juego.',
    noReports: 'Todavía no hay reportes aprobados',
    basedOn,
    demoNote: 'datos de ejemplo',
  },
  embed: {
    heading: 'Compartir',
    intro: 'Pon el estado de este juego en un README, un foro o tu sitio. La insignia sigue al estado calculado: cambia sola cuando un revisor aprueba nuevos reportes.',
    alt: (game: string) => `Estado de ${game} en OpenGame Linux`,
    badgeAlt: (status: string, demo: boolean) => `Insignia: OpenGame Linux, ${status}${demo ? ', datos de ejemplo' : ''}`,
  },
}
