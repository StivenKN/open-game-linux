import { expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { NoAutenticado, ReglaIncumplida, SinPermiso } from '../src/dominio/fallos.ts'
import { PerfilId, UsuarioId } from '../src/dominio/ids.ts'
import type { Rol } from '../src/dominio/revision.ts'
import { NotaArreglo } from '../src/dominio/upstream.ts'
import { anotarArreglo } from '../src/servidor/aportes/upstream.ts'
import { type Usuario, Visitante } from '../src/servidor/auth.ts'
import { catalogo } from '../src/servidor/consultas/catalogo.ts'
import { perfil } from '../src/servidor/consultas/perfil.ts'
import { enRollback, idDe, PgTest, restriccionDe } from './apoyo.ts'

type Valor = string | number | boolean | Date | null

const escenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertar = (tabla: string, fila: Record<string, Valor>) => idDe(sql`INSERT INTO ${sql(tabla)} ${sql.insert(fila)} RETURNING id`)
  const cuenta = (alias: string, correo: string, rol: Rol) =>
    Effect.as(
      sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES (${alias}, ${alias}, ${correo}, false, ${rol}, true)`,
      { id: UsuarioId.make(alias), alias, rol } satisfies Usuario,
    )
  // Ids no other test file uses: bd files run in parallel, and two transactions inserting the same ids deadlock.
  const rita = yield* cuenta('up_rita', 'up_rita@opengame.test', 'revisor')
  const ana = yield* cuenta('up_ana', 'up_ana@opengame.test', 'usuario')
  yield* cuenta('up_demo', 'up_demo@demo.opengame.test', 'usuario')

  const steam = yield* insertar('lanzador', { nombre: 'Steam' })
  const juego = yield* insertar('juego', { titulo: 'The Witcher 3: Wild Hunt', descripcion: 'd' })
  const edicion = yield* insertar('edicion_juego', { juego_id: juego, lanzador_id: steam, identificador_externo: '292030' })
  const fedora = yield* insertar('distribucion', { nombre: 'Fedora', version: '40' })
  const proton = yield* insertar('version_capa', { familia: 'Proton', variante: 'Valve', version: '9.0-3' })
  const wine = yield* insertar('version_capa', { familia: 'Wine', variante: 'estable', version: '9.0' })

  const aprobado = {
    estado_revision: 'aprobado',
    creado_en: new Date('2026-10-03T00:00:00Z'),
    revisor_id: rita.id,
    revisado_en: new Date('2026-10-04T00:00:00Z'),
    motivo_revision: 'probado',
    evidencia_revision: 'reporte #1',
  }
  const nuevoPerfil = (revision: number, cambios: Record<string, Valor> = {}) =>
    Effect.map(
      insertar('perfil_configuracion', {
        edicion_id: edicion,
        distribucion_id: fedora,
        version_capa_id: proton,
        autor_id: ana.id,
        arquitectura: 'x86_64',
        revision,
        titulo: 'perfil',
        parametros_lanzamiento: '%command% --launcher-skip',
        ...aprobado,
        ...cambios,
      }),
      PerfilId.make,
    )
  return {
    sql,
    rita,
    ana,
    exportable: yield* nuevoPerfil(1),
    otroExportable: yield* nuevoPerfil(2),
    pendiente: yield* nuevoPerfil(3, { estado_revision: 'pendiente', revisor_id: null, revisado_en: null, motivo_revision: null, evidencia_revision: null }),
    conWine: yield* nuevoPerfil(4, { version_capa_id: wine }),
    deEjemplo: yield* nuevoPerfil(5, { autor_id: 'up_demo' }),
  }
})
type Escenario = Effect.Success<typeof escenario>

const enEscenario = (prueba: (e: Escenario) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () => enRollback(Effect.flatMap(escenario, prueba))

const como =
  (quien: Usuario | null) =>
  <A, E>(programa: Effect.Effect<A, E, SqlClient.SqlClient | Visitante>) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(programa)).pipe(Effect.provideService(Visitante, Option.fromNullOr(quien)))

const aceptado = (perfil_id: number, pr = 512) =>
  Schema.decodeUnknownSync(NotaArreglo)({ _tag: 'Aceptado', perfil_id, pr: `https://github.com/Open-Wine-Components/umu-protonfixes/pull/${pr}/files` })
const anular = (pr: number) => Schema.decodeUnknownSync(NotaArreglo)({ _tag: 'Anular', pr })
const regla = (r: ReglaIncumplida['regla']) => new ReglaIncumplida({ regla: r })

const contador = Effect.map(
  Effect.provideService(catalogo({}), Visitante, Option.none()),
  (c) => c.contadores.arreglos_upstream,
)

layer(PgTest)('arreglo_upstream', (it) => {
  it.effect('un revisor registra un PR fusionado una vez; repetirlo no cambia nada', enEscenario((e) =>
    Effect.gen(function* () {
      expect(yield* contador).toBe(0)
      expect(yield* como(e.rita)(anotarArreglo(aceptado(e.exportable)))).toEqual({ cambio: true })
      expect(yield* como(e.rita)(anotarArreglo(aceptado(e.exportable)))).toEqual({ cambio: false })
      expect(yield* contador).toBe(1)
      const pagina = yield* Effect.provideService(perfil(e.exportable), Visitante, Option.none())
      expect({ exportacion: pagina.exportacion?._tag, arreglos: pagina.arreglos.map((a) => a.pr) }).toEqual({ exportacion: 'archivo', arreglos: [512] })
    })))

  it.effect('el mismo PR no se registra para otro perfil', enEscenario((e) =>
    Effect.gen(function* () {
      yield* como(e.rita)(anotarArreglo(aceptado(e.exportable)))
      expect(yield* Effect.flip(como(e.rita)(anotarArreglo(aceptado(e.otroExportable))))).toEqual(regla('arreglo_pr_de_otro_perfil'))
    })))

  it.effect('rechaza perfiles sin camino a gamefixes-steam: pendiente, con Wine o inexistente', enEscenario((e) =>
    Effect.gen(function* () {
      for (const id of [e.pendiente, e.conWine, 999999])
        expect(yield* Effect.flip(como(e.rita)(anotarArreglo(aceptado(id))))).toEqual(regla('arreglo_no_exportable'))
      expect(yield* contador).toBe(0)
    })))

  it.effect('rechaza los datos de ejemplo: el contador público no cuenta demos', enEscenario((e) =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(como(e.rita)(anotarArreglo(aceptado(e.deEjemplo))))).toEqual(regla('arreglo_datos_de_ejemplo'))
    })))

  it.effect('Anular borra el registro; anular de nuevo no cambia nada', enEscenario((e) =>
    Effect.gen(function* () {
      yield* como(e.rita)(anotarArreglo(aceptado(e.exportable)))
      expect(yield* como(e.rita)(anotarArreglo(anular(512)))).toEqual({ cambio: true })
      expect(yield* como(e.rita)(anotarArreglo(anular(512)))).toEqual({ cambio: false })
      expect(yield* contador).toBe(0)
    })))

  it.effect('solo un revisor escribe', enEscenario((e) =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(como(e.ana)(anotarArreglo(aceptado(e.exportable))))).toEqual(new SinPermiso())
      expect(yield* Effect.flip(como(null)(anotarArreglo(anular(512))))).toEqual(new NoAutenticado())
    })))

  it.effect('un registro no se reescribe', enEscenario((e) =>
    Effect.gen(function* () {
      yield* como(e.rita)(anotarArreglo(aceptado(e.exportable)))
      expect(yield* restriccionDe(e.sql`UPDATE arreglo_upstream SET pr = 513`)).toEqual(Option.some('og_inmutable'))
    })))
})
