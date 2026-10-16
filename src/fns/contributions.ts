import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { NewSolution, NewGame, NewReport } from '../domain/contributions.ts'
import { IncomparableProfile, RuleViolated } from '../domain/errors.ts'
import { GameId, ProfileId, ReportId } from '../domain/ids.ts'
import { crearJuego, registrarReporte, registrarSolucion } from '../server/commands/contributions.ts'
import { opcionesJuego, opcionesReporte, opcionesSolucion } from '../server/queries/form-options.ts'
import { accion, leer } from '../server/run.ts'

export const opcionesReporteFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ juegoId: GameId, perfil: Schema.NullOr(ProfileId) })))
  .handler(({ data }) => leer(opcionesReporte(data.juegoId, data.perfil)))

export const registrarReporteFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NewReport))
  .handler(({ data }) => accion(Schema.Union([RuleViolated, IncomparableProfile]), registrarReporte(data)))

export const opcionesSolucionFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ reporteId: ReportId })))
  .handler(({ data }) => leer(opcionesSolucion(data.reporteId)))

export const registrarSolucionFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NewSolution))
  .handler(({ data }) => accion(RuleViolated, registrarSolucion(data)))

export const opcionesJuegoFn = createServerFn({ method: 'GET' }).handler(() => leer(opcionesJuego))

export const crearJuegoFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NewGame))
  .handler(({ data }) => accion(RuleViolated, crearJuego(data)))
