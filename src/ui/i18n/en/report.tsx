import type { report as source } from '../es/report.tsx'

const gameVersion = 'Game version or build'
const observations = 'Observations'

export const report = {
  backToGame: 'Back to the game page',
  sending: 'Submitting…',

  form: {
    title: (game) => (game === null ? 'Report a result' : `Report a result for ${game}`),
    caption: 'Report a result',
    sent: {
      heading: 'Report submitted',
      pending: (
        <>
          It is <strong>awaiting review</strong> and doesn't count in the game's summary until a reviewer approves it.
        </>
      ),
      proposeSolution: 'Know a solution? Propose it',
      valveReport: 'Prepare the report for Valve',
      another: 'Report another result',
    },
    needsDiagnosis: 'To report, you need a diagnosis of your machine made on Linux: the report keeps the exact setup of the test.',
    makeDiagnosis: 'Run a diagnosis',
    other: { layer: 'another layer', edition: 'another edition', distribution: 'another distribution' },

    where: 'Where you tested',
    diagnostic: { label: 'Machine diagnosis', help: 'Only your diagnoses made on Linux show up.' },
    edition: 'Edition (launcher)',
    layer: {
      legend: 'Compatibility layer used',
      listed: 'A version from the list',
      other: 'Another version',
      version: 'Version',
      family: 'Family',
      variant: 'Variant',
      exactVersion: 'Exact version',
    },
    gameVersion,
    launcherVersion: 'Launcher version (optional)',
    profile: {
      label: 'Profile you followed',
      help: 'Only the profiles that match your diagnosis, the edition, the layer and the game version show up.',
      none: 'No profile',
    },

    what: 'What happened',
    testedAt: 'Date and time of the test',
    outcome: 'Result',
    failures: {
      legend: 'Failures you saw',
      required: "Give at least one failure type. If you don't know the cause, pick “Other” and describe the symptom.",
      optional: 'Optional: note any problem, even if the game works.',
      type: 'Type',
      detail: 'What you saw',
      remove: 'Remove',
      add: 'Add a failure',
    },
    measurement: {
      label: 'I measured the FPS',
      note: 'Without a measurement the report stores no FPS; it never turns into zero.',
      avgFps: 'Average FPS',
      resolution: 'Resolution',
      quality: 'Graphics quality',
      qualityExample: 'Medium',
      method: 'How you measured',
      methodExample: 'MangoHud · scene · duration',
    },
    observations: {
      label: observations,
      help: 'The result, limitations, and any extra tweak you made outside the profile.',
      launchOptions: (options) => `Launch options: ${options}\n`,
    },
    submit: 'Submit report',
  },

  detected: {
    label: 'What the detector read',
    intro: (
      <>
        <b>We filled it in with what the detector read on your machine.</b> Check each field before submitting.
      </>
    ),
    layer: (note) => `Layer: ${note}`,
    tool: (tool, version) => (version === null ? `“${tool}”` : `“${tool}” (${version})`),
    native: 'Steam runs it without a compatibility tool, as a native game. Pick the native version from the list, or type it in.',
    unknownTool: "The detector couldn't tell what Steam runs it with. Pick it yourself.",
    untranslatable: (tool) => `Steam uses ${tool}, which we can't map to a layer. Pick it yourself.`,
    listed: (tool) => `Steam uses ${tool}; we picked it from the list.`,
    noVersion: (tool) => `Steam uses ${tool} without saying the exact version. Type it as Steam shows it, under Properties > Compatibility.`,
    unlisted: (tool) => `Steam uses ${tool}, which isn't on the list yet; we typed it in as another version.`,
    build: (build) => `Build ${build}, in “${gameVersion}”.`,
    launchOptions: `Launch options: in “${observations}”, since the report has no field for them.`,
    guessedAccount: ' There are several Steam accounts on that machine and none is marked as the last one used: these are from the first one.',
    testedAt: "Date and time: the diagnosis's, since a report can't be earlier than its diagnosis.",
  },

  solution: {
    title: (game) => `Propose a solution · ${game}`,
    caption: 'Propose a solution',
    gameVersion: (version) => `version ${version}`,
    sent: {
      heading: 'Solution submitted',
      pending: (
        <>
          It is <strong>awaiting review</strong>. To publish it, a reviewer needs evidence that it fixes the failure, not just that the failure exists.
        </>
      ),
    },
    failure: 'Failure it fixes',
    profile: {
      label: 'Profile you recommend (optional)',
      help: "Only profiles of the same edition. If you recommend a pending one, the solution isn't approved until the profile is.",
      none: "None: I'm describing another action",
    },
    solutionTitle: { label: 'Title', example: 'Reinstall the launcher inside the prefix' },
    instructions: { label: 'Instructions', help: 'Concrete steps to fix the failure or apply the workaround.' },
    submit: 'Submit solution',
  },

  proton: {
    title: (game) => `Report for Valve · ${game}`,
    caption: 'Report for Valve',
    private: "Only you see this page: the report carries your GPU, your driver and your kernel. OpenGame doesn't send it; you open it yourself on GitHub.",
    intro: 'Valve fixes Proton from reports in its GitHub repository. This one already carries your machine and what you saw; only the Proton log is missing.',
    log: {
      heading: 'Turn on the Proton log',
      body: 'In Steam, right-click the game > Properties > General. Put this in “Launch Options” and play until the failure shows up. If you already had options, add PROTON_LOG=1 at the start and keep %command% only once.',
      copy: 'Launch options',
    },
    compress: {
      heading: 'Compress the log',
      body: "Proton leaves it in your home folder. Compressed, it's much smaller, and GitHub accepts it as an attachment.",
      copy: 'Compress the log',
    },
    search: {
      heading: 'Check for an existing report',
      body: (appid) => `Valve wants one report per game. If there is already one for AppID ${appid}, comment there with the text below and the log instead of opening another.`,
      link: (appid) => `Search reports for AppID ${appid}`,
    },
    open: {
      heading: 'Open the report',
      body: (appid) => `Drag steam-${appid}.log.gz into the report, and tick the “I confirm” boxes only if they are true.`,
      link: 'Open the report on GitHub',
      demo: "Demo data isn't sent to Valve.",
      bodyInLink: "If the form doesn't bring the report in, replace its text with this.",
      tooLong: 'The report is too long for the link: paste this text into the form.',
      copy: (title) => `Report: ${title}`,
    },
  },
} satisfies typeof source
