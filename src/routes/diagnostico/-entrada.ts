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
  soporte_vulkan: SoporteVulkan,
  version_vulkan: Diagnostico.fields.version_vulkan,
}

export const FormularioManual = Schema.Union([
  Schema.Struct({
    ...comunes,
    sistema: Schema.Literal('Linux'),
    distribucion: Schema.Struct({ nombre: Distribucion.fields.nombre, version: Distribucion.fields.version }),
  }),
  Schema.Struct({ ...comunes, sistema: Schema.Literal('Windows') }),
])

export const entradaManual = (f: typeof FormularioManual.Encoded): Entrada => ({
  _tag: 'manual',
  captura: {
    ...f,
    capturado_en: new Date().toISOString(),
    controlador: null,
    version_controlador: null,
    gpu_pci_id: null,
    biblioteca_steam: null,
    version_vulkan: f.soporte_vulkan === 'si' ? f.version_vulkan : null,
  },
})
