// Read model of the review queue (RF-10). Reviewers only.
import { Effect, Schema } from 'effect'
import { SqlClient, SqlError } from 'effect/sql'
import { NoAutenticado, SinPermiso } from '../../dominio/fallos.ts'
import type { AporteRef, Bloqueo, TipoAporte } from '../../dominio/revision.ts'
import { exigirRevisor, Visitante } from '../auth.ts'
import { bloqueosAprobacion } from '../aportes/revision.ts'

export type ElementoCola = {
  readonly ref: AporteRef
  readonly titulo: string // "Reporte · GTA V · Linux Mint 21.3 · Proton 8.0-5 · funciona"
  readonly autor: string // alias
  readonly creado_en: Date
  readonly es_propio: boolean // the reviewer authored it: the UI hides the buttons, decidir rejects anyway
  readonly bloqueos: ReadonlyArray<Bloqueo> // same function decidir runs; explains a disabled "Aprobar"
  readonly detalle: string // observaciones / instrucciones / steps summary, for the reviewer to judge evidence
}

/** Pending rows of one tipo, oldest first. */
export const cola = (
  tipo: TipoAporte,
): Effect.Effect<ReadonlyArray<ElementoCola>, NoAutenticado | SinPermiso | SqlError.SqlError | Schema.SchemaError, SqlClient.SqlClient | Visitante> =>
  Effect.gen(function* () {
    yield* exigirRevisor
    void tipo
    void bloqueosAprobacion
    return yield* Effect.die('not implemented')
  })
