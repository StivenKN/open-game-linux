import type { TestedSetup, CompatibilitySummary } from '../../domain/compatibility.ts'
import { DistributionId, EditionId, ProfileId, LayerVersionId } from '../../domain/ids.ts'
import type { Personal } from '../compatibility/VerdictForMe.tsx'

export type Muestra = {
  readonly clave: string
  readonly caso: string
  readonly titulo: string
  readonly estudio: string
  readonly ediciones: ReadonlyArray<string>
  readonly resumen: CompatibilitySummary
  readonly pendientes: number
  readonly personal: Personal
}

export const diagnostico = {
  resumen: 'Portátil de ejemplo · Intel Core i5-8250U · Intel UHD 620 · RAM 8 GB · VRAM desconocida · Vulkan 1.3 · Linux Mint 21.3',
  distribucion_id: DistributionId.make(1),
}

const distro = {
  mint: { distribucion_id: diagnostico.distribucion_id, distribucion: 'Linux Mint 21.3' },
  fedora: { distribucion_id: DistributionId.make(2), distribucion: 'Fedora 40' },
  arch: { distribucion_id: DistributionId.make(3), distribucion: 'Arch Linux' },
  ubuntu: { distribucion_id: DistributionId.make(4), distribucion: 'Ubuntu 24.04' },
  pop: { distribucion_id: DistributionId.make(5), distribucion: 'Pop!_OS 22.04' },
}
const capa = {
  proton8: { version_capa_id: LayerVersionId.make(1), capa: 'Proton 8.0-5' },
  proton9: { version_capa_id: LayerVersionId.make(2), capa: 'Proton 9.0-3' },
  ge94: { version_capa_id: LayerVersionId.make(3), capa: 'GE-Proton 9-4' },
  wine9: { version_capa_id: LayerVersionId.make(4), capa: 'Wine 9.0' },
}
const sinPerfil = { perfil_id: null, perfil: null }
const dia = (iso: string) => new Date(`${iso}T12:00:00Z`)

const entorno = (e: Omit<TestedSetup, 'key' | 'recent_count'>): TestedSetup => ({
  ...e,
  recent_count: e.test_count,
  key: [e.edicion_id, e.version_juego, e.distribucion_id, e.version_capa_id, e.perfil_id ?? '-'].join('|'),
})

type Reciente = Omit<CompatibilitySummary, 'recent_count' | 'no_recent_confirmation' | 'regressions'> &
  Partial<Pick<CompatibilitySummary, 'regressions'>>

/** Every fixture test is from the last year. */
const alDia = (r: Reciente): CompatibilitySummary => ({ recent_count: r.test_count, no_recent_confirmation: false, regressions: [], ...r })

const gtaFedora = entorno({
  edicion_id: EditionId.make(1), lanzador: 'Steam', version_juego: '1.0.3258', ...distro.fedora, ...capa.proton9, ...sinPerfil,
  status: 'falla_en_ejecucion', test_count: 1, by_outcome: { falla_en_ejecucion: 1 }, last_tested: dia('2026-10-02'),
  failures: [{ code: 'lanzador', reports: 1 }], fps: [],
})
const gtaMint = entorno({
  edicion_id: EditionId.make(1), lanzador: 'Steam', version_juego: '1.0.3179', ...distro.mint, ...capa.proton8,
  perfil_id: ProfileId.make(1), perfil: 'GTAV-BAJO r2',
  status: 'funciona', test_count: 2, by_outcome: { funciona: 2 }, last_tested: dia('2026-09-28'), failures: [],
  fps: [
    { resolution: '1280x720', quality: 'Bajo', average: 54, samples: 1 },
    { resolution: '1920x1080', quality: 'Bajo', average: 41.5, samples: 1 },
  ],
})
const gtaArch = entorno({
  edicion_id: EditionId.make(2), lanzador: 'Epic (Heroic)', version_juego: '1.0.3179', ...distro.arch, ...capa.ge94, ...sinPerfil,
  status: 'funciona_con_ajustes', test_count: 1, by_outcome: { funciona_con_ajustes: 1 }, last_tested: dia('2026-09-02'),
  failures: [], fps: [{ resolution: '1920x1080', quality: 'Medio', average: 60, samples: 1 }],
})

const gta: Muestra = {
  clave: 'gta5',
  caso: 'Resultados variables con 3 entornos y «En tu distribución»',
  titulo: 'Grand Theft Auto V',
  estudio: 'Rockstar Games',
  ediciones: ['Steam', 'Epic (Heroic)'],
  resumen: alDia({
    status: 'resultados_variables', test_count: 4, last_tested: dia('2026-10-02'),
    setups: [gtaFedora, gtaMint, gtaArch], failures: [{ code: 'lanzador', reports: 1 }],
    regressions: [
      { edicion_id: EditionId.make(1), lanzador: 'Steam', fecha_prueba: dia('2026-10-02'), version_juego: '1.0.3258', capa: 'Proton 9.0-3', resultado: 'falla_en_ejecucion' },
    ],
  }),
  pendientes: 1,
  personal: {
    ruta: { status: 'con_ruta', path: 'dxvk_2' }, nivel_x86_min: null, orientativa: false,
    en_mi_distribucion: {
      nombre: 'Linux Mint 21.3',
      resumen: alDia({ status: 'funciona', test_count: 2, last_tested: dia('2026-09-28'), setups: [gtaMint], failures: [] }),
    },
    perfil: {
      titulo: 'GTAV-BAJO', revision: 2,
      evaluacion: {
        verdict: 'cumple', advisory_only: false,
        checks: [
          { requirement: 'ram', status: 'cumple', required: '8192', detected: { value: '8192', origin: 'medido' } },
          { requirement: 'vulkan', status: 'cumple', required: '1.1', detected: { value: '1.3', origin: 'medido' } },
        ],
      },
    },
  },
}

const valArch = entorno({
  edicion_id: EditionId.make(5), lanzador: 'Riot Client', version_juego: '9.07', ...distro.arch, ...capa.ge94, ...sinPerfil,
  status: 'no_inicia', test_count: 1, by_outcome: { no_inicia: 1 }, last_tested: dia('2026-08-03'),
  failures: [{ code: 'anti_cheat', reports: 1 }], fps: [],
})
const valMint = entorno({
  edicion_id: EditionId.make(5), lanzador: 'Riot Client', version_juego: '9.07', ...distro.mint, ...capa.wine9, ...sinPerfil,
  status: 'no_inicia', test_count: 1, by_outcome: { no_inicia: 1 }, last_tested: dia('2026-07-11'),
  failures: [{ code: 'anti_cheat', reports: 1 }], fps: [],
})

const valorant: Muestra = {
  clave: 'valorant',
  caso: 'No inicia, sin perfil aprobado',
  titulo: 'Valorant',
  estudio: 'Riot Games',
  ediciones: ['Riot Client'],
  resumen: alDia({
    status: 'no_inicia', test_count: 2, last_tested: dia('2026-08-03'),
    setups: [valArch, valMint], failures: [{ code: 'anti_cheat', reports: 2 }],
  }),
  pendientes: 0,
  personal: {
    ruta: { status: 'con_ruta', path: 'dxvk_2' }, nivel_x86_min: null, orientativa: false,
    en_mi_distribucion: {
      nombre: 'Linux Mint 21.3',
      resumen: alDia({ status: 'no_inicia', test_count: 1, last_tested: dia('2026-07-11'), setups: [valMint], failures: [{ code: 'anti_cheat', reports: 1 }] }),
    },
    perfil: null,
  },
}

const ets2: Muestra = {
  clave: 'ets2',
  caso: 'Solo reportes pendientes: sin evidencia verificada',
  titulo: 'Euro Truck Simulator 2',
  estudio: 'SCS Software',
  ediciones: ['Steam'],
  resumen: alDia({ status: 'sin_evidencia', test_count: 0, last_tested: null, setups: [], failures: [] }),
  pendientes: 2,
  personal: {
    ruta: { status: 'con_ruta', path: 'dxvk_2' }, nivel_x86_min: null, orientativa: false,
    en_mi_distribucion: {
      nombre: 'Linux Mint 21.3',
      resumen: alDia({ status: 'sin_evidencia', test_count: 0, last_tested: null, setups: [], failures: [] }),
    },
    perfil: null,
  },
}

const erUbuntu = entorno({
  edicion_id: EditionId.make(4), lanzador: 'Steam', version_juego: '1.12', ...distro.ubuntu, ...capa.proton9,
  perfil_id: ProfileId.make(3), perfil: 'ER-BASE r3',
  status: 'funciona_con_ajustes', test_count: 1, by_outcome: { funciona_con_ajustes: 1 }, last_tested: dia('2026-09-30'),
  failures: [], fps: [],
})
const erMint = entorno({
  edicion_id: EditionId.make(4), lanzador: 'Steam', version_juego: '1.12', ...distro.mint, ...capa.proton9,
  perfil_id: ProfileId.make(3), perfil: 'ER-BASE r3',
  status: 'funciona_con_ajustes', test_count: 1, by_outcome: { funciona_con_ajustes: 1 }, last_tested: dia('2026-09-21'),
  failures: [], fps: [{ resolution: '1600x900', quality: 'Bajo + FSR', average: 38, samples: 1 }],
})

const eldenRing: Muestra = {
  clave: 'elden-ring',
  caso: 'Funciona con ajustes; tu equipo no cumple la RAM',
  titulo: 'Elden Ring',
  estudio: 'FromSoftware',
  ediciones: ['Steam'],
  resumen: alDia({ status: 'funciona_con_ajustes', test_count: 2, last_tested: dia('2026-09-30'), setups: [erUbuntu, erMint], failures: [] }),
  pendientes: 0,
  personal: {
    ruta: { status: 'con_ruta', path: 'vkd3d_proton' }, nivel_x86_min: null, orientativa: false,
    en_mi_distribucion: {
      nombre: 'Linux Mint 21.3',
      resumen: alDia({ status: 'funciona_con_ajustes', test_count: 1, last_tested: dia('2026-09-21'), setups: [erMint], failures: [] }),
    },
    perfil: {
      titulo: 'ER-BASE', revision: 3,
      evaluacion: {
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

const twPop = entorno({
  edicion_id: EditionId.make(7), lanzador: 'GOG (Heroic)', version_juego: '4.04', ...distro.pop, ...capa.ge94, ...sinPerfil,
  status: 'funciona', test_count: 1, by_outcome: { funciona: 1 }, last_tested: dia('2026-09-10'), failures: [], fps: [],
})
const twMint = entorno({
  edicion_id: EditionId.make(6), lanzador: 'Steam', version_juego: '4.04', ...distro.mint, ...capa.proton8,
  perfil_id: ProfileId.make(2), perfil: 'TW3-IGPU r1',
  status: 'funciona', test_count: 1, by_outcome: { funciona: 1 }, last_tested: dia('2026-08-20'), failures: [],
  fps: [{ resolution: '1280x720', quality: 'Bajo', average: 31, samples: 1 }],
})

const witcher: Muestra = {
  clave: 'witcher3',
  caso: 'Evaluación «Información insuficiente»: VRAM desconocida',
  titulo: 'The Witcher 3: Wild Hunt',
  estudio: 'CD PROJEKT RED',
  ediciones: ['Steam', 'GOG (Heroic)'],
  resumen: alDia({ status: 'funciona', test_count: 2, last_tested: dia('2026-09-10'), setups: [twPop, twMint], failures: [] }),
  pendientes: 0,
  personal: {
    ruta: { status: 'con_ruta', path: 'dxvk_2' }, nivel_x86_min: null, orientativa: false,
    en_mi_distribucion: {
      nombre: 'Linux Mint 21.3',
      resumen: alDia({ status: 'funciona', test_count: 1, last_tested: dia('2026-08-20'), setups: [twMint], failures: [] }),
    },
    perfil: {
      titulo: 'TW3-IGPU', revision: 1,
      evaluacion: {
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

export const muestras: ReadonlyArray<Muestra> = [gta, valorant, ets2, eldenRing, witcher]

export const parametrosLanzamiento = { etiqueta: 'Parámetros de lanzamiento · GTAV-BAJO r2', texto: 'PROTON_USE_WINED3D=0 DXVK_ASYNC=1 %command%' }
