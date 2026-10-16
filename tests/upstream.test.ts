import { expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { Unauthenticated, NotFound, RuleViolated, Forbidden } from '../src/domain/errors.ts'
import { ProfileId, ReportId, UserId } from '../src/domain/ids.ts'
import type { Role } from '../src/domain/review.ts'
import { FixNote } from '../src/domain/upstream.ts'
import { anotarArreglo } from '../src/server/commands/upstream.ts'
import { type Usuario, Visitante } from '../src/server/auth.ts'
import { catalogo } from '../src/server/queries/catalog.ts'
import { perfil } from '../src/server/queries/profile.ts'
import { informeProtonDe } from '../src/server/queries/upstream.ts'
import { enRollback, idDe, PgTest, restriccionDe } from './support.ts'

type Valor = string | number | boolean | Date | null

const escenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertar = (tabla: string, fila: Record<string, Valor>) => idDe(sql`INSERT INTO ${sql(tabla)} ${sql.insert(fila)} RETURNING id`)
  const cuenta = (alias: string, correo: string, rol: Role) =>
    Effect.as(
      sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES (${alias}, ${alias}, ${correo}, false, ${rol}, true)`,
      { id: UserId.make(alias), alias, rol } satisfies Usuario,
    )
  // Ids no other test file uses: bd files run in parallel, and two transactions inserting the same ids deadlock.
  const rita = yield* cuenta('up_rita', 'up_rita@opengame.test', 'revisor')
  const ana = yield* cuenta('up_ana', 'up_ana@opengame.test', 'usuario')
  const bruno = yield* cuenta('up_bruno', 'up_bruno@opengame.test', 'usuario')
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
      ProfileId.make,
    )
  const equipo = yield* insertar('equipo', { usuario_id: ana.id, alias: 'torre' })
  const diagnostico = yield* insertar('diagnostico', {
    equipo_id: equipo,
    capturado_en: new Date('2026-09-20T18:00:00Z'),
    sistema: 'Linux',
    version_sistema: '6.10.6-200.fc40.x86_64',
    distribucion_id: fedora,
    arquitectura: 'x86_64',
    cpu_modelo: 'AMD Ryzen 7 5700X',
    gpu_modelo: 'AMD Radeon RX 6600',
    ram_mb: 32768,
    controlador: 'amdgpu',
    version_controlador: 'Mesa 24.1.7',
    soporte_vulkan: 'si',
  })
  const fallido = yield* insertar('reporte', {
    edicion_id: edicion,
    diagnostico_id: diagnostico,
    version_capa_id: proton,
    version_juego: '4.04',
    fecha_prueba: new Date('2026-10-02T19:00:00Z'),
    resultado: 'no_inicia',
    observaciones: 'Pantalla negra al iniciar.',
  })
  const lanzadorFallo = yield* insertar('tipo_fallo', { codigo: 'lanzador', descripcion: 'El lanzador no abre.' })
  yield* sql`INSERT INTO reporte_fallo (reporte_id, tipo_fallo_id, detalle) VALUES (${fallido}, ${lanzadorFallo}, 'El lanzador se cierra.')`

  return {
    sql,
    rita,
    ana,
    bruno,
    fallido: ReportId.make(fallido),
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
  Schema.decodeUnknownSync(FixNote)({ _tag: 'Aceptado', perfil_id, pr: `https://github.com/Open-Wine-Components/umu-protonfixes/pull/${pr}/files` })
const anular = (pr: number) => Schema.decodeUnknownSync(FixNote)({ _tag: 'Anular', pr })
const regla = (r: RuleViolated['rule']) => new RuleViolated({ rule: r })

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
      expect(yield* Effect.flip(como(e.ana)(anotarArreglo(aceptado(e.exportable))))).toEqual(new Forbidden())
      expect(yield* Effect.flip(como(null)(anotarArreglo(anular(512))))).toEqual(new Unauthenticated())
    })))

  it.effect('un registro no se reescribe', enEscenario((e) =>
    Effect.gen(function* () {
      yield* como(e.rita)(anotarArreglo(aceptado(e.exportable)))
      expect(yield* restriccionDe(e.sql`UPDATE arreglo_upstream SET pr = 513`)).toEqual(Option.some('og_inmutable'))
    })))
})

layer(PgTest)('informeProtonDe', (it) => {
  it.effect('su autora recibe el informe; nadie más sabe que existe', enEscenario((e) =>
    Effect.gen(function* () {
      const suyo = yield* Effect.provideService(informeProtonDe(e.fallido), Visitante, Option.some(e.ana))
      expect(suyo.informe).toMatchObject({ _tag: 'informe', title: 'The Witcher 3: Wild Hunt (292030)', body_in_link: true })
      expect(suyo.informe._tag === 'informe' && suyo.informe.body.split('\n').slice(5, 9)).toEqual([
        '- GPU: AMD Radeon RX 6600',
        '- Video driver version: Mesa 24.1.7 (amdgpu)',
        '- Kernel version: 6.10.6-200.fc40.x86_64',
        '- Distribution: Fedora 40',
      ])
      expect(yield* Effect.flip(Effect.provideService(informeProtonDe(e.fallido), Visitante, Option.some(e.bruno)))).toEqual(new NotFound())
      expect(yield* Effect.flip(Effect.provideService(informeProtonDe(e.fallido), Visitante, Option.none()))).toEqual(new Unauthenticated())
    })))
})
