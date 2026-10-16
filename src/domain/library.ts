import { Schema } from 'effect'
import { Texto } from './ids.ts'
import { largo } from './max-lengths.ts'

export const LANZADOR_STEAM = 'Steam'

export const MAX_JUEGOS_BIBLIOTECA = 1000

export const AppIdSteam = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)), Schema.brand('AppIdSteam'))
export type AppIdSteam = typeof AppIdSteam.Type

export const JuegoBiblioteca = Schema.Struct({ app_id: AppIdSteam, nombre: Texto.pipe(Schema.check(Schema.isMaxLength(largo.biblioteca.nombre))) })
export type JuegoBiblioteca = typeof JuegoBiblioteca.Type

export const BibliotecaSteam = Schema.Array(JuegoBiblioteca).pipe(Schema.check(Schema.isMaxLength(MAX_JUEGOS_BIBLIOTECA)))
export type BibliotecaSteam = typeof BibliotecaSteam.Type

export type BibliotecaEvaluada = { readonly total: number; readonly desconocidos: ReadonlyArray<JuegoBiblioteca> }

export const esHerramientaSteam = (nombre: string): boolean =>
  /^(Proton\b|Steam Linux Runtime|Steamworks Common Redistributables)/i.test(nombre)
