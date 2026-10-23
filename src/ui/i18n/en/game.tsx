import type { game as source } from '../es/game.tsx'

export const game = {
  report: 'Report a result',
  breadcrumbs: 'Breadcrumbs',
  catalog: 'Catalog',
  editions: 'Editions',
  noApis: 'Graphics APIs not declared',
  graphics: (apis) => `Graphics: ${apis}`,
  minimumCpu: (level) => `Minimum CPU: ${level}`,
  steamDeck: 'On Steam Deck:',
  noSteamDeck: 'nobody has approved a test on a Steam Deck',
  latestDiagnosis: (machine, date) => `Based on your latest diagnosis: ${machine}, ${date}.`,
  setups: { heading: 'Where it was tested', intro: 'Each row is a setup with approved reports.' },
  history: {
    heading: 'History by version',
    intro: 'Each step is a Proton, Wine or native version, in the order it was first tested. Every approved report counts, from any date.',
  },
  profiles: {
    heading: 'Configuration profiles',
    none: 'There are no profiles for this game yet.',
    testing: 'in testing',
    pending: "It isn't approved yet and no reviewer has read its steps. If you try it, your report adds the evidence its approval needs.",
    yourMachine: 'Your machine:',
    propose: 'Propose a profile',
  },
  causes: {
    heading: 'Causes and solutions',
    none: 'No approved report records a failure.',
    noSolutions: 'No verified solutions yet.',
    by: (author, profile) => (
      <>
        Contributed by {author}
        {profile !== null && <>. It recommends the profile {profile}</>}.
      </>
    ),
    propose: 'Propose a solution',
  },
  played: {
    heading: 'Did you play it on Linux?',
    intro: 'Tell us which distribution and which setup you used. A reviewer approves it and then it counts.',
    detector:
      "Don't know your Proton version? Run this on the machine you played on: it reads the compatibility tool Steam uses for this game, its launch options and its build, and opens the form filled in for you to check.",
    detectorLabel: 'Report with the detector, on Linux',
    noWindows: 'There is no report mode on Windows: a report needs a diagnosis made on Linux.',
  },
} satisfies typeof source
