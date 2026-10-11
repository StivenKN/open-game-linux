// Server fns for contributions (RF-04, RF-08, RF-03). Same file rule as fns/catalogo.ts.
// Every write validates with the SAME schema the form decoded in the browser, then returns
// Respuesta<A, Fallos.Encoded> through `accion`.
import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { EntradaDiagnostico, GuardarDiagnostico, NuevaSolucion, NuevoJuego, NuevoReporte } from '../dominio/aportes.ts'
import { PayloadInvalido, ReglaIncumplida } from '../dominio/fallos.ts'
import { IdDesdeTexto, JuegoId, PerfilId } from '../dominio/ids.ts'
import { crearJuego, registrarDiagnostico, registrarReporte, registrarSolucion } from '../servidor/aportes/aportes.ts'
import { opcionesReporte } from '../servidor/consultas/catalogo.ts'
import { evaluarSinGuardar, miDiagnostico, misEquipos } from '../servidor/consultas/diagnostico.ts'
import { DiagnosticoId } from '../dominio/ids.ts'
import { accion, leer } from '../servidor/ejecutar.ts'

export const registrarReporteFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NuevoReporte))
  .handler(({ data }) => accion(ReglaIncumplida, registrarReporte(data)))

export const registrarSolucionFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NuevaSolucion))
  .handler(({ data }) => accion(ReglaIncumplida, registrarSolucion(data)))

export const crearJuegoFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(NuevoJuego))
  .handler(({ data }) => accion(ReglaIncumplida, crearJuego(data)))

/** Guests too. Parses on the server, stores nothing. */
export const evaluarDiagnosticoFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(EntradaDiagnostico))
  .handler(({ data }) => accion(PayloadInvalido, evaluarSinGuardar(data)))

export const guardarDiagnosticoFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(GuardarDiagnostico))
  .handler(({ data }) => accion(Schema.Union([ReglaIncumplida, PayloadInvalido]), registrarDiagnostico(data)))

export const opcionesReporteFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ juegoId: IdDesdeTexto(JuegoId), perfil: Schema.NullOr(PerfilId) })))
  .handler(({ data }) => leer(opcionesReporte(data.juegoId, data.perfil)))

export const misEquiposFn = createServerFn({ method: 'GET' }).handler(() => leer(misEquipos()))

export const miDiagnosticoFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ diagnosticoId: IdDesdeTexto(DiagnosticoId) })))
  .handler(({ data }) => leer(miDiagnostico(data.diagnosticoId)))
