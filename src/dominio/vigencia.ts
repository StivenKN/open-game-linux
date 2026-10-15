// The one home of the 365-day window. Callers pass the reference instant: OpenGame's reports use the
// request time, ProtonDB's export uses its own export date. Nothing in dominio reads the clock.
const DIAS_VIGENCIA = 365
const MS_POR_DIA = 86_400_000

/** No upper bound: a test dated after `referencia` is still vigente. */
export const esVigente = (fecha: Date, referencia: Date): boolean =>
  fecha.getTime() >= referencia.getTime() - DIAS_VIGENCIA * MS_POR_DIA
