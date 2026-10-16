import { Option, Schema } from 'effect'
import { DiagnosticInput } from '../../domain/contributions.ts'
import { VulkanSupport } from '../../domain/evaluation.ts'
import { Diagnostic, Distribution } from '../../domain/tables.ts'

export type Input = typeof DiagnosticInput.Encoded

const STORAGE_KEY = 'opengame:diagnostico-pendiente'
const Stored = Schema.fromJsonString(Schema.toEncoded(DiagnosticInput))

export const savePending = (input: Input) => sessionStorage.setItem(STORAGE_KEY, JSON.stringify(input))

export const forgetPending = () => sessionStorage.removeItem(STORAGE_KEY)

export const readPending = (): Option.Option<Input> => Schema.decodeUnknownOption(Stored)(sessionStorage.getItem(STORAGE_KEY))

export const Pasted = Schema.Struct({ texto: Schema.String.pipe(Schema.check(Schema.isNonEmpty({ message: 'Pega la salida del detector.' }))) })

const common = {
  version_sistema: Diagnostic.fields.version_sistema,
  arquitectura: Diagnostic.fields.arquitectura,
  cpu_modelo: Diagnostic.fields.cpu_modelo,
  gpu_modelo: Diagnostic.fields.gpu_modelo,
  ram_mb: Diagnostic.fields.ram_mb,
  vram_mb: Diagnostic.fields.vram_mb,
}

export const ManualForm = Schema.Union([
  Schema.Struct({
    ...common,
    sistema: Schema.Literal('Linux'),
    distribucion: Schema.Struct({ nombre: Distribution.fields.nombre, version: Distribution.fields.version }),
    soporte_vulkan: VulkanSupport,
    version_vulkan: Diagnostic.fields.version_vulkan,
  }),
  Schema.Struct({ ...common, sistema: Schema.Literal('Windows') }),
])

export const manualInput = (f: typeof ManualForm.Encoded): Input => {
  const capturado_en = new Date().toISOString()
  return {
    _tag: 'manual',
    captura:
      f.sistema === 'Linux'
        ? { ...f, capturado_en, version_vulkan: f.soporte_vulkan === 'si' ? f.version_vulkan : null, controlador: null, version_controlador: null }
        : { ...f, capturado_en },
  }
}
