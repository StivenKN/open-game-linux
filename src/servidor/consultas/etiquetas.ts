import { dominioDemo } from '../auth.ts'

export const etiquetaCapa = (vc: string) => `${vc}.familia || ' ' || ${vc}.version || ' (' || ${vc}.variante || ')'`

export const etiquetaDistribucion = (d: string) => `${d}.nombre || ' ' || ${d}.version`

export const etiquetaPerfil = (p: string) => `${p}.titulo || ' r' || ${p}.revision`

export const esDemo = (u: string) => `${u}.correo LIKE '%@${dominioDemo}'`
