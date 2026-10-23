// The words of the domain's literals (`ui/vocabulary.ts` adds tones and icons). Spanish is the source:
// `en/vocabulary.ts` must match this shape.
import type { CompatibilityStatus } from '../../../domain/compatibility.ts'
import type { AntiCheatStatus, ProtonVariant } from '../../../domain/literals.ts'
import type { RequirementCheck, DataOrigin, VulkanSupport, RequirementsVerdict } from '../../../domain/evaluation.ts'
import type { GpuWarning, LinuxDriver, GpuFamily, D3dPath } from '../../../domain/gpu.ts'
import type { InvalidPayload, SteamUnavailable } from '../../../domain/errors.ts'
import type { GameRequestStatus } from '../../../domain/game-requests.ts'
import type { Blocker, ReviewStatus, Role } from '../../../domain/review.ts'
import type { GuideStatus, GuideType } from '../../../domain/guides.ts'
import type { SecureBoot, Tpm } from '../../../domain/platform.ts'
import type { RenderPath, AntiCheatRiskPath, Requirement } from '../../../domain/graphics-path.ts'
import type { ObjectionCode, Objection, DistroVerdict } from '../../../domain/distros.ts'
import type { NotExportableReason, SkipReason, NoReportReason } from '../../../domain/upstream.ts'

type Sentence = { readonly sentence: string; readonly note: string | null }

// Failure types are rows: these are the seed's. A code the dictionary lacks shows as itself.
const failureType = {
  anti_cheat: 'Anti-cheat',
  drm: 'DRM',
  lanzador: 'Lanzador',
  controlador: 'Controlador',
  dependencia: 'Dependencia',
  rendimiento: 'Rendimiento',
  otro: 'Otro',
}

// The seed's failure types, described; a type the dictionary lacks shows the description stored with it.
const failureTypeDescription = {
  anti_cheat: 'El sistema anti-trampas del juego bloquea Linux o la capa de compatibilidad.',
  drm: 'La protección anticopia impide iniciar el juego.',
  lanzador: 'El lanzador del editor no abre, no inicia sesión o no termina de actualizar.',
  controlador: 'Falta un controlador de video o su versión no es compatible.',
  dependencia: 'Falta una biblioteca o componente que el juego necesita.',
  rendimiento: 'El juego corre, pero con caídas de FPS o tirones que lo hacen injugable.',
  otro: 'Causa no identificada.',
}

const d3dPath = {
  dxvk: { text: 'DXVK con Proton', detail: null },
  dxvk_2: { text: 'DXVK 2.x', detail: 'Si un Proton reciente no abre el juego, prueba uno con DXVK 2.x.' },
  dxvk_sarek: { text: 'DXVK-Sarek con Proton-CachyOS', detail: 'No es seguro con anti-cheat.' },
  wined3d: { text: 'WineD3D sobre OpenGL', detail: 'Solo DirectX 9–11, más lento.' },
} satisfies Record<D3dPath, { readonly text: string; readonly detail: string | null }>

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

export const vocabulary = {
  compatibilityStatus: {
    sin_evidencia: 'Sin evidencia verificada',
    funciona: 'Funciona',
    funciona_con_ajustes: 'Funciona con ajustes',
    no_inicia: 'No inicia',
    falla_en_ejecucion: 'Falla en ejecución',
    resultados_variables: 'Resultados variables',
  } satisfies Record<CompatibilityStatus, string>,

  statusMeaning: {
    sin_evidencia: 'Ningún revisor ha aprobado todavía una prueba de este juego.',
    funciona: 'Todas las pruebas aprobadas funcionan sin ajustes.',
    funciona_con_ajustes: 'Todas las pruebas aprobadas funcionan después de algún ajuste o perfil.',
    no_inicia: 'En todas las pruebas aprobadas el juego no llega a iniciar, por ejemplo por un anti-cheat a nivel de kernel.',
    falla_en_ejecucion: 'En todas las pruebas aprobadas el juego inicia, pero falla durante la partida.',
    resultados_variables: 'Las pruebas aprobadas dan resultados distintos. La ficha muestra cada entorno.',
  } satisfies Record<CompatibilityStatus, string>,

  requirementsVerdict: {
    no_cumple: 'No cumple',
    informacion_insuficiente: 'Información insuficiente',
    cumple: 'Cumple las condiciones conocidas',
  } satisfies Record<RequirementsVerdict, string>,

  checkStatus: { cumple: 'Cumple', no_cumple: 'No cumple', desconocido: 'Desconocido' } satisfies Record<RequirementCheck['status'], string>,

  reviewStatus: {
    pendiente: 'Pendiente de revisión',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    retirado: 'Retirado',
  } satisfies Record<ReviewStatus, string>,

  distroVerdict: { sin_objeciones: 'Sin objeciones', con_ajustes: 'Con ajustes', descartada: 'Descartadas' } satisfies Record<DistroVerdict, string>,

  gameRequestStatus: { abierto: 'Abierto', cumplido: 'Ya está en el catálogo', rechazado: 'Rechazado' } satisfies Record<GameRequestStatus, string>,

  /** AreWeAntiCheatYet's statuses, with what the list means by each one. */
  antiCheatStatus: {
    Supported: {
      text: 'Anti-cheat soportado',
      meaning: 'El estudio habilitó el anti-cheat en Linux, o el anti-cheat funciona con Wine o Proton sin cambios.',
    },
    Running: {
      text: 'Anti-cheat funciona',
      meaning: 'Se puede jugar en línea en Linux, aunque a veces hacen falta ajustes. Nada de esto evade el anti-cheat.',
    },
    Planned: { text: 'Soporte anunciado', meaning: 'El estudio anunció que habilitará el anti-cheat en Linux o que sacará una versión nativa.' },
    Broken: { text: 'Anti-cheat roto', meaning: 'El anti-cheat no deja jugar en línea en Linux.' },
    Denied: { text: 'Anti-cheat denegado', meaning: 'El estudio dijo que no habilitará el anti-cheat en Linux, o descartó dar soporte a Linux.' },
  } satisfies Record<AntiCheatStatus, { readonly text: string; readonly meaning: string }>,

  failureType,
  failureTypeDescription,

  vulkanSupport: { si: 'Compatible', no: 'Sin soporte', desconocido: 'Desconocido' } satisfies Record<VulkanSupport, string>,

  secureBoot: { activo: 'Activado', inactivo: 'Desactivado', bios: 'Sin UEFI (BIOS)' } satisfies Record<SecureBoot, string>,

  tpm: { '2.0': 'TPM 2.0', '1.2': 'TPM 1.2', no_detectado: 'Sin TPM' } satisfies Record<Tpm, string>,

  role: { usuario: 'Usuario', revisor: 'Revisor', administrador: 'Administrador' } satisfies Record<Role, string>,

  blocker: {
    perfil_sin_reporte_funcional_aprobado: 'Falta un reporte aprobado que use este perfil con resultado funcional.',
    solucion_fallo_origen_no_aprobado: 'El reporte con el fallo de origen aún no está aprobado.',
    solucion_perfil_no_aprobado: 'El perfil que recomienda la solución aún no está aprobado.',
    reporte_incomparable: 'El perfil no coincide con el entorno del diagnóstico.',
  } satisfies Record<Blocker, string>,

  guideType: { eleccion_distribucion: 'Elegir distribución', instalacion: 'Instalación', arranque_dual: 'Arranque dual' } satisfies Record<GuideType, string>,

  guideStatus: { borrador: 'Borrador', publicada: 'Publicada', archivada: 'Archivada' } satisfies Record<GuideStatus, string>,

  payloadReason: {
    ilegible: 'No pudimos leer ese texto. Copia toda la salida del detector, o la dirección completa que abrió tu navegador.',
    version_esquema: 'Ese diagnóstico viene de otra versión del detector. Descárgalo de nuevo y vuelve a ejecutarlo.',
    campo_invalido: 'Al diagnóstico le falta un dato o trae uno que no reconocemos.',
  } satisfies Record<InvalidPayload['reason'], string>,

  vulkanOrigin: { medido: 'Detectado', proyectado: 'Proyectado' } satisfies Record<DataOrigin, string>,

  gpuFamily: {
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
  } satisfies Record<GpuFamily, string>,

  linuxDriver: {
    i915: 'i915 (Intel, incluido en Linux)',
    radeon: 'radeon (AMD antiguo, incluido en Linux)',
    amdgpu: 'amdgpu (AMD, incluido en Linux)',
    nouveau: 'nouveau (libre, incluido en Linux; Vulkan con NVK)',
    nvidia_580xx: 'NVIDIA 580xx (rama heredada del controlador propietario)',
    nvidia: 'NVIDIA (controlador propietario actual)',
  } satisfies Record<LinuxDriver, string>,

  d3dPath,

  gpuWarning: {
    gcn_usar_amdgpu:
      'Tu GPU tiene Vulkan solo con el controlador amdgpu. Es el predeterminado desde Linux 6.19; en un kernel anterior agrega radeon.si_support=0 amdgpu.si_support=1 (o radeon.cik_support=0 amdgpu.cik_support=1) a la línea de arranque.',
    kepler_470_fin: 'El controlador NVIDIA 470 ya no compila en kernels recientes. Usa nouveau con NVK (Mesa 25.2 o más reciente), que da Vulkan 1.2.',
    fijar_nvidia_580xx:
      'NVIDIA dejó de actualizar esta GPU después de la rama 580. Instala el paquete 580xx de tu distribución y fíjalo para que una actualización no lo cambie.',
    nvidia_sin_controlador: 'NVIDIA ya no tiene controlador para esta GPU en kernels actuales. nouveau la hace funcionar, pero sin Vulkan.',
    hasvk_incompleto: 'El Vulkan de Intel para esta generación (hasvk) está incompleto; los juegos DirectX irán por WineD3D.',
    vulkan_sin_verificar: 'Nadie ha medido todavía el Vulkan de esta generación en hardware real; por eso mostramos un rango.',
    vulkan_no_detectado:
      'Tu equipo no detectó Vulkan, pero tu GPU lo tiene: instala los controladores Vulkan de tu distribución (por ejemplo, mesa-vulkan-drivers).',
  } satisfies Record<GpuWarning, string>,

  renderPath: {
    dxvk: { sentence: 'Puede correr con DXVK.', note: null },
    dxvk_2: { sentence: 'Puede correr con DXVK 2.x.', note: d3dPath.dxvk_2.detail },
    vkd3d_proton: { sentence: 'Puede correr con VKD3D-Proton, que traduce DirectX 12 a Vulkan.', note: null },
    vulkan: { sentence: 'Puede correr con Vulkan, sin traducir DirectX.', note: null },
    opengl: { sentence: 'Puede correr con OpenGL, sin traducir DirectX.', note: null },
    dxvk_sarek: {
      sentence: 'Puede correr con DXVK-Sarek en Proton-CachyOS.',
      note: 'No lo uses en juegos en línea con anti-trampas: compila los sombreadores de una forma que el anti-trampas puede marcar.',
    },
    wined3d: { sentence: 'Solo con WineD3D: funciona, pero lento.', note: null },
  } satisfies Record<RenderPath, Sentence> & Record<AntiCheatRiskPath, { readonly note: string }>,

  gamePath: {
    noPath: 'No puede correr',
    missingData: 'Faltan datos',
    noApis: 'APIs sin declarar',
    noGraphicsPath: 'Tu tarjeta gráfica no tiene una ruta para las APIs de este juego.',
    cpuBelow: (level: string) => `Tu procesador no llega al nivel ${level} que pide.`,
    unknownYet: 'Todavía no sabemos si puede correr.',
    atLeast: (path: string) => `Al menos con ${path}.`,
    missing: {
      grafica: 'Falta saber hasta qué versión de Vulkan llega tu tarjeta gráfica: en Linux, instala vulkan-tools y vuelve a ejecutar el detector.',
      cpu: 'Falta el nivel x86-64 de tu procesador: lo mide la versión actual del detector de Linux.',
    } satisfies Record<Requirement, string>,
    undeclaredApis: 'APIs gráficas sin declarar: no podemos calcular una ruta.',
  },

  objections,

  protonVariant: {
    official: 'Proton oficial',
    experimental: 'Proton Experimental',
    ge: 'GE-Proton',
    native: 'Versión nativa de Linux',
    older: 'Proton (versión antigua)',
  } satisfies Record<ProtonVariant, string>,

  skipReason: {
    programa_envoltorio: 'es un programa que envuelve el juego, no un arreglo',
    sintaxis_shell: 'usa sintaxis de la terminal (comillas, $, ; …) que un archivo de arreglo no repite',
    opcion_protonfixes: 'ya es una opción de protonfixes; se queda en las opciones de lanzamiento',
    ajuste_personal: 'es un ajuste de depuración o de gusto personal, no un arreglo',
    forma_invalida: 'tiene una forma que el archivo de arreglo no admite',
    paquete_del_sistema: 'es un paquete del sistema; se instala fuera del juego',
    dependencia_opcional: 'es opcional en el perfil; el archivo la volvería obligatoria',
  } satisfies Record<SkipReason, string>,

  notExportableReason: {
    no_es_steam: 'Solo los perfiles de juegos de Steam se convierten en un arreglo de umu-protonfixes.',
    sin_appid: 'Esta edición de Steam no tiene AppID registrado, así que no hay archivo de arreglo.',
    capa_sin_protonfixes: 'Wine y los juegos nativos no usan umu-protonfixes.',
  } satisfies Record<NotExportableReason, string>,

  noReportReason: {
    no_es_steam: 'Valve solo atiende informes de juegos de Steam.',
    sin_appid: 'La edición de Steam de este juego no tiene AppID registrado.',
    capa_no_valve: 'Valve solo atiende informes de su propio Proton; GE-Proton y Wine tienen sus propios canales.',
    funciona: 'El juego funcionó sin ajustes: no hay nada que informar a Valve.',
  } satisfies Record<NoReportReason, string>,

  steamUnavailable: {
    no_encontrado: 'Steam no tiene ese App ID. Revisa el enlace, o rellena el formulario a mano.',
    no_es_juego: 'Ese App ID es de un DLC, una demo o un programa. Usa el del juego base, o rellena el formulario a mano.',
    sin_respuesta: 'Steam no respondió a tiempo. Intenta de nuevo, o rellena el formulario a mano.',
  } satisfies Record<SteamUnavailable['reason'], string>,
}
