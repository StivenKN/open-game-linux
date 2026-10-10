// Path params arrive as text. A segment that is not an id names no page, so parsing it throws the
// router's notFound() (router-core keeps a thrown notFound as such) instead of an error page.
import { notFound } from '@tanstack/react-router'
import { Option, Schema } from 'effect'
import { IdDesdeTexto } from '../dominio/ids.ts'

export const idDeRuta = <T extends number>(id: Schema.Codec<T, number>) => {
  const decodificar = Schema.decodeUnknownOption(IdDesdeTexto(id))
  return (texto: string): T => Option.getOrThrowWith(decodificar(texto), () => notFound())
}
