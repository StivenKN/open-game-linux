import { Effect, Option, Result, Schema, SchemaIssue } from 'effect'
import { Capture, type DiagnosticInput, type ManualCapture } from '../../domain/contributions.ts'
import { InvalidPayload } from '../../domain/errors.ts'
import { type SteamLibrary, isSteamTool, MAX_LIBRARY_GAMES } from '../../domain/library.ts'
import { OperatingSystem, VulkanSupport } from '../../domain/evaluation.ts'
import { PciId, vendorOf, type GpuVendor } from '../../domain/gpu.ts'
import { maxLengths } from '../../domain/max-lengths.ts'
import type { SteamGame } from '../../domain/steam-game.ts'
import { Diagnostic, Distribution } from '../../domain/tables.ts'

export const SCHEMA_VERSION = 1

const SentGame = Schema.Struct({ app_id: Schema.Number, nombre: Schema.String })

// Report mode (`--game`): what Steam runs one game with.
const SentSteamGame = Schema.Struct({
  app_id: Schema.Number,
  herramienta: Schema.NullOr(Schema.String),
  version_herramienta: Schema.NullOr(Schema.String),
  opciones_lanzamiento: Schema.NullOr(Schema.String),
  build: Schema.NullOr(Schema.String),
  nativo: Schema.Boolean,
  cuenta_supuesta: Schema.Boolean,
})

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
  dispositivo: Schema.optionalKey(Diagnostic.fields.device),
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
    nivel_x86: Schema.optionalKey(Diagnostic.fields.x86_level),
    arranque_seguro: Schema.optionalKey(Diagnostic.fields.secure_boot),
    tpm: Schema.optionalKey(Diagnostic.fields.tpm),
    zram_mb: Schema.optionalKey(Diagnostic.fields.zram_mb),
    swap_mb: Schema.optionalKey(Diagnostic.fields.swap_mb),
    juego: Schema.optionalKey(Schema.NullOr(SentSteamGame)),
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
      captured_at: p.capturado_en,
      os_version: p.version_sistema,
      architecture: p.arquitectura,
      cpu_model: p.cpu_modelo ?? 'CPU no detectada',
      gpu_model: p.gpu_modelo ?? (pci === null ? 'GPU no detectada' : pciLabel(pci)),
      gpu_pci_id: pci,
      ram_mb: p.ram_mb,
      vram_mb: p.vram_mb,
      steam_library: p.biblioteca_steam === undefined || p.biblioteca_steam === null ? null : libraryOf(p.biblioteca_steam),
      device: p.dispositivo ?? null,
    }
    const candidate: typeof Capture.Encoded =
      p.sistema === 'Linux'
        ? {
            ...common,
            operating_system: 'Linux',
            distribution: { name: p.distribucion.nombre, version: distributionVersion(p.distribucion.nombre, p.distribucion.version) },
            driver: p.controlador,
            driver_version: p.version_controlador,
            vulkan_support: p.soporte_vulkan,
            vulkan_version: p.soporte_vulkan === 'si' ? p.version_vulkan : null,
            x86_level: p.nivel_x86 ?? null,
            secure_boot: p.arranque_seguro ?? null,
            tpm: p.tpm ?? null,
            zram_mb: p.zram_mb ?? null,
            swap_mb: p.swap_mb ?? null,
            steam_game: p.juego === undefined || p.juego === null ? null : steamGameOf(p.juego),
          }
        : { ...common, operating_system: 'Windows' }
    return yield* fitsColumns(yield* Result.mapError(Schema.decodeResult(Capture)(candidate), invalidCaptureField))
  })

/** jsonb rejects \u0000 and unpaired surrogates. */
const libraryOf = (games: ReadonlyArray<typeof SentGame.Type>): typeof SteamLibrary.Encoded => {
  const seen = new Set<number>()
  return games
    .flatMap(({ app_id, nombre }) => {
      const readable = nombre.toWellFormed().replace(/\p{Cc}/gu, '').trim()
      const cleaned = readable.slice(0, maxLengths.library.name).replace(/[\uD800-\uDBFF]$/, '').trim()
      if (cleaned === '' || isSteamTool(cleaned) || !Number.isSafeInteger(app_id) || app_id <= 0 || seen.has(app_id)) return []
      seen.add(app_id)
      return [{ app_id, nombre: cleaned }]
    })
    .slice(0, MAX_LIBRARY_GAMES)
}

const textOrNull = (text: string | null) => {
  const trimmed = text?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

const steamGameOf = (g: typeof SentSteamGame.Type): typeof SteamGame.Encoded => ({
  app_id: g.app_id,
  tool: textOrNull(g.herramienta),
  tool_version: textOrNull(g.version_herramienta),
  launch_options: textOrNull(g.opciones_lanzamiento),
  build_id: textOrNull(g.build),
  native: g.nativo,
  guessed_account: g.cuenta_supuesta,
})

export const captureOf = (input: DiagnosticInput): Effect.Effect<Capture, InvalidPayload> =>
  Effect.fromResult(input._tag === 'manual' ? fitsColumns(manualCapture(input.captura)) : parsePayload(input.texto))

const manualCapture = (m: ManualCapture): Capture => {
  const common = {
    captured_at: m.capturado_en,
    os_version: m.version_sistema,
    architecture: m.arquitectura,
    cpu_model: m.cpu_modelo,
    gpu_model: m.gpu_modelo,
    ram_mb: m.ram_mb,
    vram_mb: m.vram_mb,
    gpu_pci_id: null,
    steam_library: null,
    x86_level: null,
    secure_boot: null,
    tpm: null,
    zram_mb: null,
    swap_mb: null,
    device: m.dispositivo,
  }
  return m.sistema === 'Linux'
    ? {
        ...common,
        operating_system: 'Linux',
        distribution: { name: m.distribucion.nombre, version: m.distribucion.version },
        driver: m.controlador,
        driver_version: m.version_controlador,
        vulkan_support: m.soporte_vulkan,
        vulkan_version: m.version_vulkan,
        steam_game: null,
      }
    : { ...common, operating_system: 'Windows' }
}

const Columns = Schema.Struct({
  os_version: Diagnostic.fields.os_version,
  architecture: Diagnostic.fields.architecture,
  cpu_model: Diagnostic.fields.cpu_model,
  gpu_model: Diagnostic.fields.gpu_model,
  driver: Schema.optionalKey(Diagnostic.fields.driver),
  driver_version: Schema.optionalKey(Diagnostic.fields.driver_version),
  vulkan_version: Schema.optionalKey(Diagnostic.fields.vulkan_version),
  distribution: Schema.optionalKey(Schema.Struct({ name: Distribution.fields.name, version: Distribution.fields.version })),
})

const fitsColumns = (capture: Capture): Result.Result<Capture, InvalidPayload> =>
  Result.map(Result.mapError(Schema.decodeUnknownResult(Columns)(capture), invalidCaptureField), () => capture)

const payloadNameOf: Record<string, string> = {
  captured_at: 'capturado_en',
  operating_system: 'sistema',
  os_version: 'version_sistema',
  architecture: 'arquitectura',
  cpu_model: 'cpu_modelo',
  gpu_model: 'gpu_modelo',
  driver: 'controlador',
  driver_version: 'version_controlador',
  vulkan_support: 'soporte_vulkan',
  vulkan_version: 'version_vulkan',
  distribution: 'distribucion',
  name: 'nombre',
  x86_level: 'nivel_x86',
  secure_boot: 'arranque_seguro',
  steam_library: 'biblioteca_steam',
  device: 'dispositivo',
  steam_game: 'juego',
}

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

const invalidField = (error: Schema.SchemaError, name = (key: string) => key): InvalidPayload => {
  const path = formatter(error.issue).issues[0]?.path ?? []
  const field = path.map((p) => name(String(typeof p === 'object' ? p.key : p))).join('.')
  return new InvalidPayload({ reason: 'campo_invalido', field: field === '' ? null : field })
}

const invalidCaptureField = (error: Schema.SchemaError) => invalidField(error, (key) => payloadNameOf[key] ?? key)

/**
 * Rolling distros report no version or a build date (Arch VERSION_ID "20261004.0.606936"). SteamOS reports its
 * point release ("3.7.13"), out every few weeks, so it keeps the minor release like other distros do.
 */
const distributionVersion = (name: string, version: string | null): string => {
  const v = version?.trim() ?? ''
  if (v === '' || /^\d{8}/.test(v)) return 'rolling'
  return name === 'SteamOS' ? v.replace(/^(\d+\.\d+)\..*$/, '$1') : v
}
