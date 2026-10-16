import { Option, Schema } from 'effect'
import { DiagnosticInput } from '../../domain/contributions.ts'
import { VulkanSupport } from '../../domain/evaluation.ts'
import { Diagnostic, Distribution } from '../../domain/tables.ts'

export type Entrada = typeof DiagnosticInput.Encoded

const CLAVE = 'opengame:diagnostico-pendiente'
const Guardada = Schema.fromJsonString(Schema.toEncoded(DiagnosticInput))

export const guardarPendiente = (entrada: Entrada) => sessionStorage.setItem(CLAVE, JSON.stringify(entrada))

export const olvidarPendiente = () => sessionStorage.removeItem(CLAVE)

export const leerPendiente = (): Option.Option<Entrada> => Schema.decodeUnknownOption(Guardada)(sessionStorage.getItem(CLAVE))

export const Pegado = Schema.Struct({ texto: Schema.String.pipe(Schema.check(Schema.isNonEmpty({ message: 'Pega la salida del detector.' }))) })

const comunes = {
  version_sistema: Diagnostic.fields.version_sistema,
  arquitectura: Diagnostic.fields.arquitectura,
  cpu_modelo: Diagnostic.fields.cpu_modelo,
  gpu_modelo: Diagnostic.fields.gpu_modelo,
  ram_mb: Diagnostic.fields.ram_mb,
  vram_mb: Diagnostic.fields.vram_mb,
}

export const FormularioManual = Schema.Union([
  Schema.Struct({
    ...comunes,
    sistema: Schema.Literal('Linux'),
    distribucion: Schema.Struct({ nombre: Distribution.fields.nombre, version: Distribution.fields.version }),
    soporte_vulkan: VulkanSupport,
    version_vulkan: Diagnostic.fields.version_vulkan,
  }),
  Schema.Struct({ ...comunes, sistema: Schema.Literal('Windows') }),
])

export const entradaManual = (f: typeof FormularioManual.Encoded): Entrada => {
  const capturado_en = new Date().toISOString()
  return {
    _tag: 'manual',
    captura:
      f.sistema === 'Linux'
        ? { ...f, capturado_en, version_vulkan: f.soporte_vulkan === 'si' ? f.version_vulkan : null, controlador: null, version_controlador: null }
        : { ...f, capturado_en },
  }
}
