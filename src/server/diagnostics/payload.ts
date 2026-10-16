import { Effect, Option, Result, Schema, SchemaIssue } from 'effect'
import { Capture, type DiagnosticInput } from '../../domain/contributions.ts'
import { InvalidPayload } from '../../domain/errors.ts'
import { type SteamLibrary, isSteamTool, MAX_LIBRARY_GAMES } from '../../domain/library.ts'
import { OperatingSystem, VulkanSupport } from '../../domain/evaluation.ts'
import { PciId, vendorOf, type GpuVendor } from '../../domain/gpu.ts'
import { maxLengths } from '../../domain/max-lengths.ts'
import { Diagnostic, Distribution } from '../../domain/tables.ts'

export const SCHEMA_VERSION = 1

const SentGame = Schema.Struct({ app_id: Schema.Number, nombre: Schema.String })

const commonFields = {
  version_esquema: Schema.Literal(SCHEMA_VERSION),
  capturado_en: Schema.String,
  version_sistema: Schema.String,
  arquitectura: Schema.String,
  cpu_modelo: Schema.NullOr(Schema.String), // ARM kernels may not name the CPU
  gpu_modelo: Schema.NullOr(Schema.String),
  gpu_pci_id: Schema.optionalKey(Schema.Unknown),
  ram_mb: Schema.Int,
  vram_mb: Schema.NullOr(Schema.Int),
  biblioteca_steam: Schema.optionalKey(Schema.NullOr(Schema.Array(SentGame))),
}

const PayloadV1 = {
  Linux: Schema.Struct({
    ...commonFields,
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
  Windows: Schema.Struct({ ...commonFields, sistema: Schema.Literal('Windows') }),
} satisfies Record<OperatingSystem, Schema.Top>

const isOperatingSystem = Schema.is(OperatingSystem)

export const parsePayload = (text: string): Result.Result<Capture, InvalidPayload> =>
  Result.gen(function* () {
    const json = yield* jsonBody(text)
    const value = yield* Result.mapError(Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Unknown))(json), () => unreadable)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return yield* Result.fail(unreadable)
    if (!('version_esquema' in value) || value.version_esquema !== SCHEMA_VERSION)
      return yield* Result.fail(new InvalidPayload({ reason: 'version_esquema', field: 'version_esquema' }))
    if (!('sistema' in value) || !isOperatingSystem(value.sistema)) return yield* Result.fail(new InvalidPayload({ reason: 'campo_invalido', field: 'sistema' }))
    const p = yield* Result.mapError(Schema.decodeUnknownResult(PayloadV1[value.sistema])(value), invalidField)
    const pci = pciId(p.gpu_pci_id)
    const common = {
      capturado_en: p.capturado_en,
      version_sistema: p.version_sistema,
      arquitectura: p.arquitectura,
      cpu_modelo: p.cpu_modelo ?? 'CPU no detectada',
      gpu_modelo: p.gpu_modelo ?? (pci === null ? 'GPU no detectada' : pciLabel(pci)),
      gpu_pci_id: pci,
      ram_mb: p.ram_mb,
      vram_mb: p.vram_mb,
      biblioteca_steam: p.biblioteca_steam === undefined || p.biblioteca_steam === null ? null : libraryOf(p.biblioteca_steam),
    }
    const candidate: typeof Capture.Encoded =
      p.sistema === 'Linux'
        ? {
            ...common,
            sistema: 'Linux',
            distribucion: { nombre: p.distribucion.nombre, version: distributionVersion(p.distribucion.version) },
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
        : { ...common, sistema: 'Windows' }
    return yield* fitsColumns(yield* Result.mapError(Schema.decodeResult(Capture)(candidate), invalidField))
  })

/** jsonb rejects \u0000 and unpaired surrogates. */
const libraryOf = (games: ReadonlyArray<typeof SentGame.Type>): typeof SteamLibrary.Encoded => {
  const seen = new Set<number>()
  return games
    .flatMap(({ app_id, nombre }) => {
      const readable = nombre.toWellFormed().replace(/\p{Cc}/gu, '').trim()
      const cleaned = readable.slice(0, maxLengths.biblioteca.nombre).replace(/[\uD800-\uDBFF]$/, '').trim()
      if (cleaned === '' || isSteamTool(cleaned) || !Number.isSafeInteger(app_id) || app_id <= 0 || seen.has(app_id)) return []
      seen.add(app_id)
      return [{ app_id, nombre: cleaned }]
    })
    .slice(0, MAX_LIBRARY_GAMES)
}

export const captureOf = (input: DiagnosticInput): Effect.Effect<Capture, InvalidPayload> =>
  Effect.fromResult(
    input._tag === 'manual'
      ? fitsColumns({ ...input.captura, gpu_pci_id: null, biblioteca_steam: null, nivel_x86: null, arranque_seguro: null, tpm: null, zram_mb: null, swap_mb: null })
      : parsePayload(input.texto),
  )

const Columns = Schema.Struct({
  version_sistema: Diagnostic.fields.version_sistema,
  arquitectura: Diagnostic.fields.arquitectura,
  cpu_modelo: Diagnostic.fields.cpu_modelo,
  gpu_modelo: Diagnostic.fields.gpu_modelo,
  controlador: Schema.optionalKey(Diagnostic.fields.controlador),
  version_controlador: Schema.optionalKey(Diagnostic.fields.version_controlador),
  version_vulkan: Schema.optionalKey(Diagnostic.fields.version_vulkan),
  distribucion: Schema.optionalKey(Schema.Struct({ nombre: Distribution.fields.nombre, version: Distribution.fields.version })),
})

const fitsColumns = (capture: Capture): Result.Result<Capture, InvalidPayload> =>
  Result.map(Result.mapError(Schema.decodeUnknownResult(Columns)(capture), invalidField), () => capture)

const pciId = (value: unknown): PciId | null =>
  Option.getOrNull(Schema.decodeUnknownOption(PciId)(typeof value === 'string' ? value.trim().toLowerCase() : value))

const vendorNames = { '8086': 'Intel', '1002': 'AMD', '10de': 'NVIDIA' } as const satisfies Record<GpuVendor, string>

const pciLabel = (pci: PciId): string => {
  const vendor = vendorOf(pci)
  return vendor === null ? `GPU [${pci}]` : `${vendorNames[vendor]} GPU [${pci}]`
}

const unreadable = new InvalidPayload({ reason: 'ilegible', field: null })

const jsonBody = (text: string): Result.Result<string, InvalidPayload> => {
  const trimmed = text.trim()
  const anchor = trimmed.indexOf('#d=')
  const body = anchor === -1 ? trimmed : trimmed.slice(anchor + 3)
  if (body.startsWith('{')) return Result.succeed(body)
  // Buffer's base64url decoder skips invalid characters instead of failing, so reject them first.
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(body)) return Result.fail(unreadable)
  return Result.succeed(Buffer.from(body, 'base64url').toString('utf8'))
}

const formatter = SchemaIssue.makeFormatterStandardSchemaV1()

const invalidField = (error: Schema.SchemaError): InvalidPayload => {
  const path = formatter(error.issue).issues[0]?.path ?? []
  const field = path.map((p) => String(typeof p === 'object' ? p.key : p)).join('.')
  return new InvalidPayload({ reason: 'campo_invalido', field: field === '' ? null : field })
}

/** Rolling distros report no version or a build date (Arch VERSION_ID "20261004.0.606936"). */
const distributionVersion = (version: string | null): string => {
  const v = version?.trim() ?? ''
  return v === '' || /^\d{8}/.test(v) ? 'rolling' : v
}
