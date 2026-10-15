import type { EntornoProbado, ResumenCompatibilidad } from '../../dominio/compatibilidad.ts'
import { DistribucionId, EdicionId, PerfilId, VersionCapaId } from '../../dominio/ids.ts'
import type { Personal } from '../compatibilidad/VeredictoParaMi.tsx'

export type Muestra = {
  readonly clave: string
  readonly caso: string
  readonly titulo: string
  readonly estudio: string
  readonly ediciones: ReadonlyArray<string>
  readonly resumen: ResumenCompatibilidad
  readonly pendientes: number
  readonly personal: Personal
}

export const diagnostico = {
  resumen: 'Portátil de ejemplo · Intel Core i5-8250U · Intel UHD 620 · RAM 8 GB · VRAM desconocida · Vulkan 1.3 · Linux Mint 21.3',
  distribucion_id: DistribucionId.make(1),
}

const distro = {
  mint: { distribucion_id: diagnostico.distribucion_id, distribucion: 'Linux Mint 21.3' },
  fedora: { distribucion_id: DistribucionId.make(2), distribucion: 'Fedora 40' },
  arch: { distribucion_id: DistribucionId.make(3), distribucion: 'Arch Linux' },
  ubuntu: { distribucion_id: DistribucionId.make(4), distribucion: 'Ubuntu 24.04' },
  pop: { distribucion_id: DistribucionId.make(5), distribucion: 'Pop!_OS 22.04' },
}
const capa = {
  proton8: { version_capa_id: VersionCapaId.make(1), capa: 'Proton 8.0-5' },
  proton9: { version_capa_id: VersionCapaId.make(2), capa: 'Proton 9.0-3' },
  ge94: { version_capa_id: VersionCapaId.make(3), capa: 'GE-Proton 9-4' },
  wine9: { version_capa_id: VersionCapaId.make(4), capa: 'Wine 9.0' },
}
const sinPerfil = { perfil_id: null, perfil: null }
const dia = (iso: string) => new Date(`${iso}T12:00:00Z`)

const entorno = (e: Omit<EntornoProbado, 'clave' | 'vigentes'>): EntornoProbado => ({
  ...e,
  vigentes: e.pruebas,
  clave: [e.edicion_id, e.version_juego, e.distribucion_id, e.version_capa_id, e.perfil_id ?? '-'].join('|'),
})

type Reciente = Omit<ResumenCompatibilidad, 'vigentes' | 'sin_confirmacion_reciente' | 'regresiones'> &
  Partial<Pick<ResumenCompatibilidad, 'regresiones'>>

/** Every fixture test is from the last year. */
const alDia = (r: Reciente): ResumenCompatibilidad => ({ vigentes: r.pruebas, sin_confirmacion_reciente: false, regresiones: [], ...r })

const gtaFedora = entorno({
  edicion_id: EdicionId.make(1), lanzador: 'Steam', version_juego: '1.0.3258', ...distro.fedora, ...capa.proton9, ...sinPerfil,
  estado: 'falla_en_ejecucion', pruebas: 1, por_resultado: { falla_en_ejecucion: 1 }, ultima_prueba: dia('2026-10-02'),
  fallos: [{ codigo: 'lanzador', reportes: 1 }], fps: [],
})
const gtaMint = entorno({
  edicion_id: EdicionId.make(1), lanzador: 'Steam', version_juego: '1.0.3179', ...distro.mint, ...capa.proton8,
  perfil_id: PerfilId.make(1), perfil: 'GTAV-BAJO r2',
  estado: 'funciona', pruebas: 2, por_resultado: { funciona: 2 }, ultima_prueba: dia('2026-09-28'), fallos: [],
  fps: [
    { resolucion: '1280x720', calidad: 'Bajo', promedio: 54, mediciones: 1 },
    { resolucion: '1920x1080', calidad: 'Bajo', promedio: 41.5, mediciones: 1 },
  ],
})
const gtaArch = entorno({
  edicion_id: EdicionId.make(2), lanzador: 'Epic (Heroic)', version_juego: '1.0.3179', ...distro.arch, ...capa.ge94, ...sinPerfil,
  estado: 'funciona_con_ajustes', pruebas: 1, por_resultado: { funciona_con_ajustes: 1 }, ultima_prueba: dia('2026-09-02'),
  fallos: [], fps: [{ resolucion: '1920x1080', calidad: 'Medio', promedio: 60, mediciones: 1 }],
})

const gta: Muestra = {
  clave: 'gta5',
  caso: 'Resultados variables con 3 entornos y «En tu distribución»',
  titulo: 'Grand Theft Auto V',
  estudio: 'Rockstar Games',
  ediciones: ['Steam', 'Epic (Heroic)'],
  resumen: alDia({
    estado: 'resultados_variables', pruebas: 4, ultima_prueba: dia('2026-10-02'),
    entornos: [gtaFedora, gtaMint, gtaArch], fallos: [{ codigo: 'lanzador', reportes: 1 }],
    regresiones: [
      { edicion_id: EdicionId.make(1), lanzador: 'Steam', fecha_prueba: dia('2026-10-02'), version_juego: '1.0.3258', capa: 'Proton 9.0-3', resultado: 'falla_en_ejecucion' },
    ],
  }),
  pendientes: 1,
  personal: {
    ruta: { estado: 'con_ruta', camino: 'dxvk_2' }, nivel_x86_min: null, orientativa: false,
    en_mi_distribucion: {
      nombre: 'Linux Mint 21.3',
      resumen: alDia({ estado: 'funciona', pruebas: 2, ultima_prueba: dia('2026-09-28'), entornos: [gtaMint], fallos: [] }),
    },
    perfil: {
      titulo: 'GTAV-BAJO', revision: 2,
      evaluacion: {
        veredicto: 'cumple', solo_orientativa: false,
        comprobaciones: [
          { requisito: 'ram', estado: 'cumple', exigido: '8192', detectado: { valor: '8192', origen: 'medido' } },
          { requisito: 'vulkan', estado: 'cumple', exigido: '1.1', detectado: { valor: '1.3', origen: 'medido' } },
        ],
      },
    },
  },
}

const valArch = entorno({
  edicion_id: EdicionId.make(5), lanzador: 'Riot Client', version_juego: '9.07', ...distro.arch, ...capa.ge94, ...sinPerfil,
  estado: 'no_inicia', pruebas: 1, por_resultado: { no_inicia: 1 }, ultima_prueba: dia('2026-08-03'),
  fallos: [{ codigo: 'anti_cheat', reportes: 1 }], fps: [],
})
const valMint = entorno({
  edicion_id: EdicionId.make(5), lanzador: 'Riot Client', version_juego: '9.07', ...distro.mint, ...capa.wine9, ...sinPerfil,
  estado: 'no_inicia', pruebas: 1, por_resultado: { no_inicia: 1 }, ultima_prueba: dia('2026-07-11'),
  fallos: [{ codigo: 'anti_cheat', reportes: 1 }], fps: [],
})

const valorant: Muestra = {
  clave: 'valorant',
  caso: 'No inicia, sin perfil aprobado',
  titulo: 'Valorant',
  estudio: 'Riot Games',
  ediciones: ['Riot Client'],
  resumen: alDia({
    estado: 'no_inicia', pruebas: 2, ultima_prueba: dia('2026-08-03'),
    entornos: [valArch, valMint], fallos: [{ codigo: 'anti_cheat', reportes: 2 }],
  }),
  pendientes: 0,
  personal: {
    ruta: { estado: 'con_ruta', camino: 'dxvk_2' }, nivel_x86_min: null, orientativa: false,
    en_mi_distribucion: {
      nombre: 'Linux Mint 21.3',
      resumen: alDia({ estado: 'no_inicia', pruebas: 1, ultima_prueba: dia('2026-07-11'), entornos: [valMint], fallos: [{ codigo: 'anti_cheat', reportes: 1 }] }),
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
  resumen: alDia({ estado: 'sin_evidencia', pruebas: 0, ultima_prueba: null, entornos: [], fallos: [] }),
  pendientes: 2,
  personal: {
    ruta: { estado: 'con_ruta', camino: 'dxvk_2' }, nivel_x86_min: null, orientativa: false,
    en_mi_distribucion: {
      nombre: 'Linux Mint 21.3',
      resumen: alDia({ estado: 'sin_evidencia', pruebas: 0, ultima_prueba: null, entornos: [], fallos: [] }),
    },
    perfil: null,
  },
}

const erUbuntu = entorno({
  edicion_id: EdicionId.make(4), lanzador: 'Steam', version_juego: '1.12', ...distro.ubuntu, ...capa.proton9,
  perfil_id: PerfilId.make(3), perfil: 'ER-BASE r3',
  estado: 'funciona_con_ajustes', pruebas: 1, por_resultado: { funciona_con_ajustes: 1 }, ultima_prueba: dia('2026-09-30'),
  fallos: [], fps: [],
})
const erMint = entorno({
  edicion_id: EdicionId.make(4), lanzador: 'Steam', version_juego: '1.12', ...distro.mint, ...capa.proton9,
  perfil_id: PerfilId.make(3), perfil: 'ER-BASE r3',
  estado: 'funciona_con_ajustes', pruebas: 1, por_resultado: { funciona_con_ajustes: 1 }, ultima_prueba: dia('2026-09-21'),
  fallos: [], fps: [{ resolucion: '1600x900', calidad: 'Bajo + FSR', promedio: 38, mediciones: 1 }],
})

const eldenRing: Muestra = {
  clave: 'elden-ring',
  caso: 'Funciona con ajustes; tu equipo no cumple la RAM',
  titulo: 'Elden Ring',
  estudio: 'FromSoftware',
  ediciones: ['Steam'],
  resumen: alDia({ estado: 'funciona_con_ajustes', pruebas: 2, ultima_prueba: dia('2026-09-30'), entornos: [erUbuntu, erMint], fallos: [] }),
  pendientes: 0,
  personal: {
    ruta: { estado: 'con_ruta', camino: 'vkd3d_proton' }, nivel_x86_min: null, orientativa: false,
    en_mi_distribucion: {
      nombre: 'Linux Mint 21.3',
      resumen: alDia({ estado: 'funciona_con_ajustes', pruebas: 1, ultima_prueba: dia('2026-09-21'), entornos: [erMint], fallos: [] }),
    },
    perfil: {
      titulo: 'ER-BASE', revision: 3,
      evaluacion: {
        veredicto: 'no_cumple', solo_orientativa: false,
        comprobaciones: [
          { requisito: 'ram', estado: 'no_cumple', exigido: '12288', detectado: { valor: '8192', origen: 'medido' } },
          { requisito: 'vram', estado: 'desconocido', exigido: '4096', detectado: null },
          { requisito: 'vulkan', estado: 'cumple', exigido: '1.3', detectado: { valor: '1.3', origen: 'medido' } },
        ],
      },
    },
  },
}

const twPop = entorno({
  edicion_id: EdicionId.make(7), lanzador: 'GOG (Heroic)', version_juego: '4.04', ...distro.pop, ...capa.ge94, ...sinPerfil,
  estado: 'funciona', pruebas: 1, por_resultado: { funciona: 1 }, ultima_prueba: dia('2026-09-10'), fallos: [], fps: [],
})
const twMint = entorno({
  edicion_id: EdicionId.make(6), lanzador: 'Steam', version_juego: '4.04', ...distro.mint, ...capa.proton8,
  perfil_id: PerfilId.make(2), perfil: 'TW3-IGPU r1',
  estado: 'funciona', pruebas: 1, por_resultado: { funciona: 1 }, ultima_prueba: dia('2026-08-20'), fallos: [],
  fps: [{ resolucion: '1280x720', calidad: 'Bajo', promedio: 31, mediciones: 1 }],
})

const witcher: Muestra = {
  clave: 'witcher3',
  caso: 'Evaluación «Información insuficiente»: VRAM desconocida',
  titulo: 'The Witcher 3: Wild Hunt',
  estudio: 'CD PROJEKT RED',
  ediciones: ['Steam', 'GOG (Heroic)'],
  resumen: alDia({ estado: 'funciona', pruebas: 2, ultima_prueba: dia('2026-09-10'), entornos: [twPop, twMint], fallos: [] }),
  pendientes: 0,
  personal: {
    ruta: { estado: 'con_ruta', camino: 'dxvk_2' }, nivel_x86_min: null, orientativa: false,
    en_mi_distribucion: {
      nombre: 'Linux Mint 21.3',
      resumen: alDia({ estado: 'funciona', pruebas: 1, ultima_prueba: dia('2026-08-20'), entornos: [twMint], fallos: [] }),
    },
    perfil: {
      titulo: 'TW3-IGPU', revision: 1,
      evaluacion: {
        veredicto: 'informacion_insuficiente', solo_orientativa: false,
        comprobaciones: [
          { requisito: 'ram', estado: 'cumple', exigido: '6144', detectado: { valor: '8192', origen: 'medido' } },
          { requisito: 'vram', estado: 'desconocido', exigido: '2048', detectado: null },
          { requisito: 'vulkan', estado: 'cumple', exigido: '1.1', detectado: { valor: '1.3', origen: 'medido' } },
        ],
      },
    },
  },
}

export const muestras: ReadonlyArray<Muestra> = [gta, valorant, ets2, eldenRing, witcher]

export const parametrosLanzamiento = { etiqueta: 'Parámetros de lanzamiento · GTAV-BAJO r2', texto: 'PROTON_USE_WINED3D=0 DXVK_ASYNC=1 %command%' }
