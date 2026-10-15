import type { EstadoCompatibilidad } from '../dominio/compatibilidad.ts'
import type { Resultado } from '../dominio/literales.ts'
import type { Comprobacion, OrigenDato, Sistema, SoporteVulkan, VeredictoRequisitos } from '../dominio/evaluacion.ts'
import type { AvisoGpu, ControladorLinux, FamiliaGpu, RutaD3d } from '../dominio/gpu.ts'
import type { PayloadInvalido } from '../dominio/fallos.ts'
import type { Bloqueo, EstadoRevision } from '../dominio/revision.ts'
import type { TipoGuia } from '../dominio/guias.ts'

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
  gpu_supuesta: 'No encontramos este modelo exacto en nuestra tabla; suponemos que es de la generación más reciente de su marca.',
  vulkan_no_detectado:
    'Tu equipo no detectó Vulkan, pero tu GPU lo tiene: instala los controladores Vulkan de tu distribución (por ejemplo, mesa-vulkan-drivers).',
} as const satisfies Record<AvisoGpu, string>
