// guia_adopcion vocabularies (RF-09). Guides are authored by seeders this delivery; only `publicada` is public.
import { Schema } from 'effect'

export const TipoGuia = Schema.Literals(['eleccion_distribucion', 'instalacion', 'arranque_dual'])
export type TipoGuia = typeof TipoGuia.Type

export const EstadoGuia = Schema.Literals(['borrador', 'publicada', 'archivada'])
export type EstadoGuia = typeof EstadoGuia.Type
