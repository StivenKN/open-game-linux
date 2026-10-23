import type { guides as source } from '../es/guides.tsx'

export const guides = {
  heading: 'Guides for switching to Linux',
  lede: 'To choose a distribution, install it, or share a machine with Windows.',
  newGuide: 'New guide',
  none: 'There are no published guides yet.',
  anyDistribution: 'any distribution',
  updatedOn: (date) => `updated ${date}`,
  meta: (revision, date, author) => `Revision ${revision} · updated ${date} · by ${author}`,
  notPublic: (status) => `${status}: not public`,
  editGuide: 'Edit the guide',

  edit: {
    title: (guide) => `Edit ${guide}`,
    crumb: 'Edit',
    intro: (revision) =>
      `Revision ${revision}. Changing the text, the title, the type or the distribution creates the next revision; changing only the status doesn't.`,
    save: 'Save the changes',
    cancel: 'Cancel',
  },

  create: { save: 'Save the guide' },

  form: {
    title: 'Title',
    type: 'Type',
    distribution: 'Distribution',
    anyDistribution: 'Any distribution',
    content: 'Content',
    contentHelp: 'Plain text. A blank line separates paragraphs; a single line break is kept, which helps with numbered steps.',
    status: 'Status',
    statusHelp: {
      borrador: 'Only reviewers see it.',
      publicada: 'Shows in Guides for everyone.',
      archivada: 'No longer shows in Guides; reviewers still see it.',
    },
  },
} satisfies typeof source
