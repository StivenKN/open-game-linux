// The one home of the 365-day window. Callers pass the reference instant: OpenGame's reports use the
// request time, ProtonDB's export uses its own export date. Nothing in domain/ reads the clock.
const RECENCY_DAYS = 365
const MS_PER_DAY = 86_400_000

/** No upper bound: a test dated after `reference` is still recent. */
export const isRecent = (date: Date, reference: Date): boolean =>
  date.getTime() >= reference.getTime() - RECENCY_DAYS * MS_PER_DAY
