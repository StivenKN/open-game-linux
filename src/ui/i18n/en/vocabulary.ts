import type { vocabulary as source } from '../es/vocabulary.ts'

const failureType = {
  anti_cheat: 'Anti-cheat',
  drm: 'DRM',
  lanzador: 'Launcher',
  controlador: 'Driver',
  dependencia: 'Dependency',
  rendimiento: 'Performance',
  otro: 'Other',
} satisfies (typeof source)['failureType']

const failureTypeDescription = {
  anti_cheat: "The game's anti-cheat blocks Linux or the compatibility layer.",
  drm: 'Copy protection keeps the game from starting.',
  lanzador: "The publisher's launcher doesn't open, doesn't sign in or doesn't finish updating.",
  controlador: 'A graphics driver is missing or its version is not supported.',
  dependencia: 'A library or component the game needs is missing.',
  rendimiento: 'The game runs, but FPS drops or stutters make it unplayable.',
  otro: 'Cause not identified.',
} satisfies (typeof source)['failureTypeDescription']

const d3dPath = {
  dxvk: { text: 'DXVK with Proton', detail: null },
  dxvk_2: { text: 'DXVK 2.x', detail: "If a recent Proton doesn't open the game, try one with DXVK 2.x." },
  dxvk_sarek: { text: 'DXVK-Sarek with Proton-CachyOS', detail: 'Not safe with anti-cheat.' },
  wined3d: { text: 'WineD3D over OpenGL', detail: 'DirectX 9–11 only, and slower.' },
} satisfies (typeof source)['d3dPath']

export const vocabulary = {
  compatibilityStatus: {
    sin_evidencia: 'No verified evidence',
    funciona: 'Works',
    funciona_con_ajustes: 'Works with tweaks',
    no_inicia: "Doesn't start",
    falla_en_ejecucion: 'Crashes in-game',
    resultados_variables: 'Mixed results',
  },

  statusMeaning: {
    sin_evidencia: 'No reviewer has approved a test of this game yet.',
    funciona: 'Every approved test works without tweaks.',
    funciona_con_ajustes: 'Every approved test works after some tweak or profile.',
    no_inicia: "In every approved test the game doesn't get to start, for example because of a kernel-level anti-cheat.",
    falla_en_ejecucion: 'In every approved test the game starts, but crashes while you play.',
    resultados_variables: 'The approved tests give different results. The game page shows each setup.',
  },

  requirementsVerdict: {
    no_cumple: "Doesn't meet the requirements",
    informacion_insuficiente: 'Not enough information',
    cumple: 'Meets the known requirements',
  },

  checkStatus: { cumple: 'Meets it', no_cumple: "Doesn't meet it", desconocido: 'Unknown' },

  reviewStatus: {
    pendiente: 'Awaiting review',
    aprobado: 'Approved',
    rechazado: 'Rejected',
    retirado: 'Withdrawn',
  },

  distroVerdict: { sin_objeciones: 'No objections', con_ajustes: 'With tweaks', descartada: 'Ruled out' },

  gameRequestStatus: { abierto: 'Open', cumplido: 'Already in the catalog', rechazado: 'Rejected' },

  antiCheatStatus: {
    Supported: {
      text: 'Anti-cheat supported',
      meaning: 'The studio enabled the anti-cheat on Linux, or the anti-cheat works with Wine or Proton as is.',
    },
    Running: {
      text: 'Anti-cheat works',
      meaning: 'You can play online on Linux, though it sometimes takes tweaks. None of this evades the anti-cheat.',
    },
    Planned: { text: 'Support announced', meaning: 'The studio announced it will enable the anti-cheat on Linux or release a native version.' },
    Broken: { text: 'Anti-cheat broken', meaning: "The anti-cheat doesn't let you play online on Linux." },
    Denied: { text: 'Anti-cheat denied', meaning: "The studio said it won't enable the anti-cheat on Linux, or ruled out supporting Linux." },
  },

  failureType,
  failureTypeDescription,

  vulkanSupport: { si: 'Supported', no: 'Not supported', desconocido: 'Unknown' },

  secureBoot: { activo: 'On', inactivo: 'Off', bios: 'No UEFI (BIOS)' },

  tpm: { '2.0': 'TPM 2.0', '1.2': 'TPM 1.2', no_detectado: 'No TPM' },

  role: { usuario: 'User', revisor: 'Reviewer', administrador: 'Administrator' },

  blocker: {
    perfil_sin_reporte_funcional_aprobado: 'No approved report uses this profile with a working result yet.',
    solucion_fallo_origen_no_aprobado: 'The report with the original failure is not approved yet.',
    solucion_perfil_no_aprobado: 'The profile the solution recommends is not approved yet.',
    reporte_incomparable: "The profile doesn't match the diagnosis's setup.",
  },

  guideType: { eleccion_distribucion: 'Choosing a distribution', instalacion: 'Installation', arranque_dual: 'Dual boot' },

  guideStatus: { borrador: 'Draft', publicada: 'Published', archivada: 'Archived' },

  payloadReason: {
    ilegible: "We couldn't read that text. Copy the detector's whole output, or the full address your browser opened.",
    version_esquema: 'That diagnosis comes from another version of the detector. Download it again and run it again.',
    campo_invalido: "The diagnosis is missing a value, or carries one we don't recognize.",
  },

  vulkanOrigin: { medido: 'Detected', proyectado: 'Projected' },

  gpuFamily: {
    intel_gen5_o_anterior: 'Intel GMA or first-generation HD (Ironlake or older)',
    intel_gen6: 'Intel HD 2000/3000 (Sandy Bridge)',
    intel_gen7: 'Intel HD 2500/4000 (Ivy Bridge, Bay Trail)',
    intel_gen7_5: 'Intel HD 4200–5200, Iris 5100 (Haswell)',
    intel_gen8: 'Intel HD 5300–6300, Iris 6100 (Broadwell, Braswell)',
    intel_gen9_o_posterior: 'Intel HD/UHD 500 and later, Iris Xe, Arc (Skylake or newer)',
    amd_terascale_o_anterior: 'AMD Radeon HD 6000 or older (TeraScale)',
    amd_gcn1: 'AMD Radeon HD 7000, R7/R9 200 (GCN 1)',
    amd_gcn2: 'AMD Radeon R7 260, R9 290, Kaveri APU (GCN 2)',
    amd_gcn3_o_posterior: 'AMD Radeon R9 285, RX 400 and later (GCN 3 or newer)',
    nvidia_tesla_o_anterior: 'NVIDIA GeForce 300 or older (Tesla)',
    nvidia_fermi: 'NVIDIA GeForce 400/500 (Fermi)',
    nvidia_kepler: 'NVIDIA GeForce 600/700 (Kepler)',
    nvidia_maxwell_a_volta: 'NVIDIA GeForce GTX 750 to 10 (Maxwell, Pascal, Volta)',
    nvidia_turing_o_posterior: 'NVIDIA GeForce GTX 16, RTX (Turing or newer)',
  },

  linuxDriver: {
    i915: 'i915 (Intel, built into Linux)',
    radeon: 'radeon (older AMD, built into Linux)',
    amdgpu: 'amdgpu (AMD, built into Linux)',
    nouveau: 'nouveau (open source, built into Linux; Vulkan with NVK)',
    nvidia_580xx: 'NVIDIA 580xx (legacy branch of the proprietary driver)',
    nvidia: 'NVIDIA (current proprietary driver)',
  },

  d3dPath,

  gpuWarning: {
    gcn_usar_amdgpu:
      'Your GPU has Vulkan only with the amdgpu driver. It is the default since Linux 6.19; on an older kernel, add radeon.si_support=0 amdgpu.si_support=1 (or radeon.cik_support=0 amdgpu.cik_support=1) to the boot line.',
    kepler_470_fin: 'The NVIDIA 470 driver no longer builds on recent kernels. Use nouveau with NVK (Mesa 25.2 or newer), which gives Vulkan 1.2.',
    fijar_nvidia_580xx:
      "NVIDIA stopped updating this GPU after the 580 branch. Install your distribution's 580xx package and pin it so an update doesn't replace it.",
    nvidia_sin_controlador: 'NVIDIA no longer has a driver for this GPU on current kernels. nouveau makes it work, but without Vulkan.',
    hasvk_incompleto: "Intel's Vulkan for this generation (hasvk) is incomplete; DirectX games will go through WineD3D.",
    vulkan_sin_verificar: "Nobody has measured this generation's Vulkan on real hardware yet, so we show a range.",
    vulkan_no_detectado:
      "Your machine didn't detect Vulkan, but your GPU has it: install your distribution's Vulkan drivers (for example, mesa-vulkan-drivers).",
  },

  renderPath: {
    dxvk: { sentence: 'Can run with DXVK.', note: null },
    dxvk_2: { sentence: 'Can run with DXVK 2.x.', note: d3dPath.dxvk_2.detail },
    vkd3d_proton: { sentence: 'Can run with VKD3D-Proton, which translates DirectX 12 to Vulkan.', note: null },
    vulkan: { sentence: 'Can run with Vulkan, without translating DirectX.', note: null },
    opengl: { sentence: 'Can run with OpenGL, without translating DirectX.', note: null },
    dxvk_sarek: {
      sentence: 'Can run with DXVK-Sarek on Proton-CachyOS.',
      note: "Don't use it in online games with anti-cheat: it compiles shaders in a way the anti-cheat can flag.",
    },
    wined3d: { sentence: 'Only with WineD3D: it works, but slowly.', note: null },
  },

  gamePath: {
    noPath: "Can't run",
    missingData: 'Missing data',
    noApis: 'APIs not declared',
    noGraphicsPath: "Your graphics card has no path for this game's APIs.",
    cpuBelow: (level) => `Your processor doesn't reach the ${level} level it asks for.`,
    unknownYet: "We don't know yet whether it can run.",
    atLeast: (path) => `At least with ${path}.`,
    missing: {
      grafica: 'We still need to know which Vulkan version your graphics card reaches: on Linux, install vulkan-tools and run the detector again.',
      cpu: "Your processor's x86-64 level is missing: the current Linux detector measures it.",
    },
    undeclaredApis: "Graphics APIs not declared: we can't work out a path.",
  },

  objections: {
    arquitectura: (o) => `Steam and Proton need an x86_64 processor; yours is ${o.has}.`,
    kepler_sin_soporte: () => "It doesn't support NVIDIA Kepler (GeForce 600/700).",
    kepler_470: (o) =>
      o.kernel === 'kernel_6_8'
        ? 'Your NVIDIA Kepler: stay on its 6.8 kernel to keep the 470 driver, or use NVK (Mesa 25.2 or newer).'
        : "Your NVIDIA Kepler: the 470 driver doesn't build on kernels after 6.8. Use NVK and check that it ships Mesa 25.2 or newer.",
    rama_580: (o) =>
      ({
        paquete_580xx: 'Your NVIDIA needs the 580 branch and Arch is already on 590: install nvidia-580xx-dkms.',
        imagen_nvidia: 'Your NVIDIA needs the 580 branch: install the bazzite-nvidia image.',
        desconocido: 'Your NVIDIA needs the 580 branch, the last one for its generation. Check that this distribution offers it, and pin it.',
      })[o.via],
    gcn_amdgpu: (o) =>
      o.via === 'kernel_hwe'
        ? 'Your AMD GCN 1/2 has Vulkan only with amdgpu. Use the HWE kernel (7.0), where it is already the default; with the 6.8 kernel, add radeon.si_support=0 radeon.cik_support=0 amdgpu.si_support=1 amdgpu.cik_support=1.'
        : 'Your AMD GCN 1/2 has Vulkan only with amdgpu, the default since Linux 6.19. Check the kernel; if it is older, add radeon.si_support=0 radeon.cik_support=0 amdgpu.si_support=1 amdgpu.cik_support=1.',
    gpu_desconocida: () => "We don't recognize your graphics card, so we couldn't check its drivers here.",
  },

  protonVariant: {
    official: 'Official Proton',
    experimental: 'Proton Experimental',
    ge: 'GE-Proton',
    native: 'Native Linux version',
    older: 'Proton (older version)',
  },

  skipReason: {
    programa_envoltorio: "it's a program that wraps the game, not a fix",
    sintaxis_shell: "it uses shell syntax (quotes, $, ; …) that a fix file doesn't repeat",
    opcion_protonfixes: "it's already a protonfixes option; it stays in the launch options",
    ajuste_personal: "it's a debugging or personal-taste tweak, not a fix",
    forma_invalida: "it has a shape the fix file doesn't accept",
    paquete_del_sistema: "it's a system package; it is installed outside the game",
    dependencia_opcional: "it's optional in the profile; the file would make it required",
  },

  notExportableReason: {
    no_es_steam: 'Only profiles of Steam games become an umu-protonfixes fix.',
    sin_appid: 'This Steam edition has no AppID on record, so there is no fix file.',
    capa_sin_protonfixes: "Wine and native games don't use umu-protonfixes.",
  },

  noReportReason: {
    no_es_steam: 'Valve only takes reports about Steam games.',
    sin_appid: "This game's Steam edition has no AppID on record.",
    capa_no_valve: 'Valve only takes reports about its own Proton; GE-Proton and Wine have their own channels.',
    funciona: 'The game worked without tweaks: there is nothing to report to Valve.',
  },

  steamUnavailable: {
    no_encontrado: 'Steam has no such App ID. Check the link, or fill in the form by hand.',
    no_es_juego: "That App ID belongs to a DLC, a demo or a program. Use the base game's, or fill in the form by hand.",
    sin_respuesta: "Steam didn't answer in time. Try again, or fill in the form by hand.",
  },
} satisfies typeof source
