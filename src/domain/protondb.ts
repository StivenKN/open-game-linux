// ProtonDB's monthly export as external evidence. Nothing here feeds PruebaAprobada, estadoDe or resumir.
import { Option, Schema } from 'effect'
import type { EdicionId } from './ids.ts'
import { largo } from './max-lengths.ts'
import { VarianteProton } from './literals.ts'
import type { ProtonDbResumen } from './tables.ts'
import { esVigente } from './recency.ts'

export type CapaProton = { readonly variante: VarianteProton; readonly version: string | null }

export type ReporteProtonDb = {
  readonly app_id: string
  readonly reportado_en: Date
  readonly funciona: boolean
  readonly equipo_modesto: boolean
  readonly capa: CapaProton | null
  /** The export has no report id; (appId, timestamp, gpu) is the measured duplicate key. */
  readonly huella: string
}

const TextoOpcional = Schema.optionalKey(Schema.NullOr(Schema.String))

const RegistroExportado = Schema.Struct({
  // About 8% of the records carry the appId as a number.
  app: Schema.Struct({ steam: Schema.Struct({ appId: Schema.Union([Schema.String, Schema.Int]) }) }),
  timestamp: Schema.Int,
  systemInfo: Schema.Struct({ gpu: TextoOpcional, ram: TextoOpcional }),
  responses: Schema.Struct({
    verdict: Schema.Literals(['yes', 'no']),
    variant: TextoOpcional,
    customProtonVersion: TextoOpcional,
    protonVersion: TextoOpcional,
  }),
})

const decodificar = Schema.decodeUnknownOption(Schema.fromJsonString(RegistroExportado))
const esVariante = Schema.is(VarianteProton)

const ramGb = (ram: string): number | null => {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(gb?|mb?)\b/i.exec(ram)
  if (m === null) return null
  const n = Number(m[1])
  return m[2]?.toLowerCase().startsWith('g') ? n : n / 1024
}

const esModesto = (ram: string | null | undefined, gpu: string | null | undefined): boolean => {
  const gb = ram ? ramGb(ram) : null
  return (gb !== null && gb <= 8) || (gpu !== null && gpu !== undefined && gpu.includes('Intel') && !/\bArc\b/.test(gpu))
}

// A version longer than the column is junk, not something to truncate into a real one.
const versionDe = (...candidatas: ReadonlyArray<string | null | undefined>): string | null => {
  const version = candidatas.map((v) => v?.trim()).find((v) => v !== undefined && v !== '')
  return version === undefined || version.length > largo.protondb_resumen.capa_version ? null : version
}

/** One element of the export's top-level array, as JSON text. None when it is not a usable report. */
export const interpretarReporte = (texto: string): Option.Option<ReporteProtonDb> =>
  Option.map(decodificar(texto), ({ app, timestamp, systemInfo: { gpu, ram }, responses: r }) => ({
    app_id: String(app.steam.appId),
    reportado_en: new Date(timestamp * 1000),
    funciona: r.verdict === 'yes',
    equipo_modesto: esModesto(ram, gpu),
    capa: esVariante(r.variant) ? { variante: r.variant, version: versionDe(r.customProtonVersion, r.protonVersion) } : null,
    huella: `${timestamp}|${gpu ?? ''}`,
  }))

/**
 * The stored aggregate for one Steam edition. "Recent" means the year before the export's own date, so
 * the numbers stay what that export said however long ago it was imported.
 */
export const resumirProtonDb = (
  edicion_id: EdicionId,
  reportes: readonly [ReporteProtonDb, ...ReporteProtonDb[]],
  exportado_en: Date,
): ProtonDbResumen => {
  const unicos = [...new Map(reportes.map((r) => [r.huella, r])).values()]
  const recientes = unicos.filter((r) => esVigente(r.reportado_en, exportado_en))
  const funcionan = recientes.filter((r) => r.funciona)
  const modestos = recientes.filter((r) => r.equipo_modesto)
  const capa = capaMasUsada(funcionan)
  return {
    edicion_id,
    exportado_en,
    reportes_total: unicos.length,
    recientes: recientes.length,
    recientes_funcionan: funcionan.length,
    modestos_recientes: modestos.length,
    modestos_funcionan: modestos.filter((r) => r.funciona).length,
    ultimo_reporte: new Date(unicos.reduce((n, r) => Math.max(n, r.reportado_en.getTime()), 0)),
    capa_variante: capa?.variante ?? null,
    capa_version: capa?.version ?? null,
    capa_reportes: capa?.reportes ?? 0,
  }
}

// Ties go to the alphabetically first layer, so the same export always stores the same row.
const capaMasUsada = (reportes: ReadonlyArray<ReporteProtonDb>) => {
  const conteo = new Map<string, CapaProton & { readonly reportes: number }>()
  for (const { capa } of reportes) {
    if (capa === null) continue
    const clave = `${capa.variante} ${capa.version ?? ''}`
    conteo.set(clave, { ...capa, reportes: (conteo.get(clave)?.reportes ?? 0) + 1 })
  }
  return [...conteo.entries()].sort(([a, x], [b, y]) => y.reportes - x.reportes || (a < b ? -1 : 1))[0]?.[1] ?? null
}
