// Labels for the domain's literals. Tones, icons and names that read the same in every language live here;
// the words live in each language's dictionary (`i18n/es/vocabulary.ts` is the source), and `vocabulary`
// joins the two, so a page reads `t.compatibilityStatus[status]` with one shared tone.
import { Record } from 'effect'
import type { CompatibilityStatus } from '../domain/compatibility.ts'
import type { GraphicsApi, Outcome } from '../domain/literals.ts'
import type { RequirementCheck, OperatingSystem, RequirementsVerdict } from '../domain/evaluation.ts'
import type { D3dPath } from '../domain/gpu.ts'
import type { GameRequestStatus } from '../domain/game-requests.ts'
import type { ReviewStatus } from '../domain/review.ts'
import type { Device, X86Level } from '../domain/platform.ts'
import type { RenderPath, GamePath } from '../domain/graphics-path.ts'
import type { ObjectionCode, Objection, DistroVerdict } from '../domain/distros.ts'
import type { AntiCheatStatus } from '../domain/literals.ts'
import type { vocabulary as source } from './i18n/es/vocabulary.ts'

export type Tone = 'verde' | 'amarillo' | 'rojo' | 'gris' | 'morado' | 'azul'
export type Label = { readonly text: string; readonly tone: Tone; readonly icon: string }
type Style = Omit<Label, 'text'>

// Gives each style its words in one language.
const labels = <K extends string>(styles: Readonly<Record<K, Style>>, text: Readonly<Record<K, string>>): Record<K, Label> =>
  Record.map(styles, (style, key) => ({ ...style, text: text[key] }))

const statusStyles = {
  sin_evidencia: { tone: 'gris', icon: '?' },
  funciona: { tone: 'verde', icon: '✓' },
  funciona_con_ajustes: { tone: 'amarillo', icon: '⚙' },
  no_inicia: { tone: 'rojo', icon: '✕' },
  falla_en_ejecucion: { tone: 'rojo', icon: '✕' },
  resultados_variables: { tone: 'morado', icon: '◐' },
} as const satisfies Record<CompatibilityStatus, Style>

const requirementsVerdictStyles = {
  no_cumple: { tone: 'rojo', icon: '✕' },
  informacion_insuficiente: { tone: 'gris', icon: '?' },
  cumple: { tone: 'verde', icon: '✓' },
} as const satisfies Record<RequirementsVerdict, Style>

const checkStyles = {
  cumple: { tone: 'verde', icon: '✓' },
  no_cumple: { tone: 'rojo', icon: '✕' },
  desconocido: { tone: 'amarillo', icon: '?' },
} as const satisfies Record<RequirementCheck['status'], Style>

const reviewStyles = {
  pendiente: { tone: 'gris', icon: '…' },
  aprobado: { tone: 'verde', icon: '✓' },
  rechazado: { tone: 'rojo', icon: '✕' },
  retirado: { tone: 'gris', icon: '–' },
} as const satisfies Record<ReviewStatus, Style>

const distroStyles = {
  sin_objeciones: { tone: 'verde', icon: '✓' },
  con_ajustes: { tone: 'amarillo', icon: '⚙' },
  descartada: { tone: 'rojo', icon: '✕' },
} as const satisfies Record<DistroVerdict, Style>

const requestStyles = {
  abierto: { tone: 'azul', icon: '…' },
  cumplido: { tone: 'verde', icon: '✓' },
  rechazado: { tone: 'rojo', icon: '✕' },
} as const satisfies Record<GameRequestStatus, Style>

const antiCheatStyles = {
  Supported: { tone: 'verde', icon: '✓' },
  Running: { tone: 'amarillo', icon: '⚙' },
  Planned: { tone: 'gris', icon: '…' },
  Broken: { tone: 'rojo', icon: '✕' },
  Denied: { tone: 'rojo', icon: '✕' },
} as const satisfies Record<AntiCheatStatus, Style>

const failureTones: Readonly<Record<string, Tone>> = {
  anti_cheat: 'rojo',
  drm: 'rojo',
  lanzador: 'amarillo',
  controlador: 'amarillo',
  dependencia: 'amarillo',
  rendimiento: 'amarillo',
  otro: 'amarillo',
}

export const requirement = { ram: 'RAM', vram: 'VRAM', vulkan: 'Vulkan' } as const satisfies Record<RequirementCheck['requirement'], string>

export const operatingSystem = { Linux: 'Linux', Windows: 'Windows' } as const satisfies Record<OperatingSystem, string>

export const graphicsApi = {
  d3d9: 'Direct3D 9',
  d3d10: 'Direct3D 10',
  d3d11: 'Direct3D 11',
  d3d12: 'Direct3D 12',
  vulkan: 'Vulkan',
  opengl: 'OpenGL',
} as const satisfies Record<GraphicsApi, string>

export const device = { steam_deck_lcd: 'Steam Deck (LCD)', steam_deck_oled: 'Steam Deck (OLED)' } as const satisfies Record<Device, string>

/** A level as a requirement, named by the instruction set games actually ask for. */
export const x86Level = {
  v1: 'x86-64-v1',
  v2: 'x86-64-v2 (SSE4.2)',
  v3: 'x86-64-v3 (AVX2)',
  v4: 'x86-64-v4',
} as const satisfies Record<X86Level, string>

const d3dOptions = {
  dxvk: null,
  dxvk_2: null,
  dxvk_sarek: 'PROTON_DXVK_SAREK=1 %command%',
  wined3d: 'PROTON_USE_WINED3D=1 %command%',
} as const satisfies Record<D3dPath, string | null>

export type D3dPathLabel = { readonly text: string; readonly detail: string | null; readonly option: string | null }

const renderPathStyles = {
  dxvk: { name: 'DXVK', tone: 'verde', option: null },
  dxvk_2: { name: 'DXVK 2.x', tone: 'verde', option: null },
  vkd3d_proton: { name: 'VKD3D-Proton', tone: 'verde', option: null },
  vulkan: { name: 'Vulkan', tone: 'verde', option: null },
  opengl: { name: 'OpenGL', tone: 'verde', option: null },
  dxvk_sarek: { name: 'DXVK-Sarek', tone: 'amarillo', option: d3dOptions.dxvk_sarek },
  wined3d: { name: 'WineD3D', tone: 'amarillo', option: d3dOptions.wined3d },
} as const satisfies Record<RenderPath, { readonly name: string; readonly tone: Tone; readonly option: string | null }>

export type RenderPathLabel = {
  readonly name: string
  readonly sentence: string
  readonly tone: Tone
  readonly note: string | null
  readonly option: string | null
}

/** Every label of one language: its dictionary's words on the shared tones, icons and names. */
export const vocabulary = (text: typeof source) => {
  const compatibilityStatus = labels(statusStyles, text.compatibilityStatus)
  // Failure types are rows, looked up by any code; the dictionaries word the seed's.
  const failureNames: Readonly<Record<string, string>> = text.failureType
  const failureDescriptions: Readonly<Record<string, string>> = text.failureTypeDescription
  const renderPath = Record.map(renderPathStyles, (style, path): RenderPathLabel => ({ ...style, ...text.renderPath[path] }))
  return {
    compatibilityStatus,
    outcome: {
      funciona: compatibilityStatus.funciona,
      funciona_con_ajustes: compatibilityStatus.funciona_con_ajustes,
      no_inicia: compatibilityStatus.no_inicia,
      falla_en_ejecucion: compatibilityStatus.falla_en_ejecucion,
    } satisfies Record<Outcome, Label>,
    statusMeaning: text.statusMeaning,
    requirementsVerdict: labels(requirementsVerdictStyles, text.requirementsVerdict),
    checkStatus: labels(checkStyles, text.checkStatus),
    reviewStatus: labels(reviewStyles, text.reviewStatus),
    distroVerdict: labels(distroStyles, text.distroVerdict),
    gameRequestStatus: labels(requestStyles, text.gameRequestStatus),
    antiCheatStatus: Record.map(antiCheatStyles, (style, status) => ({ ...style, ...text.antiCheatStatus[status] })),
    failureType: (code: string): Omit<Label, 'icon'> => ({ text: failureNames[code] ?? code.replaceAll('_', ' '), tone: failureTones[code] ?? 'amarillo' }),
    /** A failure type's description in this language, or the one stored with a type the dictionary lacks. */
    failureTypeDescription: <D extends string | null>(code: string, stored: D) => failureDescriptions[code] ?? stored,
    vulkanSupport: text.vulkanSupport,
    secureBoot: text.secureBoot,
    tpm: text.tpm,
    role: text.role,
    blocker: text.blocker,
    guideType: text.guideType,
    guideStatus: text.guideStatus,
    payloadReason: text.payloadReason,
    vulkanOrigin: text.vulkanOrigin,
    gpuFamily: text.gpuFamily,
    linuxDriver: text.linuxDriver,
    gpuWarning: text.gpuWarning,
    protonVariant: text.protonVariant,
    skipReason: text.skipReason,
    notExportableReason: text.notExportableReason,
    noReportReason: text.noReportReason,
    steamUnavailable: text.steamUnavailable,
    d3dPath: Record.map(d3dOptions, (option, path): D3dPathLabel => ({ ...text.d3dPath[path], option })),
    /** The type demands a warning on every path that is unsafe with online anti-cheat. */
    renderPath,
    gamePathLabel: (r: GamePath): Label => {
      switch (r.status) {
        case 'con_ruta':
          return { text: renderPath[r.path].name, tone: renderPath[r.path].tone, icon: '✓' }
        case 'sin_ruta':
          return { text: text.gamePath.noPath, tone: 'rojo', icon: '✕' }
        case 'sin_datos':
          return { text: text.gamePath.missingData, tone: 'gris', icon: '?' }
        case 'sin_apis':
          return { text: text.gamePath.noApis, tone: 'gris', icon: '?' }
      }
    },
    gamePathSentences: (r: GamePath, minX86Level: X86Level | null): ReadonlyArray<string> => {
      switch (r.status) {
        case 'con_ruta':
          return [renderPath[r.path].sentence]
        case 'sin_ruta':
          return [r.reason === 'grafica' ? text.gamePath.noGraphicsPath : text.gamePath.cpuBelow(minX86Level === null ? 'x86-64' : x86Level[minX86Level])]
        case 'sin_datos':
          return [r.at_least === null ? text.gamePath.unknownYet : text.gamePath.atLeast(renderPath[r.at_least].name), ...r.missing.map((f) => text.gamePath.missing[f])]
        case 'sin_apis':
          return [text.gamePath.undeclaredApis]
      }
    },
    objection: <K extends ObjectionCode>(o: Extract<Objection, { readonly code: K }>): string => text.objections[o.code](o),
  }
}

export type Vocabulary = ReturnType<typeof vocabulary>
