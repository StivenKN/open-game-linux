// Server fns for public reads. RULE (fronteras.test.ts): a file in fns/ holds imports and
// `export const x = createServerFn(...)` statements only. Anything else at module scope ships to the
// browser (spike gotcha 3). Imports used only inside handlers are stripped from the client bundle.
import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { FiltroCatalogo } from '../dominio/aportes.ts'
import { GuiaId, IdDesdeTexto, JuegoId, PerfilId } from '../dominio/ids.ts'
import * as catalogo from '../servidor/consultas/catalogo.ts'
import { fichaJuego } from '../servidor/consultas/ficha.ts'
import { leer } from '../servidor/ejecutar.ts'

export const catalogoFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(FiltroCatalogo))
  .handler(({ data }) => leer(catalogo.catalogo(data)))

export const fichaJuegoFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ juegoId: IdDesdeTexto(JuegoId) })))
  .handler(({ data }) => leer(fichaJuego(data.juegoId)))

export const perfilFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ perfilId: IdDesdeTexto(PerfilId) })))
  .handler(({ data }) => leer(catalogo.perfil(data.perfilId)))

export const guiasFn = createServerFn({ method: 'GET' }).handler(() => leer(catalogo.guias()))

export const guiaFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ guiaId: IdDesdeTexto(GuiaId) })))
  .handler(({ data }) => leer(catalogo.guia(data.guiaId)))
