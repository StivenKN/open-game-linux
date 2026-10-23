import type { GuideStatus } from '../../../domain/guides.ts'

/** The adoption guides at /guias: the list, a guide, and the reviewers' new and edit forms. */
export const guides = {
  heading: 'Guías de adopción',
  lede: 'Para elegir una distribución, instalarla o convivir con Windows en el mismo equipo.',
  newGuide: 'Nueva guía',
  none: 'Todavía no hay guías publicadas.',
  /** The chip of a guide that applies to every distribution. */
  anyDistribution: 'cualquier distribución',
  updatedOn: (date: string) => `actualizada el ${date}`,
  meta: (revision: number, date: string, author: string) => `Revisión ${revision} · actualizada el ${date} · por ${author}`,
  notPublic: (status: string) => `${status}: no es pública`,
  editGuide: 'Editar la guía',

  edit: {
    title: (guide: string) => `Editar ${guide}`,
    crumb: 'Editar',
    intro: (revision: number) =>
      `Revisión ${revision}. Cambiar el texto, el título, el tipo o la distribución crea la revisión siguiente; cambiar solo el estado, no.`,
    save: 'Guardar los cambios',
    cancel: 'Cancelar',
  },

  create: { save: 'Guardar la guía' },

  form: {
    title: 'Título',
    type: 'Tipo',
    distribution: 'Distribución',
    anyDistribution: 'Cualquier distribución',
    content: 'Contenido',
    contentHelp: 'Texto sin formato. Una línea en blanco separa párrafos; un salto de línea simple se respeta, útil para pasos numerados.',
    status: 'Estado',
    statusHelp: {
      borrador: 'Solo la ven los revisores.',
      publicada: 'Aparece en Guías para todos.',
      archivada: 'Deja de verse en Guías; los revisores la siguen viendo.',
    } satisfies Record<GuideStatus, string>,
  },
}
