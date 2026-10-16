import { demoDomain } from '../auth.ts'

export const layerLabel = (vc: string) => `${vc}.family || ' ' || ${vc}.version || ' (' || ${vc}.variant || ')'`

export const distributionLabel = (d: string) => `${d}.name || ' ' || ${d}.version`

export const profileLabel = (p: string) => `${p}.title || ' r' || ${p}.revision`

export const isDemo = (u: string) => `${u}.email LIKE '%@${demoDomain}'`
