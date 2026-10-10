// What /diagnostico hands to /diagnostico/importar: the unsaved entry, kept in sessionStorage so a guest
// can sign in and come back to save it. The detector text is stored as it arrived; only the server parses it.
import { Option, Schema } from 'effect'
import { EntradaDiagnostico } from '../../dominio/aportes.ts'
import { SoporteVulkan } from '../../dominio/evaluacion.ts'
import { Diagnostico, Distribucion } from '../../dominio/tablas.ts'

export type Entrada = typeof EntradaDiagnostico.Encoded

const CLAVE = 'opengame:diagnostico-pendiente'
const Guardada = Schema.fromJsonString(Schema.toEncoded(EntradaDiagnostico))

export const guardarPendiente = (entrada: Entrada) => sessionStorage.setItem(CLAVE, JSON.stringify(entrada))

export const leerPendiente = (): Option.Option<Entrada> => Schema.decodeUnknownOption(Guardada)(sessionStorage.getItem(CLAVE))

/** The paste box: detector JSON, its base64url fragment, or the whole URL. */
export const Pegado = Schema.Struct({ texto: Schema.String.pipe(Schema.check(Schema.isNonEmpty({ message: 'Pega la salida del detector.' }))) })

const comunes = {
  version_sistema: Diagnostico.fields.version_sistema,
  arquitectura: Diagnostico.fields.arquitectura,
  cpu_modelo: Diagnostico.fields.cpu_modelo,
  gpu_modelo: Diagnostico.fields.gpu_modelo,
  ram_mb: Diagnostico.fields.ram_mb,
  vram_mb: Diagnostico.fields.vram_mb, // select: "No sé" posts "null"
  soporte_vulkan: SoporteVulkan,
  version_vulkan: Diagnostico.fields.version_vulkan, // select: "No sé" posts "null"
}

/**
 * The manual form (wireframe 9.2 "Selección manual", with free text instead of the cut CPU/GPU lists).
 * Same column limits as the diagnostico table, so a capture the form accepts the DB accepts too.
 */
export const FormularioManual = Schema.Union([
  Schema.Struct({
    ...comunes,
    sistema: Schema.Literal('Linux'),
    distribucion: Schema.Struct({ nombre: Distribucion.fields.nombre, version: Distribucion.fields.version }),
  }),
  Schema.Struct({ ...comunes, sistema: Schema.Literal('Windows') }),
])

/** A filled form as a capture taken now. Without Vulkan support there is no version (CHECK version_vulkan_solo_con_soporte). */
export const entradaManual = (f: typeof FormularioManual.Encoded): Entrada => ({
  _tag: 'manual',
  captura: {
    ...f,
    capturado_en: new Date().toISOString(),
    controlador: null,
    version_controlador: null,
    version_vulkan: f.soporte_vulkan === 'si' ? f.version_vulkan : null,
  },
})
