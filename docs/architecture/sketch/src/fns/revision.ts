// Server fns for the review queue (RF-10). Same file rule as fns/catalogo.ts.
import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { AprobacionBloqueada, ReglaIncumplida } from '../dominio/fallos.ts'
import { AporteRef, Decision } from '../dominio/revision.ts'
import { decidir } from '../servidor/aportes/revision.ts'
import { cola } from '../servidor/consultas/revision.ts'
import { accion, leer } from '../servidor/ejecutar.ts'

export const colaFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ tipo: Schema.Literals(['perfil', 'reporte', 'solucion']) })))
  .handler(({ data }) => leer(cola(data.tipo)))

export const decidirFn = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: AporteRef, decision: Decision })))
  .handler(({ data }) => accion(Schema.Union([ReglaIncumplida, AprobacionBloqueada]), decidir(data.ref, data.decision)))
