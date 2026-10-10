// Read models for /diagnostico (9.2): the honest "matriz" of games for one set of capacities.
// The matrix shows computed compatibility + hardware evaluation per game. No FPS estimate exists;
// only FPS measured in approved reports (veredicto variant 1, part B).
import { Effect, Schema } from 'effect'
import { SqlClient, SqlError } from 'effect/sql'
import type { Captura, EntradaDiagnostico } from '../../dominio/aportes.ts'
import type { EstadoCompatibilidad, FpsMedido } from '../../dominio/compatibilidad.ts'
import type { ColumnasCapacidad, Evaluacion } from '../../dominio/evaluacion.ts'
import { NoAutenticado, NoEncontrado, PayloadInvalido } from '../../dominio/fallos.ts'
import type { DiagnosticoId, JuegoId } from '../../dominio/ids.ts'
import { Visitante } from '../auth.ts'

type Infra = SqlError.SqlError | Schema.SchemaError

export type FilaMatriz = {
  readonly juego_id: JuegoId
  readonly titulo: string
  readonly estado: EstadoCompatibilidad // estadoDe over approved reports
  readonly pruebas: number
  readonly pendientes: number
  readonly fps_medido: FpsMedido | null // best-matching approved measurement, labeled "medido por la comunidad"
  readonly en_tu_distribucion: EstadoCompatibilidad | null // variant 2's line
  readonly evaluacion: Evaluacion | null // vs the best approved profile; null when no approved profile states conditions
}

/** Same rows for a saved diagnosis and for a guest's unsaved capture. */
const matriz = (c: ColumnasCapacidad & { readonly distribucion: { readonly nombre: string; readonly version: string } | null }): Effect.Effect<ReadonlyArray<FilaMatriz>, Infra, SqlClient.SqlClient> => {
  void c
  return Effect.die('not implemented')
}

/**
 * Guest-friendly (main persona is still on Windows): parse on the server, evaluate, return.
 * Stores nothing, not even in a session. Saving needs login and goes through registrarDiagnostico.
 */
export const evaluarSinGuardar = (entrada: EntradaDiagnostico): Effect.Effect<{ readonly captura: Captura; readonly matriz: ReadonlyArray<FilaMatriz> }, PayloadInvalido | Infra, SqlClient.SqlClient> => {
  // capturaDe(entrada) -> matriz(captura). Called through `accion`, so PayloadInvalido reaches the paste box as data.
  void entrada
  void matriz
  return Effect.die('not implemented')
}

/** /diagnosticos/$id: owner only (8.9 "el diagnóstico detallado es privado"); others get NoEncontrado. */
export const miDiagnostico = (id: DiagnosticoId): Effect.Effect<{ readonly captura: Captura; readonly equipo: string; readonly matriz: ReadonlyArray<FilaMatriz> }, NoAutenticado | NoEncontrado | Infra, SqlClient.SqlClient | Visitante> => {
  void id
  return Effect.die('not implemented')
}

/** /diagnostico for a logged-in user: their equipos with capture history (8.11 "varios diagnósticos históricos"). */
export const misEquipos = (): Effect.Effect<ReadonlyArray<{ readonly id: number; readonly alias: string; readonly diagnosticos: ReadonlyArray<{ readonly id: DiagnosticoId; readonly capturado_en: Date; readonly resumen: string }> }>, Infra, SqlClient.SqlClient | Visitante> =>
  Effect.die('not implemented')
