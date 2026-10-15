import { Option, Schema } from 'effect'
import { EntradaDiagnostico } from '../../dominio/aportes.ts'
import { SoporteVulkan } from '../../dominio/evaluacion.ts'
import { Diagnostico, Distribucion } from '../../dominio/tablas.ts'

export type Entrada = typeof EntradaDiagnostico.Encoded

const CLAVE = 'opengame:diagnostico-pendiente'
const Guardada = Schema.fromJsonString(Schema.toEncoded(EntradaDiagnostico))

export const guardarPendiente = (entrada: Entrada) => sessionStorage.setItem(CLAVE, JSON.stringify(entrada))

export const olvidarPendiente = () => sessionStorage.removeItem(CLAVE)

export const leerPendiente = (): Option.Option<Entrada> => Schema.decodeUnknownOption(Guardada)(sessionStorage.getItem(CLAVE))

export const Pegado = Schema.Struct({ texto: Schema.String.pipe(Schema.check(Schema.isNonEmpty({ message: 'Pega la salida del detector.' }))) })

const comunes = {
  version_sistema: Diagnostico.fields.version_sistema,
  arquitectura: Diagnostico.fields.arquitectura,
  cpu_modelo: Diagnostico.fields.cpu_modelo,
  gpu_modelo: Diagnostico.fields.gpu_modelo,
  ram_mb: Diagnostico.fields.ram_mb,
  vram_mb: Diagnostico.fields.vram_mb,
}

// Only Linux asks for Vulkan: on Windows it says nothing about Linux, which the GPU card projects instead.
export const FormularioManual = Schema.Union([
  Schema.Struct({
    ...comunes,
    sistema: Schema.Literal('Linux'),
    distribucion: Schema.Struct({ nombre: Distribucion.fields.nombre, version: Distribucion.fields.version }),
    soporte_vulkan: SoporteVulkan,
    version_vulkan: Diagnostico.fields.version_vulkan,
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
