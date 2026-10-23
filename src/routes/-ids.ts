// Path params arrive as text. A segment that is not an id names no page, so parsing it throws the
// router's notFound() (router-core keeps a thrown notFound as such) instead of an error page.
import { notFound } from '@tanstack/react-router'
import { Option, Schema } from 'effect'

/** The id a path segment names, if it names one. Server handlers answer None with their own 404. */
export const routeId = <T extends number>(id: Schema.Codec<T, number>) => {
  const decode = Schema.decodeUnknownOption(Schema.NumberFromString.pipe(Schema.decodeTo(id)))
  return (text: string): Option.Option<T> => (/^[1-9]\d*$/.test(text) ? decode(text) : Option.none())
}

export const routeIdParser = <T extends number>(id: Schema.Codec<T, number>) => {
  const parse = routeId(id)
  return (text: string): T => Option.getOrThrowWith(parse(text), () => notFound())
}
