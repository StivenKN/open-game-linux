// The ONLY parser of opengame-detect.sh output (fixed decision: parsed only on the server).
// Pure, no DB, unit-tested on prototypes/detector/out.json. It lives under servidor/ (not dominio/)
// so the browser cannot import it: fronteras.test.ts forbids routes/ and ui/ from importing servidor/.
//
// Accepts what reaches the server by either handoff path:
//   - the fragment value posted untouched by /diagnostico/importar (base64url JSON)
//   - pasted text: raw JSON, the base64url string, or the whole URL containing "#d="
import { Effect, Result, Schema, SchemaIssue } from 'effect'
import { Captura, type EntradaDiagnostico } from '../../dominio/aportes.ts'
import { PayloadInvalido } from '../../dominio/fallos.ts'
import { SoporteVulkan } from '../../dominio/evaluacion.ts'
import { Diagnostico, Distribucion } from '../../dominio/tablas.ts'

export const VERSION_ESQUEMA = 1

/** Payload v1 = the prototype's out.json plus gpu_pci_id ("8086:9a49"). Wire shape only; never leaves this file. */
const PayloadV1 = Schema.Struct({
  version_esquema: Schema.Literal(VERSION_ESQUEMA),
  capturado_en: Schema.String,
  sistema: Schema.Literal('Linux'), // the script only runs on Linux
  version_sistema: Schema.String,
  distribucion: Schema.Struct({ nombre: Schema.String, version: Schema.NullOr(Schema.String) }),
  arquitectura: Schema.String,
  cpu_modelo: Schema.NullOr(Schema.String), // ARM kernels may not name the CPU
  gpu_modelo: Schema.NullOr(Schema.String),
  gpu_pci_id: Schema.optionalKey(Schema.NullOr(Schema.String)), // absent in the prototype's out.json
  ram_mb: Schema.Int,
  vram_mb: Schema.NullOr(Schema.Int),
  controlador: Schema.NullOr(Schema.String),
  version_controlador: Schema.NullOr(Schema.String),
  soporte_vulkan: SoporteVulkan,
  version_vulkan: Schema.NullOr(Schema.String),
})

/**
 * 1. trim; keep only what follows "#d=" when present
 * 2. not starting with "{": base64url-decode; anything else -> ilegible
 * 3. JSON.parse; failure or not an object -> ilegible
 * 4. version_esquema !== 1 -> version_esquema ("Descarga de nuevo el detector")
 * 5. decode PayloadV1 then Captura; failure -> campo_invalido with the first issue path
 * Normalization (server-owned, per detector FINDINGS):
 *   - distribucion.version: empty or /^\d{8}/ (Arch build date) -> "rolling"; a rule, not a list
 *   - soporte_vulkan !== 'si' -> version_vulkan = null (the ICD ceiling version is dropped, never promoted to support)
 *   - gpu_modelo null -> etiquetaPci(gpu_pci_id) ?? 'GPU no detectada'; cpu_modelo null -> 'CPU no detectada'
 * 6. a text longer than its diagnostico/distribucion column -> campo_invalido (not an SQL error at INSERT)
 */
export const parsearPayload = (texto: string): Result.Result<Captura, PayloadInvalido> =>
  Result.gen(function* () {
    const json = yield* cuerpoJson(texto)
    const valor = yield* Result.mapError(Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Unknown))(json), () => ilegible)
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return yield* Result.fail(ilegible)
    if (!('version_esquema' in valor) || valor.version_esquema !== VERSION_ESQUEMA)
      return yield* Result.fail(new PayloadInvalido({ motivo: 'version_esquema', campo: 'version_esquema' }))
    const p = yield* Result.mapError(Schema.decodeUnknownResult(PayloadV1)(valor), campoInvalido)
    const candidato: typeof Captura.Encoded = {
      capturado_en: p.capturado_en,
      sistema: p.sistema,
      version_sistema: p.version_sistema,
      distribucion: { nombre: p.distribucion.nombre, version: versionDistribucion(p.distribucion.version) },
      arquitectura: p.arquitectura,
      cpu_modelo: p.cpu_modelo ?? 'CPU no detectada',
      gpu_modelo: p.gpu_modelo ?? etiquetaPci(p.gpu_pci_id ?? null) ?? 'GPU no detectada',
      ram_mb: p.ram_mb,
      vram_mb: p.vram_mb,
      controlador: p.controlador,
      version_controlador: p.version_controlador,
      soporte_vulkan: p.soporte_vulkan,
      version_vulkan: p.soporte_vulkan === 'si' ? p.version_vulkan : null,
    }
    return yield* cabeEnColumnas(yield* Result.mapError(Schema.decodeResult(Captura)(candidato), campoInvalido))
  })

/** The capture an entry carries: detector text through the one parser, or the manual form's Captura within the column limits. */
export const capturaDe = (entrada: EntradaDiagnostico): Effect.Effect<Captura, PayloadInvalido> =>
  Effect.fromResult(entrada._tag === 'manual' ? cabeEnColumnas(entrada.captura) : parsearPayload(entrada.texto))

// Captura's text fields are unbounded (dominio/aportes.ts); the columns are varchar(n), so check the row Schemas' limits here.
const Columnas = Schema.Struct({
  version_sistema: Diagnostico.fields.version_sistema,
  arquitectura: Diagnostico.fields.arquitectura,
  cpu_modelo: Diagnostico.fields.cpu_modelo,
  gpu_modelo: Diagnostico.fields.gpu_modelo,
  controlador: Diagnostico.fields.controlador,
  version_controlador: Diagnostico.fields.version_controlador,
  version_vulkan: Diagnostico.fields.version_vulkan,
  distribucion: Schema.optionalKey(Schema.Struct({ nombre: Distribucion.fields.nombre, version: Distribucion.fields.version })),
})

const cabeEnColumnas = (captura: Captura): Result.Result<Captura, PayloadInvalido> =>
  Result.map(Result.mapError(Schema.decodeUnknownResult(Columnas)(captura), campoInvalido), () => captura)

const VENDORES: Readonly<Record<string, string>> = { '8086': 'Intel', '10de': 'NVIDIA', '1002': 'AMD' }

/** "8086:9a49" -> "Intel GPU [8086:9a49]". Three vendors, no device database (round 1 cut). */
export const etiquetaPci = (pci: string | null): string | null => {
  const id = pci?.trim().toLowerCase() ?? ''
  const vendor = /^([0-9a-f]{4}):[0-9a-f]{4}$/.exec(id)?.[1]
  if (vendor === undefined) return null
  const nombre = VENDORES[vendor]
  return nombre === undefined ? `GPU [${id}]` : `${nombre} GPU [${id}]`
}

const ilegible = new PayloadInvalido({ motivo: 'ilegible', campo: null })

const cuerpoJson = (texto: string): Result.Result<string, PayloadInvalido> => {
  const limpio = texto.trim()
  const ancla = limpio.indexOf('#d=')
  const cuerpo = ancla === -1 ? limpio : limpio.slice(ancla + 3)
  if (cuerpo.startsWith('{')) return Result.succeed(cuerpo)
  // Buffer's base64url decoder skips invalid characters instead of failing, so reject them first.
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(cuerpo)) return Result.fail(ilegible)
  return Result.succeed(Buffer.from(cuerpo, 'base64url').toString('utf8'))
}

const formato = SchemaIssue.makeFormatterStandardSchemaV1()

const campoInvalido = (error: Schema.SchemaError): PayloadInvalido => {
  const ruta = formato(error.issue).issues[0]?.path ?? []
  const campo = ruta.map((p) => String(typeof p === 'object' ? p.key : p)).join('.')
  return new PayloadInvalido({ motivo: 'campo_invalido', campo: campo === '' ? null : campo })
}

/** Rolling distros report no version or a build date (Arch VERSION_ID "20261004.0.606936"). */
const versionDistribucion = (version: string | null): string => {
  const v = version?.trim() ?? ''
  return v === '' || /^\d{8}/.test(v) ? 'rolling' : v
}
