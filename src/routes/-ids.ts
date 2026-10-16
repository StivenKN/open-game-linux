// Path params arrive as text. A segment that is not an id names no page, so parsing it throws the
// router's notFound() (router-core keeps a thrown notFound as such) instead of an error page.
import { notFound } from '@tanstack/react-router'
import { Option, Schema } from 'effect'

export const routeIdParser = <T extends number>(id: Schema.Codec<T, number>) => {
  const decode = Schema.decodeUnknownOption(Schema.NumberFromString.pipe(Schema.decodeTo(id)))
  return (text: string): T => Option.getOrThrowWith(/^[1-9]\d*$/.test(text) ? decode(text) : Option.none(), () => notFound())
}
