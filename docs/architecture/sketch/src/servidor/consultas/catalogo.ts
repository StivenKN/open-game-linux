// Read models for the catalog (9.1), the profile page (9.4 replacement), guides (RF-09), and the
// report form's options. Each program's success type is its page data type.
import { Effect, Schema } from 'effect'
import { SqlClient, SqlError } from 'effect/sql'
import { estadoDe, EstadoCompatibilidad, Resultado } from '../../dominio/compatibilidad.ts'
import type { FiltroCatalogo } from '../../dominio/aportes.ts'
import type { Evaluacion } from '../../dominio/evaluacion.ts'
import { NoAutenticado, NoEncontrado } from '../../dominio/fallos.ts'
import { GuiaId, JuegoId, PerfilId } from '../../dominio/ids.ts'
import { Visitante } from '../auth.ts'

type Lectura<A, E = never> = Effect.Effect<A, E | SqlError.SqlError | Schema.SchemaError, SqlClient.SqlClient | Visitante>

/**
 * One aggregate row per game: the DISTINCT approved results. `estadoDe` (the same rule as the ficha)
 * turns it into the card state in TS; no SQL CASE copies the rule. Filters q (ILIKE), lanzador and
 * sin_anti_cheat (no approved report with fallo anti_cheat) run in SQL; `estado` filters after estadoDe.
 */
const FilaCatalogo = Schema.Struct({
  id: JuegoId,
  titulo: Schema.String,
  lanzadores: Schema.Array(Schema.String),
  resultados: Schema.Array(Resultado),
  pruebas: Schema.Int,
  pendientes: Schema.Int,
  ultima_prueba: Schema.NullOr(Schema.Date),
  causas: Schema.Array(Schema.String),
})

export type JuegoEnCatalogo = Omit<typeof FilaCatalogo.Type, 'resultados'> & { readonly estado: EstadoCompatibilidad }

export const catalogo = (filtro: FiltroCatalogo): Lectura<{
  readonly juegos: ReadonlyArray<JuegoEnCatalogo>
  /** The four home counters, computed from approved rows (round 1 cut: no live "nodos activos"). */
  readonly contadores: { readonly juegos: number; readonly reportes_aprobados: number; readonly perfiles_aprobados: number; readonly distribuciones: number }
}> => {
  void filtro
  void estadoDe
  return Effect.die('not implemented')
}

/**
 * /perfiles/$perfilId: ordered steps (instructions shown as text with copy buttons, never executed, 8.5),
 * dependencies, launch parameters, and the viewer's evaluation when approved and a diagnosis exists.
 * Pending profiles are visible marked "en prueba" (8.9 lets users test them); rejected/retired -> NoEncontrado.
 */
export const perfil = (id: PerfilId): Lectura<{
  readonly perfil: { readonly id: PerfilId; readonly titulo: string; readonly revision: number; readonly juego_id: JuegoId; readonly parametros_lanzamiento: string | null }
  readonly pasos: ReadonlyArray<{ readonly orden: number; readonly titulo: string; readonly instruccion: string }>
  readonly dependencias: ReadonlyArray<{ readonly nombre: string; readonly gestor: string; readonly version_requerida: string | null; readonly obligatoria: boolean; readonly instruccion_instalacion: string }>
  readonly evaluacion: Evaluacion | null
}, NoEncontrado> => {
  void id
  return Effect.die('not implemented')
}

/** RF-09: published guides; distribucion_id null = general guide (8.11 "debe permitir"). */
export const guias = (): Lectura<ReadonlyArray<{ readonly id: GuiaId; readonly tipo: string; readonly titulo: string; readonly distribucion: string | null }>> =>
  Effect.die('not implemented')

export const guia = (id: GuiaId): Lectura<{ readonly id: GuiaId; readonly titulo: string; readonly contenido: string; readonly revision: number; readonly actualizado_en: Date }, NoEncontrado> => {
  void id
  return Effect.die('not implemented')
}

/**
 * The report form's options for one game: its editions, the viewer's Linux diagnoses, layer versions,
 * failure types, and per diagnosis the profiles with no discrepancias (the same pure function
 * registrarReporte enforces). `perfilPreseleccionado` comes from ?perfil= on the profile page link.
 */
export const opcionesReporte = (juego: JuegoId, perfilPreseleccionado: PerfilId | null): Lectura<{
  readonly ediciones: ReadonlyArray<{ readonly id: number; readonly lanzador: string }>
  readonly diagnosticos: ReadonlyArray<{ readonly id: number; readonly equipo: string; readonly capturado_en: Date; readonly distribucion: string; readonly perfiles_comparables: ReadonlyArray<number> }>
  readonly versiones_capa: ReadonlyArray<{ readonly id: number; readonly etiqueta: string }>
  readonly tipos_fallo: ReadonlyArray<{ readonly id: number; readonly codigo: string; readonly descripcion: string }>
  readonly perfil_preseleccionado: PerfilId | null
}, NoAutenticado | NoEncontrado> => {
  void juego
  void perfilPreseleccionado
  return Effect.die('not implemented')
}
