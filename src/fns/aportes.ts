import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { NuevaSolucion, NuevoJuego, NuevoReporte } from '../dominio/aportes.ts'
import { PerfilNoComparable, ReglaIncumplida } from '../dominio/fallos.ts'
import { JuegoId, PerfilId, ReporteId } from '../dominio/ids.ts'
import { crearJuego, registrarReporte, registrarSolucion } from '../servidor/aportes/aportes.ts'
import { opcionesJuego, opcionesReporte, opcionesSolucion } from '../servidor/consultas/reportar.ts'
import { accion, leer } from '../servidor/ejecutar.ts'

export const opcionesReporteFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ juegoId: JuegoId, perfil: Schema.NullOr(PerfilId) })))
  .handler(({ data }) => leer(opcionesReporte(data.juegoId, data.perfil)))

export const registrarReporteFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NuevoReporte))
  .handler(({ data }) => accion(Schema.Union([ReglaIncumplida, PerfilNoComparable]), registrarReporte(data)))

export const opcionesSolucionFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ reporteId: ReporteId })))
  .handler(({ data }) => leer(opcionesSolucion(data.reporteId)))

export const registrarSolucionFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NuevaSolucion))
  .handler(({ data }) => accion(ReglaIncumplida, registrarSolucion(data)))

export const opcionesJuegoFn = createServerFn({ method: 'GET' }).handler(() => leer(opcionesJuego))

export const crearJuegoFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NuevoJuego))
  .handler(({ data }) => accion(ReglaIncumplida, crearJuego(data)))
