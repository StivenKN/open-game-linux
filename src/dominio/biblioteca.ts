import { Schema } from 'effect'
import { Texto } from './ids.ts'
import { largo } from './largo.ts'

/** `lanzador.nombre` of Steam: the seed writes it and the library read model joins on it. */
export const LANZADOR_STEAM = 'Steam'

/** The script routes fill it into both detectors. Migration 3's CHECK freezes the same 1000; raising it needs a new migration. */
export const MAX_JUEGOS_BIBLIOTECA = 1000

export const AppIdSteam = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)), Schema.brand('AppIdSteam'))
export type AppIdSteam = typeof AppIdSteam.Type

export const JuegoBiblioteca = Schema.Struct({ app_id: AppIdSteam, nombre: Texto.pipe(Schema.check(Schema.isMaxLength(largo.biblioteca.nombre))) })
export type JuegoBiblioteca = typeof JuegoBiblioteca.Type

/** Installed Steam games as the detectors list them, most recently played first. */
export const BibliotecaSteam = Schema.Array(JuegoBiblioteca).pipe(Schema.check(Schema.isMaxLength(MAX_JUEGOS_BIBLIOTECA)))
export type BibliotecaSteam = typeof BibliotecaSteam.Type

/** A library against the catalog: how many games it holds, and those the catalog does not know yet. */
export type BibliotecaEvaluada = { readonly total: number; readonly desconocidos: ReadonlyArray<JuegoBiblioteca> }

/** Proton and the runtimes install like games but are Steam's own tools. */
export const esHerramientaSteam = (nombre: string): boolean =>
  /^(Proton\b|Steam Linux Runtime|Steamworks Common Redistributables)/i.test(nombre)
