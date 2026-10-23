import { count } from '../../format.ts'
import type { review as source } from '../es/review.tsx'

const tabs = { reporte: 'Reports', perfil: 'Profiles', solucion: 'Solutions' } satisfies (typeof source)['queue']['tabs']

export const review = {
  queue: {
    heading: 'Contribution review',
    lede: 'Approving requires verifiable evidence. Nothing pending counts in any summary; an approved contribution can be withdrawn if it stops being valid.',
    tabsLabel: 'Contribution type',
    tabs,
    pending: (n) => `${n} pending`,
    empty: (type) => `No pending or approved ${tabs[type].toLowerCase()}.`,
    byOn: (author, date) => `by ${author} · ${date}`,
    blockers: "Why it can't be approved yet",
    own: "It's your contribution: another reviewer must decide on it.",
    reason: 'Reason',
    evidence: 'Evidence (to approve)',
    evidencePlaceholder: 'A verifiable reference: a screenshot, a log or an identified report',
    approve: 'Approve',
    reject: 'Reject',
    withdraw: 'Withdraw',
    version: (version) => `version ${version}`,
    testedOn: (date) => `tested on ${date}`,
    noProfile: 'No profile.',
    followedProfile: (profile) => `Followed the profile “${profile}”.`,
    steps: (n) => count(n, 'step', 'steps'),
    workingReports: (n) => count(n, 'approved working report', 'approved working reports'),
    answers: (failure, detail, report, status) => (
      <>
        Answers {failure} “{detail}” from report #{report} ({status}).
      </>
    ),
    recommendsNoProfile: "Doesn't recommend a profile.",
    recommends: (profile) => `Recommends the profile “${profile}”.`,
  },

  newGame: {
    caption: 'Catalog',
    fromRequest: (title) => `You're creating the game requested as “${title}”. Once you create it, the request is fulfilled and links to the game's page.`,
    requestClosed: "That request is no longer open, so the game you create won't be linked to it.",
    steam: {
      heading: 'Fill in from Steam',
      intro: 'Brings the title, the description and the Steam edition from the store. Everything stays editable, and you tick the graphics APIs and the minimum CPU yourself.',
      field: 'Steam link or App ID',
      submit: 'Fill in from Steam',
      submitting: 'Asking Steam…',
      filled: (title) => `Filled in with Steam's data for “${title}”. Check each field before creating the game.`,
    },
    title: 'Title',
    description: 'Description',
    editions: 'Editions',
    editionsHelp: "One per launcher. The ID is the store's (for example, Steam's App ID), if you know it.",
    launcher: 'Launcher',
    externalId: 'ID (optional)',
    remove: 'Remove',
    addEdition: 'Add an edition',
    apis: 'Graphics APIs',
    apisHelp: 'Tick every API the game can draw with, even a fallback mode.',
    minimumCpu: 'Minimum CPU',
    minimumCpuHelp: 'Only if the game requires an instruction set, like SSE4.2 in Counter-Strike 2.',
    noRequirement: 'No requirement',
    submit: 'Create game',
  },
} satisfies typeof source
