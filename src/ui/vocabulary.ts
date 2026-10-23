import type { CompatibilityStatus } from '../domain/compatibility.ts'
import type { AntiCheatStatus, GraphicsApi, Outcome, ProtonVariant } from '../domain/literals.ts'
import type { RequirementCheck, DataOrigin, OperatingSystem, VulkanSupport, RequirementsVerdict } from '../domain/evaluation.ts'
import type { GpuWarning, LinuxDriver, GpuFamily, D3dPath } from '../domain/gpu.ts'
import type { InvalidPayload, SteamUnavailable } from '../domain/errors.ts'
import type { GameRequestStatus } from '../domain/game-requests.ts'
import type { Blocker, ReviewStatus, Role } from '../domain/review.ts'
import type { GuideStatus, GuideType } from '../domain/guides.ts'
import type { Device, SecureBoot, X86Level, Tpm } from '../domain/platform.ts'
import type { RenderPath, AntiCheatRiskPath, Requirement, GamePath } from '../domain/graphics-path.ts'
import type { ObjectionCode, Objection, DistroVerdict } from '../domain/distros.ts'
import type { NotExportableReason, SkipReason, NoReportReason } from '../domain/upstream.ts'

export type Tone = 'verde' | 'amarillo' | 'rojo' | 'gris' | 'morado' | 'azul'
export type Label = { readonly text: string; readonly tone: Tone; readonly icon: string }

export const compatibilityStatus = {
  sin_evidencia: { text: 'Sin evidencia verificada', tone: 'gris', icon: '?' },
  funciona: { text: 'Funciona', tone: 'verde', icon: '✓' },
  funciona_con_ajustes: { text: 'Funciona con ajustes', tone: 'amarillo', icon: '⚙' },
  no_inicia: { text: 'No inicia', tone: 'rojo', icon: '✕' },
  falla_en_ejecucion: { text: 'Falla en ejecución', tone: 'rojo', icon: '✕' },
  resultados_variables: { text: 'Resultados variables', tone: 'morado', icon: '◐' },
} as const satisfies Record<CompatibilityStatus, Label>

export const outcome = {
  funciona: compatibilityStatus.funciona,
  funciona_con_ajustes: compatibilityStatus.funciona_con_ajustes,
  no_inicia: compatibilityStatus.no_inicia,
  falla_en_ejecucion: compatibilityStatus.falla_en_ejecucion,
} as const satisfies Record<Outcome, Label>

export const requirementsVerdict = {
  no_cumple: { text: 'No cumple', tone: 'rojo', icon: '✕' },
  informacion_insuficiente: { text: 'Información insuficiente', tone: 'gris', icon: '?' },
  cumple: { text: 'Cumple las condiciones conocidas', tone: 'verde', icon: '✓' },
} as const satisfies Record<RequirementsVerdict, Label>

export const checkStatus = {
  cumple: { text: 'Cumple', tone: 'verde', icon: '✓' },
  no_cumple: { text: 'No cumple', tone: 'rojo', icon: '✕' },
  desconocido: { text: 'Desconocido', tone: 'amarillo', icon: '?' },
} as const satisfies Record<RequirementCheck['status'], Label>

export const requirement = { ram: 'RAM', vram: 'VRAM', vulkan: 'Vulkan' } as const satisfies Record<RequirementCheck['requirement'], string>

export const vulkanSupport = {
  si: 'Compatible',
  no: 'Sin soporte',
  desconocido: 'Desconocido',
} as const satisfies Record<VulkanSupport, string>

export const operatingSystem = { Linux: 'Linux', Windows: 'Windows' } as const satisfies Record<OperatingSystem, string>

export const graphicsApi = {
  d3d9: 'Direct3D 9',
  d3d10: 'Direct3D 10',
  d3d11: 'Direct3D 11',
  d3d12: 'Direct3D 12',
  vulkan: 'Vulkan',
  opengl: 'OpenGL',
} as const satisfies Record<GraphicsApi, string>

export const secureBoot = {
  activo: 'Activado',
  inactivo: 'Desactivado',
  bios: 'Sin UEFI (BIOS)',
} as const satisfies Record<SecureBoot, string>

export const tpm = { '2.0': 'TPM 2.0', '1.2': 'TPM 1.2', no_detectado: 'Sin TPM' } as const satisfies Record<Tpm, string>

export const device = { steam_deck_lcd: 'Steam Deck (LCD)', steam_deck_oled: 'Steam Deck (OLED)' } as const satisfies Record<Device, string>

/** A level as a requirement, named by the instruction set games actually ask for. */
export const x86Level = {
  v1: 'x86-64-v1',
  v2: 'x86-64-v2 (SSE4.2)',
  v3: 'x86-64-v3 (AVX2)',
  v4: 'x86-64-v4',
} as const satisfies Record<X86Level, string>

export const reviewStatus = {
  pendiente: { text: 'Pendiente de revisión', tone: 'gris', icon: '…' },
  aprobado: { text: 'Aprobado', tone: 'verde', icon: '✓' },
  rechazado: { text: 'Rechazado', tone: 'rojo', icon: '✕' },
  retirado: { text: 'Retirado', tone: 'gris', icon: '–' },
} as const satisfies Record<ReviewStatus, Label>

export const role = { usuario: 'Usuario', revisor: 'Revisor', administrador: 'Administrador' } as const satisfies Record<Role, string>

export const blocker = {
  perfil_sin_reporte_funcional_aprobado: 'Falta un reporte aprobado que use este perfil con resultado funcional.',
  solucion_fallo_origen_no_aprobado: 'El reporte con el fallo de origen aún no está aprobado.',
  solucion_perfil_no_aprobado: 'El perfil que recomienda la solución aún no está aprobado.',
  reporte_incomparable: 'El perfil no coincide con el entorno del diagnóstico.',
} as const satisfies Record<Blocker, string>

type FailureLabel = Omit<Label, 'icon'>
const failureTypes: Readonly<Record<string, FailureLabel>> = {
  anti_cheat: { text: 'Anti-cheat', tone: 'rojo' },
  drm: { text: 'DRM', tone: 'rojo' },
  lanzador: { text: 'Lanzador', tone: 'amarillo' },
  controlador: { text: 'Controlador', tone: 'amarillo' },
  dependencia: { text: 'Dependencia', tone: 'amarillo' },
  rendimiento: { text: 'Rendimiento', tone: 'amarillo' },
  otro: { text: 'Otro', tone: 'amarillo' },
}

export const failureType = (code: string): FailureLabel => failureTypes[code] ?? { text: code.replaceAll('_', ' '), tone: 'amarillo' }

export const guideType = {
  eleccion_distribucion: 'Elegir distribución',
  instalacion: 'Instalación',
  arranque_dual: 'Arranque dual',
} as const satisfies Record<GuideType, string>

export const guideStatus = {
  borrador: 'Borrador',
  publicada: 'Publicada',
  archivada: 'Archivada',
} as const satisfies Record<GuideStatus, string>

export const payloadReason = {
  ilegible: 'No pudimos leer ese texto. Copia toda la salida del detector, o la dirección completa que abrió tu navegador.',
  version_esquema: 'Ese diagnóstico viene de otra versión del detector. Descárgalo de nuevo y vuelve a ejecutarlo.',
  campo_invalido: 'Al diagnóstico le falta un dato o trae uno que no reconocemos.',
} as const satisfies Record<InvalidPayload['reason'], string>

export const statusMeaning = {
  sin_evidencia: 'Ningún revisor ha aprobado todavía una prueba de este juego.',
  funciona: 'Todas las pruebas aprobadas funcionan sin ajustes.',
  funciona_con_ajustes: 'Todas las pruebas aprobadas funcionan después de algún ajuste o perfil.',
  no_inicia: 'En todas las pruebas aprobadas el juego no llega a iniciar, por ejemplo por un anti-cheat a nivel de kernel.',
  falla_en_ejecucion: 'En todas las pruebas aprobadas el juego inicia, pero falla durante la partida.',
  resultados_variables: 'Las pruebas aprobadas dan resultados distintos. La ficha muestra cada entorno.',
} as const satisfies Record<CompatibilityStatus, string>

export const vulkanOrigin = { medido: 'Detectado', proyectado: 'Proyectado' } as const satisfies Record<DataOrigin, string>

export const gpuFamily = {
  intel_gen5_o_anterior: 'Intel GMA o HD de primera generación (Ironlake o anterior)',
  intel_gen6: 'Intel HD 2000/3000 (Sandy Bridge)',
  intel_gen7: 'Intel HD 2500/4000 (Ivy Bridge, Bay Trail)',
  intel_gen7_5: 'Intel HD 4200–5200, Iris 5100 (Haswell)',
  intel_gen8: 'Intel HD 5300–6300, Iris 6100 (Broadwell, Braswell)',
  intel_gen9_o_posterior: 'Intel HD/UHD 500 en adelante, Iris Xe, Arc (Skylake o posterior)',
  amd_terascale_o_anterior: 'AMD Radeon HD 6000 o anterior (TeraScale)',
  amd_gcn1: 'AMD Radeon HD 7000, R7/R9 200 (GCN 1)',
  amd_gcn2: 'AMD Radeon R7 260, R9 290, APU Kaveri (GCN 2)',
  amd_gcn3_o_posterior: 'AMD Radeon R9 285, RX 400 en adelante (GCN 3 o posterior)',
  nvidia_tesla_o_anterior: 'NVIDIA GeForce 300 o anterior (Tesla)',
  nvidia_fermi: 'NVIDIA GeForce 400/500 (Fermi)',
  nvidia_kepler: 'NVIDIA GeForce 600/700 (Kepler)',
  nvidia_maxwell_a_volta: 'NVIDIA GeForce GTX 750 a 10 (Maxwell, Pascal, Volta)',
  nvidia_turing_o_posterior: 'NVIDIA GeForce GTX 16, RTX (Turing o posterior)',
} as const satisfies Record<GpuFamily, string>

export const linuxDriver = {
  i915: 'i915 (Intel, incluido en Linux)',
  radeon: 'radeon (AMD antiguo, incluido en Linux)',
  amdgpu: 'amdgpu (AMD, incluido en Linux)',
  nouveau: 'nouveau (libre, incluido en Linux; Vulkan con NVK)',
  nvidia_580xx: 'NVIDIA 580xx (rama heredada del controlador propietario)',
  nvidia: 'NVIDIA (controlador propietario actual)',
} as const satisfies Record<LinuxDriver, string>

export type D3dPathLabel = { readonly text: string; readonly detail: string | null; readonly option: string | null }

export const d3dPath = {
  dxvk: { text: 'DXVK con Proton', detail: null, option: null },
  dxvk_2: { text: 'DXVK 2.x', detail: 'Si un Proton reciente no abre el juego, prueba uno con DXVK 2.x.', option: null },
  dxvk_sarek: { text: 'DXVK-Sarek con Proton-CachyOS', detail: 'No es seguro con anti-cheat.', option: 'PROTON_DXVK_SAREK=1 %command%' },
  wined3d: { text: 'WineD3D sobre OpenGL', detail: 'Solo DirectX 9–11, más lento.', option: 'PROTON_USE_WINED3D=1 %command%' },
} as const satisfies Record<D3dPath, D3dPathLabel>

export const gpuWarning = {
  gcn_usar_amdgpu:
    'Tu GPU tiene Vulkan solo con el controlador amdgpu. Es el predeterminado desde Linux 6.19; en un kernel anterior agrega radeon.si_support=0 amdgpu.si_support=1 (o radeon.cik_support=0 amdgpu.cik_support=1) a la línea de arranque.',
  kepler_470_fin:
    'El controlador NVIDIA 470 ya no compila en kernels recientes. Usa nouveau con NVK (Mesa 25.2 o más reciente), que da Vulkan 1.2.',
  fijar_nvidia_580xx:
    'NVIDIA dejó de actualizar esta GPU después de la rama 580. Instala el paquete 580xx de tu distribución y fíjalo para que una actualización no lo cambie.',
  nvidia_sin_controlador: 'NVIDIA ya no tiene controlador para esta GPU en kernels actuales. nouveau la hace funcionar, pero sin Vulkan.',
  hasvk_incompleto: 'El Vulkan de Intel para esta generación (hasvk) está incompleto; los juegos DirectX irán por WineD3D.',
  vulkan_sin_verificar: 'Nadie ha medido todavía el Vulkan de esta generación en hardware real; por eso mostramos un rango.',
  vulkan_no_detectado:
    'Tu equipo no detectó Vulkan, pero tu GPU lo tiene: instala los controladores Vulkan de tu distribución (por ejemplo, mesa-vulkan-drivers).',
} as const satisfies Record<GpuWarning, string>

export type RenderPathLabel = {
  readonly name: string
  readonly sentence: string
  readonly tone: Tone
  readonly note: string | null
  readonly option: string | null
}

/** The type demands a warning on every path that is unsafe with online anti-cheat. */
export const renderPath = {
  dxvk: { name: 'DXVK', sentence: 'Puede correr con DXVK.', tone: 'verde', note: null, option: null },
  dxvk_2: { name: 'DXVK 2.x', sentence: 'Puede correr con DXVK 2.x.', tone: 'verde', note: d3dPath.dxvk_2.detail, option: null },
  vkd3d_proton: { name: 'VKD3D-Proton', sentence: 'Puede correr con VKD3D-Proton, que traduce DirectX 12 a Vulkan.', tone: 'verde', note: null, option: null },
  vulkan: { name: 'Vulkan', sentence: 'Puede correr con Vulkan, sin traducir DirectX.', tone: 'verde', note: null, option: null },
  opengl: { name: 'OpenGL', sentence: 'Puede correr con OpenGL, sin traducir DirectX.', tone: 'verde', note: null, option: null },
  dxvk_sarek: {
    name: 'DXVK-Sarek',
    sentence: 'Puede correr con DXVK-Sarek en Proton-CachyOS.',
    tone: 'amarillo',
    note: 'No lo uses en juegos en línea con anti-trampas: compila los sombreadores de una forma que el anti-trampas puede marcar.',
    option: d3dPath.dxvk_sarek.option,
  },
  wined3d: { name: 'WineD3D', sentence: 'Solo con WineD3D: funciona, pero lento.', tone: 'amarillo', note: null, option: d3dPath.wined3d.option },
} as const satisfies Record<RenderPath, RenderPathLabel> & Record<AntiCheatRiskPath, { readonly note: string }>

export const gamePathLabel = (r: GamePath): Label => {
  switch (r.status) {
    case 'con_ruta':
      return { text: renderPath[r.path].name, tone: renderPath[r.path].tone, icon: '✓' }
    case 'sin_ruta':
      return { text: 'No puede correr', tone: 'rojo', icon: '✕' }
    case 'sin_datos':
      return { text: 'Faltan datos', tone: 'gris', icon: '?' }
    case 'sin_apis':
      return { text: 'APIs sin declarar', tone: 'gris', icon: '?' }
  }
}

const missingData = {
  grafica: 'Falta saber hasta qué versión de Vulkan llega tu tarjeta gráfica: en Linux, instala vulkan-tools y vuelve a ejecutar el detector.',
  cpu: 'Falta el nivel x86-64 de tu procesador: lo mide la versión actual del detector de Linux.',
} as const satisfies Record<Requirement, string>

export const gamePathSentences = (r: GamePath, minX86Level: X86Level | null): ReadonlyArray<string> => {
  switch (r.status) {
    case 'con_ruta':
      return [renderPath[r.path].sentence]
    case 'sin_ruta':
      return [
        r.reason === 'grafica'
          ? 'Tu tarjeta gráfica no tiene una ruta para las APIs de este juego.'
          : `Tu procesador no llega al nivel ${minX86Level === null ? 'x86-64' : x86Level[minX86Level]} que pide.`,
      ]
    case 'sin_datos':
      return [r.at_least === null ? 'Todavía no sabemos si puede correr.' : `Al menos con ${renderPath[r.at_least].name}.`, ...r.missing.map((f) => missingData[f])]
    case 'sin_apis':
      return ['APIs gráficas sin declarar: no podemos calcular una ruta.']
  }
}

export const distroVerdict = {
  sin_objeciones: { text: 'Sin objeciones', tone: 'verde', icon: '✓' },
  con_ajustes: { text: 'Con ajustes', tone: 'amarillo', icon: '⚙' },
  descartada: { text: 'Descartadas', tone: 'rojo', icon: '✕' },
} as const satisfies Record<DistroVerdict, Label>

const objections: { readonly [K in ObjectionCode]: (o: Extract<Objection, { readonly code: K }>) => string } = {
  arquitectura: (o) => `Steam y Proton necesitan un procesador x86_64; el tuyo es ${o.has}.`,
  kepler_sin_soporte: () => 'No da soporte a las NVIDIA Kepler (GeForce 600/700).',
  kepler_470: (o) =>
    o.kernel === 'kernel_6_8'
      ? 'Tu NVIDIA Kepler: quédate en su kernel 6.8 para seguir con el controlador 470, o usa NVK (Mesa 25.2 o más reciente).'
      : 'Tu NVIDIA Kepler: el controlador 470 no compila en kernels posteriores a 6.8. Usa NVK y comprueba que traiga Mesa 25.2 o más reciente.',
  rama_580: (o) =>
    ({
      paquete_580xx: 'Tu NVIDIA necesita la rama 580 y Arch ya va en la 590: instala nvidia-580xx-dkms.',
      imagen_nvidia: 'Tu NVIDIA necesita la rama 580: instala la imagen bazzite-nvidia.',
      desconocido: 'Tu NVIDIA necesita la rama 580, la última para su generación. Comprueba que esta distribución la ofrezca y fíjala.',
    })[o.via],
  gcn_amdgpu: (o) =>
    o.via === 'kernel_hwe'
      ? 'Tu AMD GCN 1/2 tiene Vulkan solo con amdgpu. Usa el kernel HWE (7.0), donde ya es el predeterminado; con el kernel 6.8 agrega radeon.si_support=0 radeon.cik_support=0 amdgpu.si_support=1 amdgpu.cik_support=1.'
      : 'Tu AMD GCN 1/2 tiene Vulkan solo con amdgpu, predeterminado desde Linux 6.19. Comprueba el kernel; si es anterior, agrega radeon.si_support=0 radeon.cik_support=0 amdgpu.si_support=1 amdgpu.cik_support=1.',
  gpu_desconocida: () => 'No reconocemos tu tarjeta gráfica, así que no pudimos revisar sus controladores aquí.',
}

export const objection = <K extends ObjectionCode>(o: Extract<Objection, { readonly code: K }>): string => objections[o.code](o)

export const protonVariant = {
  official: 'Proton oficial',
  experimental: 'Proton Experimental',
  ge: 'GE-Proton',
  native: 'Versión nativa de Linux',
  older: 'Proton (versión antigua)',
} as const satisfies Record<ProtonVariant, string>

/** AreWeAntiCheatYet's statuses, with what the list means by each one. */
export const antiCheatStatus = {
  Supported: {
    text: 'Anti-cheat soportado',
    tone: 'verde',
    icon: '✓',
    meaning: 'El estudio habilitó el anti-cheat en Linux, o el anti-cheat funciona con Wine o Proton sin cambios.',
  },
  Running: {
    text: 'Anti-cheat funciona',
    tone: 'amarillo',
    icon: '⚙',
    meaning: 'Se puede jugar en línea en Linux, aunque a veces hacen falta ajustes. Nada de esto evade el anti-cheat.',
  },
  Planned: {
    text: 'Soporte anunciado',
    tone: 'gris',
    icon: '…',
    meaning: 'El estudio anunció que habilitará el anti-cheat en Linux o que sacará una versión nativa.',
  },
  Broken: { text: 'Anti-cheat roto', tone: 'rojo', icon: '✕', meaning: 'El anti-cheat no deja jugar en línea en Linux.' },
  Denied: {
    text: 'Anti-cheat denegado',
    tone: 'rojo',
    icon: '✕',
    meaning: 'El estudio dijo que no habilitará el anti-cheat en Linux, o descartó dar soporte a Linux.',
  },
} as const satisfies Record<AntiCheatStatus, Label & { readonly meaning: string }>

export const skipReason = {
  programa_envoltorio: 'es un programa que envuelve el juego, no un arreglo',
  sintaxis_shell: 'usa sintaxis de la terminal (comillas, $, ; …) que un archivo de arreglo no repite',
  opcion_protonfixes: 'ya es una opción de protonfixes; se queda en las opciones de lanzamiento',
  ajuste_personal: 'es un ajuste de depuración o de gusto personal, no un arreglo',
  forma_invalida: 'tiene una forma que el archivo de arreglo no admite',
  paquete_del_sistema: 'es un paquete del sistema; se instala fuera del juego',
  dependencia_opcional: 'es opcional en el perfil; el archivo la volvería obligatoria',
} as const satisfies Record<SkipReason, string>

export const notExportableReason = {
  no_es_steam: 'Solo los perfiles de juegos de Steam se convierten en un arreglo de umu-protonfixes.',
  sin_appid: 'Esta edición de Steam no tiene AppID registrado, así que no hay archivo de arreglo.',
  capa_sin_protonfixes: 'Wine y los juegos nativos no usan umu-protonfixes.',
} as const satisfies Record<NotExportableReason, string>

export const noReportReason = {
  no_es_steam: 'Valve solo atiende informes de juegos de Steam.',
  sin_appid: 'La edición de Steam de este juego no tiene AppID registrado.',
  capa_no_valve: 'Valve solo atiende informes de su propio Proton; GE-Proton y Wine tienen sus propios canales.',
  funciona: 'El juego funcionó sin ajustes: no hay nada que informar a Valve.',
} as const satisfies Record<NoReportReason, string>

export const gameRequestStatus = {
  abierto: { text: 'Abierto', tone: 'azul', icon: '…' },
  cumplido: { text: 'Ya está en el catálogo', tone: 'verde', icon: '✓' },
  rechazado: { text: 'Rechazado', tone: 'rojo', icon: '✕' },
} as const satisfies Record<GameRequestStatus, Label>

export const steamUnavailable = {
  no_encontrado: 'Steam no tiene ese App ID. Revisa el enlace, o rellena el formulario a mano.',
  no_es_juego: 'Ese App ID es de un DLC, una demo o un programa. Usa el del juego base, o rellena el formulario a mano.',
  sin_respuesta: 'Steam no respondió a tiempo. Intenta de nuevo, o rellena el formulario a mano.',
} as const satisfies Record<SteamUnavailable['reason'], string>
