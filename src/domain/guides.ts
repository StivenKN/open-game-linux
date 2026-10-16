import { Schema } from 'effect'

export const GuideType = Schema.Literals(['eleccion_distribucion', 'instalacion', 'arranque_dual'])
export type GuideType = typeof GuideType.Type

export const GuideStatus = Schema.Literals(['borrador', 'publicada', 'archivada'])
export type GuideStatus = typeof GuideStatus.Type
