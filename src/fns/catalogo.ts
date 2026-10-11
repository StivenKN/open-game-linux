import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { FiltroCatalogo } from '../dominio/aportes.ts'
import { JuegoId, PerfilId } from '../dominio/ids.ts'
import { catalogo } from '../servidor/consultas/catalogo.ts'
import { fichaJuego } from '../servidor/consultas/ficha.ts'
import { perfil } from '../servidor/consultas/perfil.ts'
import { leer } from '../servidor/ejecutar.ts'

export const catalogoFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(FiltroCatalogo))
  .handler(({ data }) => leer(catalogo(data)))

export const fichaJuegoFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ juegoId: JuegoId })))
  .handler(({ data }) => leer(fichaJuego(data.juegoId)))

export const perfilFn = createServerFn({ method: 'GET' })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ perfilId: PerfilId })))
  .handler(({ data }) => leer(perfil(data.perfilId)))
