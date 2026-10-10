// SQL expressions every read model shares, so a page never names a layer or a distribution its own way.
// Each takes the alias the caller gave the table and goes into a query through `sql.literal`.
import { dominioDemo } from '../auth.ts'

/** "Proton 8.0-5 (Valve)", "Nativo 3.0 (Steam Linux Runtime)": one label for a version_capa row. */
export const etiquetaCapa = (vc: string) => `${vc}.familia || ' ' || ${vc}.version || ' (' || ${vc}.variante || ')'`

/** "Linux Mint 21.3", "Arch Linux rolling". */
export const etiquetaDistribucion = (d: string) => `${d}.nombre || ' ' || ${d}.version`

/** "GTA V en gráficos bajos r1": a profile is always named with its revision. */
export const etiquetaPerfil = (p: string) => `${p}.titulo || ' r' || ${p}.revision`

/**
 * True when the author is a demo account, which is how a page knows to say "Datos de ejemplo"
 * (RATIONALE, U3 reconciliation). The correo itself never leaves the query (8.9 privacy).
 */
export const esDemo = (u: string) => `${u}.correo LIKE '%@${dominioDemo}'`
