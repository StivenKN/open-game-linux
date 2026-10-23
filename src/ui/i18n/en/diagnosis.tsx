import { count } from '../../format.ts'
import type { diagnosis as source } from '../es/diagnosis.tsx'

/** `n` of the `working` games: "it asks…" when it is the only one, "they all ask…", or "2 of them ask…". */
const ofThem = (n: number, working: number, one: string, many: string) =>
  n === working ? (n === 1 ? `it ${one}` : `they all ${many}`) : `${n} of them ${n === 1 ? one : many}`

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export const diagnosis = {
  title: 'Diagnosis',
  heading: 'Diagnose your machine',
  intro:
    "Compare your computer's RAM, VRAM and Vulkan support with each game's approved profiles. You can do it without an account: we save nothing until you press “Save to my machine”.",
  myMachines: 'Your machines',
  evaluating: 'Evaluating…',

  detector: {
    heading: 'Automatic detector',
    intro:
      "A script that reads your hardware and the games you have installed on Steam, without administrator rights. When it finishes, it opens this page with the result in the address (after “#”), which your browser doesn't send to any server.",
    powershell: 'Run in PowerShell (Windows 10 or 11, no administrator needed)',
    linux: 'Run in a Linux terminal',
    download: (file) => `Download ${file}`,
    readFirst: 'to read it before running it with',
    pasteLabel: 'No browser on that machine? Paste what the detector printed here',
    copied: 'The detector copied the result to the clipboard: paste it here (Ctrl+V)',
    pastePlaceholder: '{"version_esquema":1,…} or the full address with #d=',
    evaluate: 'Evaluate what I pasted',
    vulkanUnknown: (
      <>
        On Linux, does Vulkan show as “Unknown”? Install <code>vulkan-tools</code> and run the detector again, or check it by hand:
      </>
    ),
    vulkanCheck: 'Manual Vulkan check',
  },

  manual: {
    heading: 'Manual description',
    intro: "Can't run the detector? Enter what you know about your machine.",
    system: 'Operating system',
    version: 'Version',
    kernelPlaceholder: 'Kernel, e.g. 6.8',
    device: 'Device',
    pc: 'PC or laptop',
    distribution: 'Distribution',
    distributionVersion: 'Distribution version',
    distributionVersionPlaceholder: '21.3 or rolling',
    cpu: 'Processor (CPU)',
    gpu: 'Graphics card (GPU)',
    ram: 'Memory (RAM)',
    vram: 'Video memory (VRAM)',
    dontKnow: "Don't know",
    vulkanVersion: 'Vulkan version',
    onlyWithSupport: 'Only if supported',
    architecture: 'Architecture',
    x86: 'x86_64 (Intel or AMD)',
    evaluate: 'Evaluate my machine',
  },

  import: {
    title: 'Your diagnosis',
    empty: 'There is no diagnosis to show',
    emptyHelp: (diagnosis) => (
      <>
        Run the detector with <code>--open</code>, or paste its output in {diagnosis}.
      </>
    ),
    reading: 'Reading your machine…',
    unreadable: "We couldn't read this diagnosis",
    back: 'Back to Diagnosis',
    heading: 'Your machine against the catalog',
    intro: "This evaluation hasn't been saved. It compares RAM, VRAM and Vulkan with the approved profile suggested for each game; it doesn't predict FPS.",
    notInCatalog: (appId) => `Steam game ${appId} isn't in the catalog yet, so there is no report form to fill in. You can still save the diagnosis.`,
    report: (title) => `Report ${title}`,
    steamRead: (s) => {
      const tool = s.tool !== null ? `“${s.tool_version ?? s.tool}”` : s.native ? 'no compatibility tool (native)' : 'unknown tool'
      const options = s.launch_options === null ? '' : `, with the launch options “${s.launch_options}”`
      const build = s.build_id === null ? '' : `, build ${s.build_id}`
      return `The detector read how Steam runs this game: ${tool}${options}${build}. Save this diagnosis and we'll take you to the report form, already filled in. Nothing is sent until you check it.`
    },
  },

  save: {
    label: 'Save',
    notYours: "That machine isn't yours. Pick one from your list.",
    needAccount: 'To save this diagnosis to your machine, you need an account.',
    needAccountToReport: 'To report, you need an account. Your diagnosis will be waiting here when you come back.',
    signInToSave: 'Sign in to save',
    signInToReport: 'Sign in to report',
    saveIn: 'Save to',
    newMachine: 'A new machine…',
    newMachineName: 'Name of the new machine',
    defaultAlias: 'My machine',
    aliasPlaceholder: 'Work laptop',
    saving: 'Saving…',
    save: 'Save to my machine',
    saveAndReport: 'Save and report',
    withLibrary: (n) => `Also save my list of Steam games (${n}). Only you can see it.`,
    saved: 'Saved.',
    alreadySaved: 'It was already saved; no copy was made.',
    viewSaved: 'See the saved diagnosis',
  },

  saved: {
    title: 'Saved diagnosis',
    heading: (alias) => `Diagnosis of “${alias}”`,
    private: 'Only you can see this diagnosis. The reports you publish will show its technical context, not your email.',
  },

  machines: { none: 'No diagnoses yet.' },

  capture: {
    label: 'Your machine',
    device: 'Device',
    system: 'System',
    cpu: 'Processor',
    noX86Level: 'x86-64 level not captured',
    gpu: 'Graphics card',
    unknownVram: 'Unknown VRAM',
    vram: (amount) => `${amount} of VRAM`,
    ram: 'RAM',
    noSwap: (name) => `no ${name}`,
    driver: 'Driver',
    unknownDriver: 'Unknown',
    secureBoot: 'Secure Boot',
    notCaptured: 'Not captured',
    tpmNotCaptured: 'TPM not captured',
    captured: (when) => `Captured on ${when}.`,
    guides: (link) => <>To choose a distribution, install it or dual boot with Windows, see the {link}.</>,
    guidesLink: 'adoption guides',
  },

  graphicsCard: {
    heading: 'Your graphics card on Linux',
    noPci: "This diagnosis doesn't include your graphics card's PCI id. Run the detector again to see what it can do on Linux.",
    unknownGpu: (pci) => `We don't recognize the graphics card ${pci}, so we can't project what it will do on Linux.`,
    generation: 'Generation',
    driver: 'Linux driver',
    vulkanNo: 'not supported',
    vulkanYes: 'supported',
    d3d9to11: 'DirectX 9 to 11',
    d3d12Yes: 'Yes, with VKD3D-Proton',
    d3d12No: 'No',
    d3d12Needs: 'Needs Vulkan 1.3',
    launchOption: 'Steam launch option',
    projected: 'A projection from your GPU model, not a measurement.',
  },

  matrix: { label: 'Games against your machine' },

  games: {
    heading: 'Games',
    library: 'Your Steam library',
    unknown: (n) => `Games we don't know yet (${n})`,
    unknownHelp: "They aren't in the catalog yet, so we don't know how they run on Linux. Each name opens its Steam page.",
    rest: 'Rest of the catalog',
  },

  readiness: {
    label: 'Summary of your library',
    headline: ({ installed, in_catalog, working }) => {
      if (installed === 0) return "The detector didn't find any installed Steam games."
      const one = installed === 1
      if (in_catalog === 0) return one ? "Your game isn't in the catalog yet." : `None of your ${installed} games is in the catalog yet.`
      if (working === 0) return one ? 'Your game has no evidence yet that it works on Linux.' : `None of your ${installed} games has evidence yet that it works on Linux.`
      const subject = working === installed ? (one ? 'Your game' : `All ${installed} of your games`) : `${working} of your ${installed} games`
      return `${subject} ${working === 1 ? 'has evidence that it works' : 'have evidence that they work'} on Linux.`
    },
    outOfReach: (n, working) => `But ${ofThem(n, working, 'asks', 'ask')} for more than your machine has.`,
    stale: (n, working) => `${capitalized(ofThem(n, working, 'only has', 'only have'))} approved reports from more than a year ago.`,
    installed: (installed, inCatalog, unknown) =>
      `${count(installed, 'installed game', 'installed games')}: ${inCatalog} in the catalog${unknown > 0 ? ` and ${unknown} we don't know yet` : ''}.`,
    byStatus: 'Your catalog games, by state',
    blocked: (n) => (n === 1 ? '1 of them is blocked by an anti-cheat.' : `${n} of them are blocked by an anti-cheat.`),
    holdingBack: 'Holding you back',
    noneHoldingBack: 'None for now.',
    stoppedWorking: 'Stopped working',
    outOfReachChip: 'Your machine falls short',
    noEvidence: 'No evidence',
    noEvidenceHelp: "Nobody has approved a test of these games yet. If you've already played one on Linux, report it.",
    report: 'Report a result',
    more: (n) => `And ${count(n, 'more game', 'more games')} in the list below.`,
    footnote: "Only approved reports count, just like on each game's page. A good result doesn't guarantee it works on your machine.",
  },

  distributions: {
    heading: 'Distributions',
    intro: (guide) => (
      <>
        We don't pick one for you. We rule out the ones your machine can't use and say which tweak each one needs; “no objections” means we found nothing
        against it. To decide between them, read {guide}.
      </>
    ),
    guides: 'the adoption guides',
    guide: 'Which distribution should you pick for gaming?',
  },
} satisfies typeof source
