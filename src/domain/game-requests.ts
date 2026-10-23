import { Schema } from 'effect'

/** A request stays abierto, gathering requesters, until a reviewer creates its game (cumplido) or rejects it. */
export const GameRequestStatus = Schema.Literals(['abierto', 'cumplido', 'rechazado'])
export type GameRequestStatus = typeof GameRequestStatus.Type
