import { count } from '../../format.ts'
import type { compatibility as source } from '../es/compatibility.tsx'

const approved = (n: number) => count(n, 'approved report', 'approved reports')

export const compatibility = {
  gameStatus: {
    label: 'Compatibility state',
    basis: (n, total, last) => (
      <>
        Based on <b>{approved(n)}</b>
        {n < total && <> from the last year ({total} in total)</>}. Last test on {last}.
      </>
    ),
    noReports: 'There are no approved reports yet.',
    noRecent: 'No confirmation in the last year: every approved report is more than 12 months old.',
    regression: (r) => (
      <>
        <b>Stopped working</b> on {r.launcher}: the most recent test ({r.tested}, version {r.version}, {r.layer}) gave “{r.outcome}” after reports that
        worked.
      </>
    ),
    breakdown: 'Approved results',
    causes: 'Observed causes:',
    pending: (n) => (n === 1 ? "1 more report is awaiting review and doesn't count yet." : `${n} more reports are awaiting review and don't count yet.`),
    footnote:
      "The state is worked out when you look, from the approved reports of the last year, or from all of them if none is that recent. A favorable result doesn't guarantee it works on every machine.",
  },

  setups: {
    empty: 'No setups with approved evidence.',
    label: 'Setups tested with approved reports',
    yourDistro: 'your distro',
    version: (version) => `version ${version}`,
    profile: 'Profile',
    noProfile: 'no profile',
    fps: 'FPS measured by the community',
    notMeasured: 'not measured',
    measurements: (n) => count(n, 'measurement', 'measurements'),
    tests: (n, last) => `${count(n, 'test', 'tests')} · last ${last}`,
    noneRecent: 'none in the last year',
  },

  timeline: {
    label: 'Approved results by version, from the first tested to the latest',
    span: (first, last) => (first === last ? `On ${first}` : `From ${first} to ${last}`),
    regression: (launcher, tested) => (
      <>
        <b>Stopped working</b> with this version on {launcher}, on {tested}.
      </>
    ),
  },

  scoped: (n, last, noRecent) => `${approved(n)} · last test ${last}${noRecent ? ' · no confirmation in the last year' : ''}`,

  machine: {
    title: 'Your machine',
    shapeKey: 'How to read the labels',
    filled: 'Filled: what the approved reports say',
    dashed: 'Dashed: what your machine works out',
    noDiagnosis:
      'No diagnosis. Run the detector to see whether your graphics card has a path for this game, the evidence from your distribution, and how you compare with an approved profile.',
    onMyDistribution: (name) => `On your distribution, ${name}:`,
    noneOnMyDistribution: (name) => `nobody has approved a test on ${name}`,
  },

  checklist: {
    profile: (title, revision) => `profile ${title} r${revision}`,
    noApprovedProfile: 'no approved profile',
    caption: 'Your machine against the profile',
    requirement: 'Spec',
    yours: 'Your machine',
    minimum: 'Known minimum',
    result: 'Result',
    unknown: 'unknown',
    noProfile: 'There is no approved profile with known requirements.',
    windows: 'Diagnosis made on Windows: Vulkan is a projection for Linux based on your graphics card; take it as a guide.',
    reason: {
      fails: "Your machine doesn't meet one of the profile's requirements.",
      missing: (requirement, required) => `${requirement}: the profile requires ${required} and your machine doesn't offer it.`,
      projectedBelow: (requirement, value, required) => `${requirement}: on Linux your graphics card would reach ${value}; the profile requires ${required}.`,
      below: (requirement, value, required) => `${requirement}: you have ${value}; the profile requires ${required}.`,
      projectedUnknown: (requirement, value, required) =>
        `${requirement}: on Linux your graphics card would reach ${value}; we don't know whether that is enough for ${required}.`,
      unknown: (requirement, required) => `We don't know your ${requirement}; the profile requires ${required}.`,
      noConditions: "The profile doesn't declare RAM, VRAM or Vulkan requirements.",
      meets: (requirements) => `You pass the available checks (${requirements}). This doesn't predict FPS.`,
    },
  },

  graphicsPath: {
    caption: 'Graphics path',
    launchOption: 'Steam launch option:',
    approximate: 'Worked out from a Windows diagnosis: take it as a guide.',
  },

  copyBox: {
    copy: 'Copy',
    copied: 'Copied',
    copyLabel: (label) => `Copy ${label.toLowerCase()}`,
    notice: { listo: '', copiado: 'Copied to the clipboard.', fallo: "Couldn't copy. Select the text and copy it by hand." },
  },
} satisfies typeof source
