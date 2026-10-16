import type { TestedSetup, CompatibilitySummary } from '../../domain/compatibility.ts'
import { DistributionId, EditionId, ProfileId, LayerVersionId } from '../../domain/ids.ts'
import type { Personal } from '../compatibility/VerdictForMe.tsx'

export type Sample = {
  readonly key: string
  readonly scenario: string
  readonly title: string
  readonly studio: string
  readonly editions: ReadonlyArray<string>
  readonly summary: CompatibilitySummary
  readonly pending: number
  readonly personal: Personal
}

export const diagnostic = {
  summary: 'Portátil de ejemplo · Intel Core i5-8250U · Intel UHD 620 · RAM 8 GB · VRAM desconocida · Vulkan 1.3 · Linux Mint 21.3',
  distribucion_id: DistributionId.make(1),
}

const distro = {
  mint: { distribucion_id: diagnostic.distribucion_id, distribucion: 'Linux Mint 21.3' },
  fedora: { distribucion_id: DistributionId.make(2), distribucion: 'Fedora 40' },
  arch: { distribucion_id: DistributionId.make(3), distribucion: 'Arch Linux' },
  ubuntu: { distribucion_id: DistributionId.make(4), distribucion: 'Ubuntu 24.04' },
  pop: { distribucion_id: DistributionId.make(5), distribucion: 'Pop!_OS 22.04' },
}
const layer = {
  proton8: { version_capa_id: LayerVersionId.make(1), capa: 'Proton 8.0-5' },
  proton9: { version_capa_id: LayerVersionId.make(2), capa: 'Proton 9.0-3' },
  ge94: { version_capa_id: LayerVersionId.make(3), capa: 'GE-Proton 9-4' },
  wine9: { version_capa_id: LayerVersionId.make(4), capa: 'Wine 9.0' },
}
const noProfile = { perfil_id: null, perfil: null }
const day = (iso: string) => new Date(`${iso}T12:00:00Z`)

const setup = (e: Omit<TestedSetup, 'key' | 'recent_count'>): TestedSetup => ({
  ...e,
  recent_count: e.test_count,
  key: [e.edicion_id, e.version_juego, e.distribucion_id, e.version_capa_id, e.perfil_id ?? '-'].join('|'),
})

type Recent = Omit<CompatibilitySummary, 'recent_count' | 'no_recent_confirmation' | 'regressions'> &
  Partial<Pick<CompatibilitySummary, 'regressions'>>

/** Every fixture test is from the last year. */
const allRecent = (r: Recent): CompatibilitySummary => ({ recent_count: r.test_count, no_recent_confirmation: false, regressions: [], ...r })

const gtaFedora = setup({
  edicion_id: EditionId.make(1), lanzador: 'Steam', version_juego: '1.0.3258', ...distro.fedora, ...layer.proton9, ...noProfile,
  status: 'falla_en_ejecucion', test_count: 1, by_outcome: { falla_en_ejecucion: 1 }, last_tested: day('2026-10-02'),
  failures: [{ code: 'lanzador', reports: 1 }], fps: [],
})
const gtaMint = setup({
  edicion_id: EditionId.make(1), lanzador: 'Steam', version_juego: '1.0.3179', ...distro.mint, ...layer.proton8,
  perfil_id: ProfileId.make(1), perfil: 'GTAV-BAJO r2',
  status: 'funciona', test_count: 2, by_outcome: { funciona: 2 }, last_tested: day('2026-09-28'), failures: [],
  fps: [
    { resolution: '1280x720', quality: 'Bajo', average: 54, samples: 1 },
    { resolution: '1920x1080', quality: 'Bajo', average: 41.5, samples: 1 },
  ],
})
const gtaArch = setup({
  edicion_id: EditionId.make(2), lanzador: 'Epic (Heroic)', version_juego: '1.0.3179', ...distro.arch, ...layer.ge94, ...noProfile,
  status: 'funciona_con_ajustes', test_count: 1, by_outcome: { funciona_con_ajustes: 1 }, last_tested: day('2026-09-02'),
  failures: [], fps: [{ resolution: '1920x1080', quality: 'Medio', average: 60, samples: 1 }],
})

const gta: Sample = {
  key: 'gta5',
  scenario: 'Resultados variables con 3 entornos y «En tu distribución»',
  title: 'Grand Theft Auto V',
  studio: 'Rockstar Games',
  editions: ['Steam', 'Epic (Heroic)'],
  summary: allRecent({
    status: 'resultados_variables', test_count: 4, last_tested: day('2026-10-02'),
    setups: [gtaFedora, gtaMint, gtaArch], failures: [{ code: 'lanzador', reports: 1 }],
    regressions: [
      { edicion_id: EditionId.make(1), lanzador: 'Steam', fecha_prueba: day('2026-10-02'), version_juego: '1.0.3258', capa: 'Proton 9.0-3', resultado: 'falla_en_ejecucion' },
    ],
  }),
  pending: 1,
  personal: {
    path: { status: 'con_ruta', path: 'dxvk_2' }, nivel_x86_min: null, approximate: false,
    on_my_distribution: {
      name: 'Linux Mint 21.3',
      summary: allRecent({ status: 'funciona', test_count: 2, last_tested: day('2026-09-28'), setups: [gtaMint], failures: [] }),
    },
    profile: {
      titulo: 'GTAV-BAJO', revision: 2,
      evaluation: {
        verdict: 'cumple', advisory_only: false,
        checks: [
          { requirement: 'ram', status: 'cumple', required: '8192', detected: { value: '8192', origin: 'medido' } },
          { requirement: 'vulkan', status: 'cumple', required: '1.1', detected: { value: '1.3', origin: 'medido' } },
        ],
      },
    },
  },
}

const valArch = setup({
  edicion_id: EditionId.make(5), lanzador: 'Riot Client', version_juego: '9.07', ...distro.arch, ...layer.ge94, ...noProfile,
  status: 'no_inicia', test_count: 1, by_outcome: { no_inicia: 1 }, last_tested: day('2026-08-03'),
  failures: [{ code: 'anti_cheat', reports: 1 }], fps: [],
})
const valMint = setup({
  edicion_id: EditionId.make(5), lanzador: 'Riot Client', version_juego: '9.07', ...distro.mint, ...layer.wine9, ...noProfile,
  status: 'no_inicia', test_count: 1, by_outcome: { no_inicia: 1 }, last_tested: day('2026-07-11'),
  failures: [{ code: 'anti_cheat', reports: 1 }], fps: [],
})

const valorant: Sample = {
  key: 'valorant',
  scenario: 'No inicia, sin perfil aprobado',
  title: 'Valorant',
  studio: 'Riot Games',
  editions: ['Riot Client'],
  summary: allRecent({
    status: 'no_inicia', test_count: 2, last_tested: day('2026-08-03'),
    setups: [valArch, valMint], failures: [{ code: 'anti_cheat', reports: 2 }],
  }),
  pending: 0,
  personal: {
    path: { status: 'con_ruta', path: 'dxvk_2' }, nivel_x86_min: null, approximate: false,
    on_my_distribution: {
      name: 'Linux Mint 21.3',
      summary: allRecent({ status: 'no_inicia', test_count: 1, last_tested: day('2026-07-11'), setups: [valMint], failures: [{ code: 'anti_cheat', reports: 1 }] }),
    },
    profile: null,
  },
}

const ets2: Sample = {
  key: 'ets2',
  scenario: 'Solo reportes pendientes: sin evidencia verificada',
  title: 'Euro Truck Simulator 2',
  studio: 'SCS Software',
  editions: ['Steam'],
  summary: allRecent({ status: 'sin_evidencia', test_count: 0, last_tested: null, setups: [], failures: [] }),
  pending: 2,
  personal: {
    path: { status: 'con_ruta', path: 'dxvk_2' }, nivel_x86_min: null, approximate: false,
    on_my_distribution: {
      name: 'Linux Mint 21.3',
      summary: allRecent({ status: 'sin_evidencia', test_count: 0, last_tested: null, setups: [], failures: [] }),
    },
    profile: null,
  },
}

const erUbuntu = setup({
  edicion_id: EditionId.make(4), lanzador: 'Steam', version_juego: '1.12', ...distro.ubuntu, ...layer.proton9,
  perfil_id: ProfileId.make(3), perfil: 'ER-BASE r3',
  status: 'funciona_con_ajustes', test_count: 1, by_outcome: { funciona_con_ajustes: 1 }, last_tested: day('2026-09-30'),
  failures: [], fps: [],
})
const erMint = setup({
  edicion_id: EditionId.make(4), lanzador: 'Steam', version_juego: '1.12', ...distro.mint, ...layer.proton9,
  perfil_id: ProfileId.make(3), perfil: 'ER-BASE r3',
  status: 'funciona_con_ajustes', test_count: 1, by_outcome: { funciona_con_ajustes: 1 }, last_tested: day('2026-09-21'),
  failures: [], fps: [{ resolution: '1600x900', quality: 'Bajo + FSR', average: 38, samples: 1 }],
})

const eldenRing: Sample = {
  key: 'elden-ring',
  scenario: 'Funciona con ajustes; tu equipo no cumple la RAM',
  title: 'Elden Ring',
  studio: 'FromSoftware',
  editions: ['Steam'],
  summary: allRecent({ status: 'funciona_con_ajustes', test_count: 2, last_tested: day('2026-09-30'), setups: [erUbuntu, erMint], failures: [] }),
  pending: 0,
  personal: {
    path: { status: 'con_ruta', path: 'vkd3d_proton' }, nivel_x86_min: null, approximate: false,
    on_my_distribution: {
      name: 'Linux Mint 21.3',
      summary: allRecent({ status: 'funciona_con_ajustes', test_count: 1, last_tested: day('2026-09-21'), setups: [erMint], failures: [] }),
    },
    profile: {
      titulo: 'ER-BASE', revision: 3,
      evaluation: {
        verdict: 'no_cumple', advisory_only: false,
        checks: [
          { requirement: 'ram', status: 'no_cumple', required: '12288', detected: { value: '8192', origin: 'medido' } },
          { requirement: 'vram', status: 'desconocido', required: '4096', detected: null },
          { requirement: 'vulkan', status: 'cumple', required: '1.3', detected: { value: '1.3', origin: 'medido' } },
        ],
      },
    },
  },
}

const twPop = setup({
  edicion_id: EditionId.make(7), lanzador: 'GOG (Heroic)', version_juego: '4.04', ...distro.pop, ...layer.ge94, ...noProfile,
  status: 'funciona', test_count: 1, by_outcome: { funciona: 1 }, last_tested: day('2026-09-10'), failures: [], fps: [],
})
const twMint = setup({
  edicion_id: EditionId.make(6), lanzador: 'Steam', version_juego: '4.04', ...distro.mint, ...layer.proton8,
  perfil_id: ProfileId.make(2), perfil: 'TW3-IGPU r1',
  status: 'funciona', test_count: 1, by_outcome: { funciona: 1 }, last_tested: day('2026-08-20'), failures: [],
  fps: [{ resolution: '1280x720', quality: 'Bajo', average: 31, samples: 1 }],
})

const witcher: Sample = {
  key: 'witcher3',
  scenario: 'Evaluación «Información insuficiente»: VRAM desconocida',
  title: 'The Witcher 3: Wild Hunt',
  studio: 'CD PROJEKT RED',
  editions: ['Steam', 'GOG (Heroic)'],
  summary: allRecent({ status: 'funciona', test_count: 2, last_tested: day('2026-09-10'), setups: [twPop, twMint], failures: [] }),
  pending: 0,
  personal: {
    path: { status: 'con_ruta', path: 'dxvk_2' }, nivel_x86_min: null, approximate: false,
    on_my_distribution: {
      name: 'Linux Mint 21.3',
      summary: allRecent({ status: 'funciona', test_count: 1, last_tested: day('2026-08-20'), setups: [twMint], failures: [] }),
    },
    profile: {
      titulo: 'TW3-IGPU', revision: 1,
      evaluation: {
        verdict: 'informacion_insuficiente', advisory_only: false,
        checks: [
          { requirement: 'ram', status: 'cumple', required: '6144', detected: { value: '8192', origin: 'medido' } },
          { requirement: 'vram', status: 'desconocido', required: '2048', detected: null },
          { requirement: 'vulkan', status: 'cumple', required: '1.1', detected: { value: '1.3', origin: 'medido' } },
        ],
      },
    },
  },
}

export const samples: ReadonlyArray<Sample> = [gta, valorant, ets2, eldenRing, witcher]

export const launchOptions = { label: 'Parámetros de lanzamiento · GTAV-BAJO r2', text: 'PROTON_USE_WINED3D=0 DXVK_ASYNC=1 %command%' }
