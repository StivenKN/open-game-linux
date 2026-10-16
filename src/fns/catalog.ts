import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { FiltroCatalogo } from '../domain/contributions.ts'
import { JuegoId, PerfilId } from '../domain/ids.ts'
import { catalogo } from '../server/queries/catalog.ts'
import { fichaJuego } from '../server/queries/game.ts'
import { perfil } from '../server/queries/profile.ts'
import { leer } from '../server/run.ts'

export const catalogoFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(FiltroCatalogo))
  .handler(({ data }) => leer(catalogo(data)))

export const fichaJuegoFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ juegoId: JuegoId })))
  .handler(({ data }) => leer(fichaJuego(data.juegoId)))

export const perfilFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ perfilId: PerfilId })))
  .handler(({ data }) => leer(perfil(data.perfilId)))
