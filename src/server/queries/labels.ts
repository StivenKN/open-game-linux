import { demoDomain } from '../auth.ts'

export const layerLabel = (vc: string) => `${vc}.familia || ' ' || ${vc}.version || ' (' || ${vc}.variante || ')'`

export const distributionLabel = (d: string) => `${d}.nombre || ' ' || ${d}.version`

export const profileLabel = (p: string) => `${p}.titulo || ' r' || ${p}.revision`

export const isDemo = (u: string) => `${u}.correo LIKE '%@${demoDomain}'`
