import { Array as Arr, Effect, Schema, Struct } from 'effect'
import { EstadoCompatibilidad } from './compatibility.ts'
import { SoporteVulkan } from './evaluation.ts'
import type { Discrepancia } from './errors.ts'
import {
  Casilla,
  DiagnosticoId,
  DistribucionId,
  EdicionId,
  EquipoId,
  LanzadorId,
  PerfilId,
  ReporteId,
  Texto,
  TipoFalloId,
  VersionCapaId,
} from './ids.ts'
import { ApiGrafica, FamiliaCapa, ResultadoFallido, ResultadoFuncional } from './literals.ts'
import { MAX_JUEGOS_BIBLIOTECA } from './library.ts'
import { largo } from './max-lengths.ts'
import { Diagnostico, Distribucion, Equipo, Juego, PerfilConfiguracion, Reporte, Solucion, TextoHasta, TextoOpcionalHasta, VersionCapa } from './tables.ts'

export const VersionCapaRef = Schema.Union([
  Schema.TaggedStruct('existente', { id: VersionCapaId }),
  Schema.TaggedStruct('nueva', { familia: FamiliaCapa, variante: VersionCapa.fields.variante, version: VersionCapa.fields.version }),
])

export const EquipoDestino = Schema.Union([
  Schema.TaggedStruct('existente', { id: EquipoId }),
  Schema.TaggedStruct('nuevo', { alias: Equipo.fields.alias }),
])

export const MedicionFps = Schema.Struct({
  fps_promedio: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 99999.99 }, { message: 'Escribe un promedio de FPS entre 0 y 99999.99.' })),
  resolucion: TextoHasta(largo.reporte.resolucion),
  calidad_grafica: TextoHasta(largo.reporte.calidad_grafica),
  metodo_medicion: Texto,
})

export const FalloObservado = Schema.Struct({ tipo_fallo_id: TipoFalloId, detalle: Texto })

// FormData cannot express an empty array, so a form with no fallos rows posts no `fallos` key (probe a).
const FallosOpcionales = Schema.Array(FalloObservado).pipe(Schema.withDecodingDefaultKey(Effect.succeed([])))
const FallosExigidos = Schema.Array(FalloObservado).pipe(
  Schema.refine(Arr.isReadonlyArrayNonEmpty, {
    message: 'Si no inicia o falla, indica al menos un tipo de fallo (usa «otro» si no sabes la causa).',
  }),
  Schema.withDecodingDefaultKey(Effect.succeed([])),
)

const camposReporte = {
  edicion_id: EdicionId,
  diagnostico_id: DiagnosticoId,
  version_capa: VersionCapaRef,
  perfil_id: Schema.NullOr(PerfilId),
  version_juego: Reporte.fields.version_juego,
  version_lanzador: TextoOpcionalHasta(largo.reporte.version_lanzador),
  fecha_prueba: Schema.DateFromString, // the form's datetime-local value, read in the browser's own zone
  medicion: Schema.NullOr(MedicionFps),
  observaciones: Texto,
}

/**
 * One member per literal because a union only picks its member by a single
 * literal field; with a literal set it would try every member and report all their issues.
 */
export const NuevoReporte = Schema.Union([
  ...ResultadoFuncional.members.map((resultado) => Schema.Struct({ ...camposReporte, resultado, fallos: FallosOpcionales })),
  ...ResultadoFallido.members.map((resultado) => Schema.Struct({ ...camposReporte, resultado, fallos: FallosExigidos })),
])
export type NuevoReporte = typeof NuevoReporte.Type

export const NuevaSolucion = Schema.Struct({
  reporte_id: ReporteId,
  tipo_fallo_id: TipoFalloId,
  perfil_id: Schema.NullOr(PerfilId),
  titulo: Solucion.fields.titulo,
  instrucciones: Texto,
})
export type NuevaSolucion = typeof NuevaSolucion.Type

export const NuevoJuego = Schema.Struct({
  titulo: Juego.fields.titulo,
  descripcion: Texto,
  ediciones: Schema.NonEmptyArray(
    Schema.Struct({ lanzador_id: LanzadorId, identificador_externo: TextoOpcionalHasta(largo.edicion_juego.identificador_externo) }),
  ),
  // Checkboxes named `apis[]`; with none checked the form posts no `apis` key at all.
  apis: Schema.Array(ApiGrafica).pipe(
    Schema.refine(Arr.isReadonlyArrayNonEmpty, { message: 'Marca al menos una API gráfica.' }),
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
  nivel_x86_min: Juego.fields.nivel_x86_min,
})
export type NuevoJuego = typeof NuevoJuego.Type

const camposCaptura = {
  capturado_en: Schema.DateFromString,
  version_sistema: Diagnostico.fields.version_sistema,
  arquitectura: Diagnostico.fields.arquitectura,
  cpu_modelo: Diagnostico.fields.cpu_modelo,
  gpu_modelo: Diagnostico.fields.gpu_modelo,
  ram_mb: Diagnostico.fields.ram_mb,
  vram_mb: Diagnostico.fields.vram_mb,
}

const camposLinux = {
  sistema: Schema.Literal('Linux'),
  distribucion: Schema.Struct({ nombre: Distribucion.fields.nombre, version: Distribucion.fields.version }),
  controlador: TextoOpcionalHasta(largo.diagnostico.controlador),
  version_controlador: TextoOpcionalHasta(largo.diagnostico.version_controlador),
  soporte_vulkan: SoporteVulkan,
  version_vulkan: TextoOpcionalHasta(largo.diagnostico.version_vulkan),
}

const camposDetectados = {
  gpu_pci_id: Diagnostico.fields.gpu_pci_id,
  biblioteca_steam: Diagnostico.fields.biblioteca_steam,
  // Only the Linux detector reads these; the Windows detector and older payloads omit them.
  nivel_x86: Diagnostico.fields.nivel_x86.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  arranque_seguro: Diagnostico.fields.arranque_seguro.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  tpm: Diagnostico.fields.tpm.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  zram_mb: Diagnostico.fields.zram_mb.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
  swap_mb: Diagnostico.fields.swap_mb.pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
}

const vulkanConSoporte = Schema.makeFilter((c: { readonly soporte_vulkan: SoporteVulkan; readonly version_vulkan: string | null }) => c.soporte_vulkan === 'si' || c.version_vulkan === null, {
  message: 'Solo hay versión de Vulkan si hay soporte.',
})

export const Captura = Schema.Union([
  Schema.Struct({ ...camposCaptura, ...camposDetectados, ...camposLinux }).check(vulkanConSoporte),
  Schema.Struct({ ...camposCaptura, ...camposDetectados, sistema: Schema.Literal('Windows') }),
])
export type Captura = typeof Captura.Type

export const CapturaManual = Schema.Union([
  Schema.Struct({ ...camposCaptura, ...camposLinux }).check(vulkanConSoporte),
  Schema.Struct({ ...camposCaptura, sistema: Schema.Literal('Windows') }),
])

// About 30 characters of JSON around each name, then ×2 for base64url (4/3) and the hardware fields.
// PowerShell writes non-ASCII as \uXXXX, so a full library of long non-ASCII names can still exceed it.
const MAX_TEXTO_DETECTOR = MAX_JUEGOS_BIBLIOTECA * (30 + largo.biblioteca.nombre) * 2

export const EntradaDiagnostico = Schema.Union([
  Schema.TaggedStruct('detector', { texto: Schema.String.pipe(Schema.check(Schema.isMaxLength(MAX_TEXTO_DETECTOR))) }),
  Schema.TaggedStruct('manual', { captura: CapturaManual }),
])
export type EntradaDiagnostico = typeof EntradaDiagnostico.Type

export const GuardarDiagnostico = Schema.Struct({ equipo: EquipoDestino, entrada: EntradaDiagnostico, con_biblioteca: Casilla })

export const FiltroCatalogo = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  estado: Schema.optionalKey(EstadoCompatibilidad),
  lanzador: Schema.optionalKey(LanzadorId),
  sin_anti_cheat: Schema.optionalKey(Schema.Boolean),
})
export type FiltroCatalogo = typeof FiltroCatalogo.Type

export type ContextoPrueba = {
  readonly edicion_id: EdicionId
  readonly version_capa_id: VersionCapaId
  readonly distribucion_id: DistribucionId
  readonly arquitectura: string
  readonly version_juego: string
}

export const PerfilObjetivo = PerfilConfiguracion.mapFields(
  Struct.pick(['edicion_id', 'version_capa_id', 'distribucion_id', 'arquitectura', 'version_juego_objetivo']),
)
export type PerfilObjetivo = typeof PerfilObjetivo.Type

export const discrepancias = (prueba: ContextoPrueba, perfil: PerfilObjetivo): ReadonlyArray<Discrepancia> => {
  const encontradas: Array<Discrepancia> = []
  if (prueba.edicion_id !== perfil.edicion_id)
    encontradas.push({ de: 'edicion', esperado: perfil.edicion_id, observado: prueba.edicion_id })
  if (prueba.version_capa_id !== perfil.version_capa_id)
    encontradas.push({ de: 'capa', esperado: perfil.version_capa_id, observado: prueba.version_capa_id })
  if (prueba.distribucion_id !== perfil.distribucion_id)
    encontradas.push({ de: 'distribucion', esperado: perfil.distribucion_id, observado: prueba.distribucion_id })
  if (prueba.arquitectura !== perfil.arquitectura)
    encontradas.push({ de: 'arquitectura', esperado: perfil.arquitectura, observado: prueba.arquitectura })
  if (perfil.version_juego_objetivo !== null && prueba.version_juego !== perfil.version_juego_objetivo)
    encontradas.push({ de: 'version_juego', esperado: perfil.version_juego_objetivo, observado: prueba.version_juego })
  return encontradas
}
