import type { EstadoCompatibilidad } from '../dominio/compatibilidad.ts'
import type { ApiGrafica, Resultado } from '../dominio/literales.ts'
import type { Comprobacion, OrigenDato, Sistema, SoporteVulkan, VeredictoRequisitos } from '../dominio/evaluacion.ts'
import type { AvisoGpu, ControladorLinux, FamiliaGpu, RutaD3d } from '../dominio/gpu.ts'
import type { PayloadInvalido } from '../dominio/fallos.ts'
import type { Bloqueo, EstadoRevision } from '../dominio/revision.ts'
import type { TipoGuia } from '../dominio/guias.ts'
import type { ArranqueSeguro, NivelX86, Tpm } from '../dominio/plataforma.ts'
import type { Camino, CaminoSinAntiTrampas, Requisito, RutaJuego } from '../dominio/ruta.ts'
import type { CodigoObjecion, Objecion, VeredictoDistro } from '../dominio/distros.ts'

export type Tono = 'verde' | 'amarillo' | 'rojo' | 'gris' | 'morado' | 'azul'
export type Etiqueta = { readonly texto: string; readonly tono: Tono; readonly icono: string }

export const estadoCompatibilidad = {
  sin_evidencia: { texto: 'Sin evidencia verificada', tono: 'gris', icono: '?' },
  funciona: { texto: 'Funciona', tono: 'verde', icono: '✓' },
  funciona_con_ajustes: { texto: 'Funciona con ajustes', tono: 'amarillo', icono: '⚙' },
  no_inicia: { texto: 'No inicia', tono: 'rojo', icono: '✕' },
  falla_en_ejecucion: { texto: 'Falla en ejecución', tono: 'rojo', icono: '✕' },
  resultados_variables: { texto: 'Resultados variables', tono: 'morado', icono: '◐' },
} as const satisfies Record<EstadoCompatibilidad, Etiqueta>

export const resultado = {
  funciona: estadoCompatibilidad.funciona,
  funciona_con_ajustes: estadoCompatibilidad.funciona_con_ajustes,
  no_inicia: estadoCompatibilidad.no_inicia,
  falla_en_ejecucion: estadoCompatibilidad.falla_en_ejecucion,
} as const satisfies Record<Resultado, Etiqueta>

export const veredictoRequisitos = {
  no_cumple: { texto: 'No cumple', tono: 'rojo', icono: '✕' },
  informacion_insuficiente: { texto: 'Información insuficiente', tono: 'gris', icono: '?' },
  cumple: { texto: 'Cumple las condiciones conocidas', tono: 'verde', icono: '✓' },
} as const satisfies Record<VeredictoRequisitos, Etiqueta>

export const estadoComprobacion = {
  cumple: { texto: 'Cumple', tono: 'verde', icono: '✓' },
  no_cumple: { texto: 'No cumple', tono: 'rojo', icono: '✕' },
  desconocido: { texto: 'Desconocido', tono: 'amarillo', icono: '?' },
} as const satisfies Record<Comprobacion['estado'], Etiqueta>

export const requisito = { ram: 'RAM', vram: 'VRAM', vulkan: 'Vulkan' } as const satisfies Record<Comprobacion['requisito'], string>

export const soporteVulkan = {
  si: 'Compatible',
  no: 'Sin soporte',
  desconocido: 'Desconocido',
} as const satisfies Record<SoporteVulkan, string>

export const sistema = { Linux: 'Linux', Windows: 'Windows' } as const satisfies Record<Sistema, string>

export const apiGrafica = {
  d3d9: 'Direct3D 9',
  d3d10: 'Direct3D 10',
  d3d11: 'Direct3D 11',
  d3d12: 'Direct3D 12',
  vulkan: 'Vulkan',
  opengl: 'OpenGL',
} as const satisfies Record<ApiGrafica, string>

export const arranqueSeguro = {
  activo: 'Activado',
  inactivo: 'Desactivado',
  bios: 'Sin UEFI (BIOS)',
} as const satisfies Record<ArranqueSeguro, string>

export const tpm = { '2.0': 'TPM 2.0', '1.2': 'TPM 1.2', no_detectado: 'Sin TPM' } as const satisfies Record<Tpm, string>

/** A level as a requirement, named by the instruction set games actually ask for. */
export const nivelX86 = {
  v1: 'x86-64-v1',
  v2: 'x86-64-v2 (SSE4.2)',
  v3: 'x86-64-v3 (AVX2)',
  v4: 'x86-64-v4',
} as const satisfies Record<NivelX86, string>

export const estadoRevision = {
  pendiente: { texto: 'Pendiente de revisión', tono: 'gris', icono: '…' },
  aprobado: { texto: 'Aprobado', tono: 'verde', icono: '✓' },
  rechazado: { texto: 'Rechazado', tono: 'rojo', icono: '✕' },
  retirado: { texto: 'Retirado', tono: 'gris', icono: '–' },
} as const satisfies Record<EstadoRevision, Etiqueta>

export const bloqueo = {
  perfil_sin_reporte_funcional_aprobado: 'Falta un reporte aprobado que use este perfil con resultado funcional.',
  solucion_fallo_origen_no_aprobado: 'El reporte con el fallo de origen aún no está aprobado.',
  solucion_perfil_no_aprobado: 'El perfil que recomienda la solución aún no está aprobado.',
  reporte_incomparable: 'El perfil no coincide con el entorno del diagnóstico.',
} as const satisfies Record<Bloqueo, string>

type EtiquetaFallo = Omit<Etiqueta, 'icono'>
const tiposFallo: Readonly<Record<string, EtiquetaFallo>> = {
  anti_cheat: { texto: 'Anti-cheat', tono: 'rojo' },
  drm: { texto: 'DRM', tono: 'rojo' },
  lanzador: { texto: 'Lanzador', tono: 'amarillo' },
  controlador: { texto: 'Controlador', tono: 'amarillo' },
  dependencia: { texto: 'Dependencia', tono: 'amarillo' },
  rendimiento: { texto: 'Rendimiento', tono: 'amarillo' },
  otro: { texto: 'Otro', tono: 'amarillo' },
}

export const tipoFallo = (codigo: string): EtiquetaFallo => tiposFallo[codigo] ?? { texto: codigo.replaceAll('_', ' '), tono: 'amarillo' }

export const tipoGuia = {
  eleccion_distribucion: 'Elegir distribución',
  instalacion: 'Instalación',
  arranque_dual: 'Arranque dual',
} as const satisfies Record<TipoGuia, string>

export const motivoPayload = {
  ilegible: 'No pudimos leer ese texto. Copia toda la salida del detector, o la dirección completa que abrió tu navegador.',
  version_esquema: 'Ese diagnóstico viene de otra versión del detector. Descárgalo de nuevo y vuelve a ejecutarlo.',
  campo_invalido: 'Al diagnóstico le falta un dato o trae uno que no reconocemos.',
} as const satisfies Record<PayloadInvalido['motivo'], string>

export const significadoEstado = {
  sin_evidencia: 'Ningún revisor ha aprobado todavía una prueba de este juego.',
  funciona: 'Todas las pruebas aprobadas funcionan sin ajustes.',
  funciona_con_ajustes: 'Todas las pruebas aprobadas funcionan después de algún ajuste o perfil.',
  no_inicia: 'En todas las pruebas aprobadas el juego no llega a iniciar, por ejemplo por un anti-cheat a nivel de kernel.',
  falla_en_ejecucion: 'En todas las pruebas aprobadas el juego inicia, pero falla durante la partida.',
  resultados_variables: 'Las pruebas aprobadas dan resultados distintos. La ficha muestra cada entorno.',
} as const satisfies Record<EstadoCompatibilidad, string>

export const origenVulkan = { medido: 'Detectado', proyectado: 'Proyectado' } as const satisfies Record<OrigenDato, string>

export const familiaGpu = {
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
} as const satisfies Record<FamiliaGpu, string>

export const controladorLinux = {
  i915: 'i915 (Intel, incluido en Linux)',
  radeon: 'radeon (AMD antiguo, incluido en Linux)',
  amdgpu: 'amdgpu (AMD, incluido en Linux)',
  nouveau: 'nouveau (libre, incluido en Linux; Vulkan con NVK)',
  nvidia_580xx: 'NVIDIA 580xx (rama heredada del controlador propietario)',
  nvidia: 'NVIDIA (controlador propietario actual)',
} as const satisfies Record<ControladorLinux, string>

export type EtiquetaRuta = { readonly texto: string; readonly detalle: string | null; readonly opcion: string | null }

export const rutaD3d = {
  dxvk: { texto: 'DXVK con Proton', detalle: null, opcion: null },
  dxvk_2: { texto: 'DXVK 2.x', detalle: 'Si un Proton reciente no abre el juego, prueba uno con DXVK 2.x.', opcion: null },
  dxvk_sarek: { texto: 'DXVK-Sarek con Proton-CachyOS', detalle: 'No es seguro con anti-cheat.', opcion: 'PROTON_DXVK_SAREK=1 %command%' },
  wined3d: { texto: 'WineD3D sobre OpenGL', detalle: 'Solo DirectX 9–11, más lento.', opcion: 'PROTON_USE_WINED3D=1 %command%' },
} as const satisfies Record<RutaD3d, EtiquetaRuta>

export const avisoGpu = {
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
} as const satisfies Record<AvisoGpu, string>

export type EtiquetaCamino = {
  readonly nombre: string
  readonly frase: string
  readonly tono: Tono
  readonly nota: string | null
  readonly opcion: string | null
}

/** The type demands a warning on every path that is unsafe with online anti-cheat. */
export const camino = {
  dxvk: { nombre: 'DXVK', frase: 'Puede correr con DXVK.', tono: 'verde', nota: null, opcion: null },
  dxvk_2: { nombre: 'DXVK 2.x', frase: 'Puede correr con DXVK 2.x.', tono: 'verde', nota: rutaD3d.dxvk_2.detalle, opcion: null },
  vkd3d_proton: { nombre: 'VKD3D-Proton', frase: 'Puede correr con VKD3D-Proton, que traduce DirectX 12 a Vulkan.', tono: 'verde', nota: null, opcion: null },
  vulkan: { nombre: 'Vulkan', frase: 'Puede correr con Vulkan, sin traducir DirectX.', tono: 'verde', nota: null, opcion: null },
  opengl: { nombre: 'OpenGL', frase: 'Puede correr con OpenGL, sin traducir DirectX.', tono: 'verde', nota: null, opcion: null },
  dxvk_sarek: {
    nombre: 'DXVK-Sarek',
    frase: 'Puede correr con DXVK-Sarek en Proton-CachyOS.',
    tono: 'amarillo',
    nota: 'No lo uses en juegos en línea con anti-trampas: compila los sombreadores de una forma que el anti-trampas puede marcar.',
    opcion: rutaD3d.dxvk_sarek.opcion,
  },
  wined3d: { nombre: 'WineD3D', frase: 'Solo con WineD3D: funciona, pero lento.', tono: 'amarillo', nota: null, opcion: rutaD3d.wined3d.opcion },
} as const satisfies Record<Camino, EtiquetaCamino> & Record<CaminoSinAntiTrampas, { readonly nota: string }>

export const etiquetaRuta = (r: RutaJuego): Etiqueta => {
  switch (r.estado) {
    case 'con_ruta':
      return { texto: camino[r.camino].nombre, tono: camino[r.camino].tono, icono: '✓' }
    case 'sin_ruta':
      return { texto: 'No puede correr', tono: 'rojo', icono: '✕' }
    case 'sin_datos':
      return { texto: 'Faltan datos', tono: 'gris', icono: '?' }
    case 'sin_apis':
      return { texto: 'APIs sin declarar', tono: 'gris', icono: '?' }
  }
}

const falta = {
  grafica: 'Falta saber hasta qué versión de Vulkan llega tu tarjeta gráfica: en Linux, instala vulkan-tools y vuelve a ejecutar el detector.',
  cpu: 'Falta el nivel x86-64 de tu procesador: lo mide el detector de Linux, vuelve a ejecutarlo.',
} as const satisfies Record<Requisito, string>

/** The verdict as sentences. `minimo` is the game's minimum x86-64 level, named when the CPU decides. */
export const fraseRuta = (r: RutaJuego, minimo: NivelX86 | null): ReadonlyArray<string> => {
  switch (r.estado) {
    case 'con_ruta':
      return [camino[r.camino].frase]
    case 'sin_ruta':
      return [
        r.motivo === 'grafica'
          ? 'Tu tarjeta gráfica no tiene una ruta para las APIs de este juego.'
          : `Tu procesador no llega al nivel ${minimo === null ? 'x86-64' : nivelX86[minimo]} que pide.`,
      ]
    case 'sin_datos':
      return [r.al_menos === null ? 'Todavía no sabemos si puede correr.' : `Al menos con ${camino[r.al_menos].nombre}.`, ...r.faltan.map((f) => falta[f])]
    case 'sin_apis':
      return ['APIs gráficas sin declarar: no podemos calcular una ruta.']
  }
}

export const veredictoDistro = {
  sin_objeciones: { texto: 'Sin objeciones', tono: 'verde', icono: '✓' },
  con_ajustes: { texto: 'Con ajustes', tono: 'amarillo', icono: '⚙' },
  descartada: { texto: 'Descartadas', tono: 'rojo', icono: '✕' },
} as const satisfies Record<VeredictoDistro, Etiqueta>

const objeciones: { readonly [K in CodigoObjecion]: (o: Extract<Objecion, { readonly codigo: K }>) => string } = {
  arquitectura: (o) => `Steam y Proton necesitan un procesador x86_64; el tuyo es ${o.tiene}.`,
  kepler_sin_soporte: () => 'No da soporte a las NVIDIA Kepler (GeForce 600/700).',
  kepler_470: (o) =>
    o.salida === 'kernel_6_8'
      ? 'Tu NVIDIA Kepler: quédate en su kernel 6.8 para seguir con el controlador 470, o usa NVK (Mesa 25.2 o más reciente).'
      : 'Tu NVIDIA Kepler: el controlador 470 no compila en kernels posteriores a 6.8. Usa NVK y comprueba que traiga Mesa 25.2 o más reciente.',
  rama_580: (o) =>
    ({
      paquete_580xx: 'Tu NVIDIA necesita la rama 580 y Arch ya va en la 590: instala nvidia-580xx-dkms.',
      imagen_nvidia: 'Tu NVIDIA necesita la rama 580: instala la imagen bazzite-nvidia.',
      desconocido: 'Tu NVIDIA necesita la rama 580, la última para su generación. Comprueba que esta distribución la ofrezca y fíjala.',
    })[o.como],
  gcn_amdgpu: (o) =>
    o.como === 'kernel_hwe'
      ? 'Tu AMD GCN 1/2 tiene Vulkan solo con amdgpu. Usa el kernel HWE (7.0), donde ya es el predeterminado; con el kernel 6.8 agrega radeon.si_support=0 radeon.cik_support=0 amdgpu.si_support=1 amdgpu.cik_support=1.'
      : 'Tu AMD GCN 1/2 tiene Vulkan solo con amdgpu, predeterminado desde Linux 6.19. Comprueba el kernel; si es anterior, agrega radeon.si_support=0 radeon.cik_support=0 amdgpu.si_support=1 amdgpu.cik_support=1.',
  gpu_desconocida: () => 'No reconocemos tu tarjeta gráfica, así que no pudimos revisar sus controladores aquí.',
}

export const objecion = <K extends CodigoObjecion>(o: Extract<Objecion, { readonly codigo: K }>): string => objeciones[o.codigo](o)
