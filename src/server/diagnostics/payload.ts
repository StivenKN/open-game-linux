import { Effect, Option, Result, Schema, SchemaIssue } from 'effect'
import { Capture, type DiagnosticInput } from '../../domain/contributions.ts'
import { InvalidPayload } from '../../domain/errors.ts'
import { type SteamLibrary, isSteamTool, MAX_LIBRARY_GAMES } from '../../domain/library.ts'
import { OperatingSystem, VulkanSupport } from '../../domain/evaluation.ts'
import { PciId, vendorOf, type GpuVendor } from '../../domain/gpu.ts'
import { maxLengths } from '../../domain/max-lengths.ts'
import { Diagnostic, Distribution } from '../../domain/tables.ts'

export const VERSION_ESQUEMA = 1

const JuegoEnviado = Schema.Struct({ app_id: Schema.Number, nombre: Schema.String })

const comunes = {
  version_esquema: Schema.Literal(VERSION_ESQUEMA),
  capturado_en: Schema.String,
  version_sistema: Schema.String,
  arquitectura: Schema.String,
  cpu_modelo: Schema.NullOr(Schema.String), // ARM kernels may not name the CPU
  gpu_modelo: Schema.NullOr(Schema.String),
  gpu_pci_id: Schema.optionalKey(Schema.Unknown),
  ram_mb: Schema.Int,
  vram_mb: Schema.NullOr(Schema.Int),
  biblioteca_steam: Schema.optionalKey(Schema.NullOr(Schema.Array(JuegoEnviado))),
}

const PayloadV1 = {
  Linux: Schema.Struct({
    ...comunes,
    sistema: Schema.Literal('Linux'),
    distribucion: Schema.Struct({ nombre: Schema.String, version: Schema.NullOr(Schema.String) }),
    controlador: Schema.NullOr(Schema.String),
    version_controlador: Schema.NullOr(Schema.String),
    soporte_vulkan: VulkanSupport,
    version_vulkan: Schema.NullOr(Schema.String),
    // Added after version 1 shipped without a bump: older detectors omit them.
    nivel_x86: Schema.optionalKey(Diagnostic.fields.nivel_x86),
    arranque_seguro: Schema.optionalKey(Diagnostic.fields.arranque_seguro),
    tpm: Schema.optionalKey(Diagnostic.fields.tpm),
    zram_mb: Schema.optionalKey(Diagnostic.fields.zram_mb),
    swap_mb: Schema.optionalKey(Diagnostic.fields.swap_mb),
  }),
  Windows: Schema.Struct({ ...comunes, sistema: Schema.Literal('Windows') }),
} satisfies Record<OperatingSystem, Schema.Top>

const esSistema = Schema.is(OperatingSystem)

export const parsearPayload = (texto: string): Result.Result<Capture, InvalidPayload> =>
  Result.gen(function* () {
    const json = yield* cuerpoJson(texto)
    const valor = yield* Result.mapError(Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Unknown))(json), () => ilegible)
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return yield* Result.fail(ilegible)
    if (!('version_esquema' in valor) || valor.version_esquema !== VERSION_ESQUEMA)
      return yield* Result.fail(new InvalidPayload({ reason: 'version_esquema', field: 'version_esquema' }))
    if (!('sistema' in valor) || !esSistema(valor.sistema)) return yield* Result.fail(new InvalidPayload({ reason: 'campo_invalido', field: 'sistema' }))
    const p = yield* Result.mapError(Schema.decodeUnknownResult(PayloadV1[valor.sistema])(valor), campoInvalido)
    const pci = pciId(p.gpu_pci_id)
    const comun = {
      capturado_en: p.capturado_en,
      version_sistema: p.version_sistema,
      arquitectura: p.arquitectura,
      cpu_modelo: p.cpu_modelo ?? 'CPU no detectada',
      gpu_modelo: p.gpu_modelo ?? (pci === null ? 'GPU no detectada' : etiquetaPci(pci)),
      gpu_pci_id: pci,
      ram_mb: p.ram_mb,
      vram_mb: p.vram_mb,
      biblioteca_steam: p.biblioteca_steam === undefined || p.biblioteca_steam === null ? null : bibliotecaDe(p.biblioteca_steam),
    }
    const candidato: typeof Capture.Encoded =
      p.sistema === 'Linux'
        ? {
            ...comun,
            sistema: 'Linux',
            distribucion: { nombre: p.distribucion.nombre, version: versionDistribucion(p.distribucion.version) },
            controlador: p.controlador,
            version_controlador: p.version_controlador,
            soporte_vulkan: p.soporte_vulkan,
            version_vulkan: p.soporte_vulkan === 'si' ? p.version_vulkan : null,
            nivel_x86: p.nivel_x86 ?? null,
            arranque_seguro: p.arranque_seguro ?? null,
            tpm: p.tpm ?? null,
            zram_mb: p.zram_mb ?? null,
            swap_mb: p.swap_mb ?? null,
          }
        : { ...comun, sistema: 'Windows' }
    return yield* cabeEnColumnas(yield* Result.mapError(Schema.decodeResult(Capture)(candidato), campoInvalido))
  })

/** jsonb rejects \u0000 and unpaired surrogates. */
const bibliotecaDe = (juegos: ReadonlyArray<typeof JuegoEnviado.Type>): typeof SteamLibrary.Encoded => {
  const vistos = new Set<number>()
  return juegos
    .flatMap(({ app_id, nombre }) => {
      const legible = nombre.toWellFormed().replace(/\p{Cc}/gu, '').trim()
      const limpio = legible.slice(0, maxLengths.biblioteca.nombre).replace(/[\uD800-\uDBFF]$/, '').trim()
      if (limpio === '' || isSteamTool(limpio) || !Number.isSafeInteger(app_id) || app_id <= 0 || vistos.has(app_id)) return []
      vistos.add(app_id)
      return [{ app_id, nombre: limpio }]
    })
    .slice(0, MAX_LIBRARY_GAMES)
}

export const capturaDe = (entrada: DiagnosticInput): Effect.Effect<Capture, InvalidPayload> =>
  Effect.fromResult(
    entrada._tag === 'manual'
      ? cabeEnColumnas({ ...entrada.captura, gpu_pci_id: null, biblioteca_steam: null, nivel_x86: null, arranque_seguro: null, tpm: null, zram_mb: null, swap_mb: null })
      : parsearPayload(entrada.texto),
  )

const Columnas = Schema.Struct({
  version_sistema: Diagnostic.fields.version_sistema,
  arquitectura: Diagnostic.fields.arquitectura,
  cpu_modelo: Diagnostic.fields.cpu_modelo,
  gpu_modelo: Diagnostic.fields.gpu_modelo,
  controlador: Schema.optionalKey(Diagnostic.fields.controlador),
  version_controlador: Schema.optionalKey(Diagnostic.fields.version_controlador),
  version_vulkan: Schema.optionalKey(Diagnostic.fields.version_vulkan),
  distribucion: Schema.optionalKey(Schema.Struct({ nombre: Distribution.fields.nombre, version: Distribution.fields.version })),
})

const cabeEnColumnas = (captura: Capture): Result.Result<Capture, InvalidPayload> =>
  Result.map(Result.mapError(Schema.decodeUnknownResult(Columnas)(captura), campoInvalido), () => captura)

const pciId = (valor: unknown): PciId | null =>
  Option.getOrNull(Schema.decodeUnknownOption(PciId)(typeof valor === 'string' ? valor.trim().toLowerCase() : valor))

const marca = { '8086': 'Intel', '1002': 'AMD', '10de': 'NVIDIA' } as const satisfies Record<GpuVendor, string>

const etiquetaPci = (pci: PciId): string => {
  const vendor = vendorOf(pci)
  return vendor === null ? `GPU [${pci}]` : `${marca[vendor]} GPU [${pci}]`
}

const ilegible = new InvalidPayload({ reason: 'ilegible', field: null })

const cuerpoJson = (texto: string): Result.Result<string, InvalidPayload> => {
  const limpio = texto.trim()
  const ancla = limpio.indexOf('#d=')
  const cuerpo = ancla === -1 ? limpio : limpio.slice(ancla + 3)
  if (cuerpo.startsWith('{')) return Result.succeed(cuerpo)
  // Buffer's base64url decoder skips invalid characters instead of failing, so reject them first.
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(cuerpo)) return Result.fail(ilegible)
  return Result.succeed(Buffer.from(cuerpo, 'base64url').toString('utf8'))
}

const formato = SchemaIssue.makeFormatterStandardSchemaV1()

const campoInvalido = (error: Schema.SchemaError): InvalidPayload => {
  const ruta = formato(error.issue).issues[0]?.path ?? []
  const campo = ruta.map((p) => String(typeof p === 'object' ? p.key : p)).join('.')
  return new InvalidPayload({ reason: 'campo_invalido', field: campo === '' ? null : campo })
}

/** Rolling distros report no version or a build date (Arch VERSION_ID "20261004.0.606936"). */
const versionDistribucion = (version: string | null): string => {
  const v = version?.trim() ?? ''
  return v === '' || /^\d{8}/.test(v) ? 'rolling' : v
}
