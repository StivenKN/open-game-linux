// ProtonDB's monthly export as external evidence. Nothing here feeds ApprovedTest, statusOf or summarize.
import { Option, Schema } from 'effect'
import type { EditionId } from './ids.ts'
import { maxLengths } from './max-lengths.ts'
import { ProtonVariant } from './literals.ts'
import type { ProtonDbSummary } from './tables.ts'
import { isRecent } from './recency.ts'

export type ProtonLayer = { readonly variant: ProtonVariant; readonly version: string | null }

export type ProtonDbReport = {
  readonly app_id: string
  readonly reported_at: Date
  readonly works: boolean
  readonly modest_machine: boolean
  readonly layer: ProtonLayer | null
  /** The export has no report id; (appId, timestamp, gpu) is the measured duplicate key. */
  readonly fingerprint: string
}

const OptionalText = Schema.optionalKey(Schema.NullOr(Schema.String))

const ExportedRecord = Schema.Struct({
  // About 8% of the records carry the appId as a number.
  app: Schema.Struct({ steam: Schema.Struct({ appId: Schema.Union([Schema.String, Schema.Int]) }) }),
  timestamp: Schema.Int,
  systemInfo: Schema.Struct({ gpu: OptionalText, ram: OptionalText }),
  responses: Schema.Struct({
    verdict: Schema.Literals(['yes', 'no']),
    variant: OptionalText,
    customProtonVersion: OptionalText,
    protonVersion: OptionalText,
  }),
})

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(ExportedRecord))
const isVariant = Schema.is(ProtonVariant)

const ramGb = (ram: string): number | null => {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(gb?|mb?)\b/i.exec(ram)
  if (m === null) return null
  const n = Number(m[1])
  return m[2]?.toLowerCase().startsWith('g') ? n : n / 1024
}

const isModest = (ram: string | null | undefined, gpu: string | null | undefined): boolean => {
  const gb = ram ? ramGb(ram) : null
  return (gb !== null && gb <= 8) || (gpu !== null && gpu !== undefined && gpu.includes('Intel') && !/\bArc\b/.test(gpu))
}

// A version longer than the column is junk, not something to truncate into a real one.
const versionOf = (...candidates: ReadonlyArray<string | null | undefined>): string | null => {
  const version = candidates.map((v) => v?.trim()).find((v) => v !== undefined && v !== '')
  return version === undefined || version.length > maxLengths.protondb_resumen.capa_version ? null : version
}

/** One element of the export's top-level array, as JSON text. None when it is not a usable report. */
export const parseReport = (text: string): Option.Option<ProtonDbReport> =>
  Option.map(decode(text), ({ app, timestamp, systemInfo: { gpu, ram }, responses: r }) => ({
    app_id: String(app.steam.appId),
    reported_at: new Date(timestamp * 1000),
    works: r.verdict === 'yes',
    modest_machine: isModest(ram, gpu),
    layer: isVariant(r.variant) ? { variant: r.variant, version: versionOf(r.customProtonVersion, r.protonVersion) } : null,
    fingerprint: `${timestamp}|${gpu ?? ''}`,
  }))

/**
 * The stored aggregate for one Steam edition. "Recent" means the year before the export's own date, so
 * the numbers stay what that export said however long ago it was imported.
 */
export const summarizeProtonDb = (
  edicion_id: EditionId,
  reports: readonly [ProtonDbReport, ...ProtonDbReport[]],
  exportado_en: Date,
): ProtonDbSummary => {
  const unique = [...new Map(reports.map((r) => [r.fingerprint, r])).values()]
  const recent = unique.filter((r) => isRecent(r.reported_at, exportado_en))
  const working = recent.filter((r) => r.works)
  const modest = recent.filter((r) => r.modest_machine)
  const layer = mostUsedLayer(working)
  return {
    edicion_id,
    exportado_en,
    reportes_total: unique.length,
    recientes: recent.length,
    recientes_funcionan: working.length,
    modestos_recientes: modest.length,
    modestos_funcionan: modest.filter((r) => r.works).length,
    ultimo_reporte: new Date(unique.reduce((n, r) => Math.max(n, r.reported_at.getTime()), 0)),
    capa_variante: layer?.variant ?? null,
    capa_version: layer?.version ?? null,
    capa_reportes: layer?.reports ?? 0,
  }
}

// Ties go to the alphabetically first layer, so the same export always stores the same row.
const mostUsedLayer = (reports: ReadonlyArray<ProtonDbReport>) => {
  const counts = new Map<string, ProtonLayer & { readonly reports: number }>()
  for (const { layer } of reports) {
    if (layer === null) continue
    const key = `${layer.variant} ${layer.version ?? ''}`
    counts.set(key, { ...layer, reports: (counts.get(key)?.reports ?? 0) + 1 })
  }
  return [...counts.entries()].sort(([a, x], [b, y]) => y.reports - x.reports || (a < b ? -1 : 1))[0]?.[1] ?? null
}
