// 8.11 "La aplicación debe rechazar / permitir" and the 8.9 review rules, through the real writers.
// Programs run directly (no HTTP) as a given visitor, each in a savepoint inside the test's rolled-back
// transaction. Inputs are decoded with the same Schemas the server fn validators use.
//
// Parent rows the app has no writer for yet (accounts, catalog, equipo/diagnostico until U6, profiles)
// are raw SQL; reports and solutions go through registrarReporte / registrarSolucion, and every review
// through decidir, so a fixture cannot hold a state the app cannot reach.
import { describe, expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { NuevaSolucion, NuevoReporte } from '../src/dominio/aportes.ts'
import { AprobacionBloqueada, NoAutenticado, PerfilNoComparable, ReglaIncumplida, SinPermiso, TransicionInvalida } from '../src/dominio/fallos.ts'
import { UsuarioId } from '../src/dominio/ids.ts'
import { AporteRef, Decision, type Rol } from '../src/dominio/revision.ts'
import { registrarReporte, registrarSolucion } from '../src/servidor/aportes/aportes.ts'
import { bloqueosAprobacion, decidir } from '../src/servidor/aportes/revision.ts'
import { type Usuario, Visitante } from '../src/servidor/auth.ts'
import { enRollback, idDe, PgTest } from './apoyo.ts'

const Fila = Schema.Array(Schema.Record(Schema.String, Schema.Unknown))

const escenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const cuenta = (alias: string, rol: Rol) =>
    Effect.as(
      sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES (${alias}, ${alias}, ${`${alias}@demo.opengame.test`}, false, ${rol}, true)`,
      { id: Schema.decodeSync(UsuarioId)(alias), alias, rol } satisfies Usuario,
    )
  const ana = yield* cuenta('ana', 'usuario')
  const bruno = yield* cuenta('bruno', 'usuario')
  const rita = yield* cuenta('rita', 'revisor')

  const lanzador = yield* idDe(sql`INSERT INTO lanzador (nombre) VALUES ('Steam') RETURNING id`)
  const lanzador2 = yield* idDe(sql`INSERT INTO lanzador (nombre) VALUES ('GOG') RETURNING id`)
  const juego = yield* idDe(sql`INSERT INTO juego (titulo, descripcion) VALUES ('Juego', 'd') RETURNING id`)
  const ed = yield* idDe(sql`INSERT INTO edicion_juego (juego_id, lanzador_id) VALUES (${juego}, ${lanzador}) RETURNING id`)
  const edGog = yield* idDe(sql`INSERT INTO edicion_juego (juego_id, lanzador_id) VALUES (${juego}, ${lanzador2}) RETURNING id`)
  const mint = yield* idDe(sql`INSERT INTO distribucion (nombre, version) VALUES ('Linux Mint', '22') RETURNING id`)
  const fedora = yield* idDe(sql`INSERT INTO distribucion (nombre, version) VALUES ('Fedora', '40') RETURNING id`)
  const capa = yield* idDe(sql`INSERT INTO version_capa (familia, variante, version) VALUES ('Proton', 'Valve', '9.0-4') RETURNING id`)
  const capa8 = yield* idDe(sql`INSERT INTO version_capa (familia, variante, version) VALUES ('Proton', 'Valve', '8.0-5') RETURNING id`)
  const otro = yield* idDe(sql`INSERT INTO tipo_fallo (codigo, descripcion) VALUES ('otro', 'Causa no identificada') RETURNING id`)
  const lanzadorFallo = yield* idDe(sql`INSERT INTO tipo_fallo (codigo, descripcion) VALUES ('lanzador', 'El lanzador no abre') RETURNING id`)

  const equipo = (dueno: Usuario) => idDe(sql`INSERT INTO equipo (usuario_id, alias) VALUES (${dueno.id}, 'equipo') RETURNING id`)
  const diagnostico = (equipo_id: number, capturado_en: string, cambios: Record<string, string | number | null> = {}) =>
    idDe(sql`INSERT INTO diagnostico ${sql.insert({
      equipo_id,
      capturado_en: new Date(capturado_en),
      sistema: 'Linux',
      version_sistema: '6.8',
      distribucion_id: mint,
      arquitectura: 'x86_64',
      cpu_modelo: 'cpu',
      gpu_modelo: 'gpu',
      ram_mb: 16384,
      soporte_vulkan: 'desconocido',
      ...cambios,
    })} RETURNING id`)
  const equipoAna = yield* equipo(ana)
  const diagAna = yield* diagnostico(equipoAna, '2026-10-01T10:00:00Z')
  const diagAnaWindows = yield* diagnostico(equipoAna, '2026-10-02T10:00:00Z', { sistema: 'Windows', version_sistema: '11', distribucion_id: null })
  const diagBruno = yield* diagnostico(yield* equipo(bruno), '2026-10-01T10:00:00Z')

  const perfil = (cambios: Record<string, string | number | null> = {}) =>
    idDe(sql`INSERT INTO perfil_configuracion ${sql.insert({
      edicion_id: ed,
      distribucion_id: mint,
      version_capa_id: capa,
      autor_id: bruno.id,
      arquitectura: 'x86_64',
      revision: 1,
      titulo: 'perfil',
      ...cambios,
    })} RETURNING id`)
  const perfilMint = yield* perfil()

  return { sql, ana, bruno, rita, ed, edGog, mint, fedora, capa, capa8, otro, lanzadorFallo, equipoAna, diagAna, diagAnaWindows, diagBruno, perfil, perfilMint, diagnostico }
})
type Escenario = Effect.Success<typeof escenario>

/** Runs `programa` as `quien` (null: a guest) in a savepoint, so a refused write leaves the test transaction usable. */
const como =
  (quien: Usuario | null) =>
  <A, E>(programa: Effect.Effect<A, E, SqlClient.SqlClient | Visitante>) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(programa)).pipe(Effect.provideService(Visitante, Option.fromNullOr(quien)))

const nuevoReporte = (e: Escenario, cambios: Record<string, unknown> = {}) =>
  Schema.decodeUnknownSync(NuevoReporte)({
    edicion_id: e.ed,
    diagnostico_id: e.diagAna,
    version_capa: { _tag: 'existente', id: e.capa },
    perfil_id: null,
    version_juego: '1.0',
    version_lanzador: null,
    fecha_prueba: '2026-10-03T10:00:00.000Z',
    resultado: 'funciona',
    medicion: null,
    observaciones: 'Probado una hora sin problemas',
    ...cambios,
  })

const reportar = (e: Escenario, cambios: Record<string, unknown> = {}, quien: Usuario = e.ana) => como(quien)(registrarReporte(nuevoReporte(e, cambios)))

const ref = (tipo: 'perfil' | 'reporte' | 'solucion', id: number) => Schema.decodeUnknownSync(AporteRef)({ _tag: tipo, id })
const aprobar = Schema.decodeUnknownSync(Decision)({ _tag: 'Aprobar', motivo: 'Coincide con la evidencia', evidencia: 'Captura de MangoHud #7' })
const rechazar = Schema.decodeUnknownSync(Decision)({ _tag: 'Rechazar', motivo: 'Sin datos suficientes' })
const retirar = Schema.decodeUnknownSync(Decision)({ _tag: 'Retirar', motivo: 'Versión obsoleta' })

const solucion = (e: Escenario, reporte_id: number, cambios: Record<string, unknown> = {}, quien: Usuario = e.bruno) =>
  como(quien)(
    registrarSolucion(
      Schema.decodeUnknownSync(NuevaSolucion)({
        reporte_id,
        tipo_fallo_id: e.lanzadorFallo,
        perfil_id: null,
        titulo: 'Reinstalar el lanzador',
        instrucciones: 'Borra la carpeta del lanzador y vuelve a instalarlo.',
        ...cambios,
      }),
    ),
  )

const conFallo = (e: Escenario) => ({ resultado: 'no_inicia', fallos: [{ tipo_fallo_id: e.lanzadorFallo, detalle: 'El lanzador se cierra' }] })

const enEscenario = (prueba: (e: Escenario) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () =>
  enRollback(Effect.flatMap(escenario, prueba))

const noComparable = (discrepancias: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownSync(PerfilNoComparable)({ _tag: 'PerfilNoComparable', discrepancias })

const regla = (r: ReglaIncumplida['regla']) => new ReglaIncumplida({ regla: r })

layer(PgTest)('aportes', (it) => {
  describe('la aplicación rechaza', () => {
    it.effect('un reporte desde el diagnóstico de un equipo ajeno', enEscenario((e) =>
      Effect.gen(function* () {
        expect(yield* Effect.flip(reportar(e, { diagnostico_id: e.diagBruno }))).toEqual(regla('equipo_ajeno'))
        // A missing diagnosis answers the same, so ids reveal nothing.
        expect(yield* Effect.flip(reportar(e, { diagnostico_id: 999999 }))).toEqual(regla('equipo_ajeno'))
      })))

    it.effect('un reporte desde un diagnóstico de Windows', enEscenario((e) =>
      Effect.gen(function* () {
        expect(yield* Effect.flip(reportar(e, { diagnostico_id: e.diagAnaWindows }))).toEqual(regla('diagnostico_no_linux'))
      })))

    it.effect('una prueba anterior al diagnóstico', enEscenario((e) =>
      Effect.gen(function* () {
        expect(yield* Effect.flip(reportar(e, { fecha_prueba: '2026-10-01T09:59:00.000Z' }))).toEqual(regla('fecha_antes_del_diagnostico'))
      })))

    it.effect('un perfil de otra edición, antes de que lo note la FK', enEscenario((e) =>
      Effect.gen(function* () {
        expect(yield* Effect.flip(reportar(e, { edicion_id: e.edGog, perfil_id: e.perfilMint }))).toEqual(
          noComparable([{ de: 'edicion', esperado: e.ed, observado: e.edGog }]),
        )
      })))

    it.effect('un perfil de otro entorno: capa, distribución, arquitectura y versión del juego', enEscenario((e) =>
      Effect.gen(function* () {
        const fedora = yield* e.perfil({ distribucion_id: e.fedora, arquitectura: 'aarch64', version_juego_objetivo: '2.0' })
        const fallo = yield* Effect.flip(reportar(e, { perfil_id: fedora, version_capa: { _tag: 'existente', id: e.capa8 } }))
        expect(fallo).toEqual(
          noComparable([
            { de: 'capa', esperado: e.capa, observado: e.capa8 },
            { de: 'distribucion', esperado: e.fedora, observado: e.mint },
            { de: 'arquitectura', esperado: 'aarch64', observado: 'x86_64' },
            { de: 'version_juego', esperado: '2.0', observado: '1.0' },
          ]),
        )
      })))

    it.effect('un perfil rechazado o inexistente', enEscenario((e) =>
      Effect.gen(function* () {
        yield* como(e.rita)(decidir(ref('perfil', e.perfilMint), rechazar))
        expect(yield* Effect.flip(reportar(e, { perfil_id: e.perfilMint }))).toEqual(regla('perfil_no_disponible'))
        expect(yield* Effect.flip(reportar(e, { perfil_id: 999999 }))).toEqual(regla('perfil_no_disponible'))
      })))

    it.effect('una versión de capa nueva escrita como «latest»', enEscenario((e) =>
      Effect.gen(function* () {
        const fallo = yield* Effect.flip(reportar(e, { version_capa: { _tag: 'nueva', familia: 'Proton', variante: 'GE', version: ' Latest ' } }))
        expect(fallo).toEqual(regla('version_capa_no_exacta'))
      })))

    it.effect('el mismo tipo de fallo dos veces, sin dejar el reporte a medias', enEscenario((e) =>
      Effect.gen(function* () {
        const fallos = [
          { tipo_fallo_id: e.otro, detalle: 'pantalla negra' },
          { tipo_fallo_id: e.otro, detalle: 'se cierra' },
        ]
        expect(yield* Effect.flip(reportar(e, { resultado: 'no_inicia', fallos }))).toEqual(regla('fallo_duplicado'))
        expect(yield* e.sql`SELECT count(*)::int AS n FROM reporte`).toEqual([{ n: 0 }])
      })))

    it.effect('una solución con un perfil de otra edición', enEscenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* reportar(e, conFallo(e))
        const gog = yield* e.perfil({ edicion_id: e.edGog })
        expect(yield* Effect.flip(solucion(e, id, { perfil_id: gog }))).toEqual(regla('solucion_perfil_otra_edicion'))
      })))

    it.effect('una solución para un fallo que el reporte no tiene', enEscenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* reportar(e, conFallo(e))
        expect(yield* Effect.flip(solucion(e, id, { tipo_fallo_id: e.otro }))).toEqual(regla('solucion_sin_fallo'))
      })))

    it.effect('que un revisor apruebe su propio reporte, perfil o solución', enEscenario((e) =>
      Effect.gen(function* () {
        // rita reviews, but she is also a user: her own equipo, report, profile and solution.
        const diagRita = yield* e.diagnostico(yield* idDe(e.sql`INSERT INTO equipo (usuario_id, alias) VALUES ('rita', 'r') RETURNING id`), '2026-10-01T10:00:00Z')
        const { id: reporte } = yield* reportar(e, { diagnostico_id: diagRita, ...conFallo(e) }, e.rita)
        const perfil = yield* e.perfil({ autor_id: 'rita', revision: 2 })
        const { id: sol } = yield* solucion(e, reporte, {}, e.rita)
        for (const r of [ref('reporte', reporte), ref('perfil', perfil), ref('solucion', sol)])
          expect(yield* Effect.flip(como(e.rita)(decidir(r, aprobar)))).toEqual(regla('autorrevision'))
      })))

    it.effect('aprobar un perfil sin un reporte funcional aprobado que lo use', enEscenario((e) =>
      Effect.gen(function* () {
        const bloqueado = new AprobacionBloqueada({ bloqueos: ['perfil_sin_reporte_funcional_aprobado'] })
        expect(yield* Effect.flip(como(e.rita)(decidir(ref('perfil', e.perfilMint), aprobar)))).toEqual(bloqueado)

        const { id: falla } = yield* reportar(e, { perfil_id: e.perfilMint, ...conFallo(e) })
        yield* como(e.rita)(decidir(ref('reporte', falla), aprobar))
        expect(yield* Effect.flip(como(e.rita)(decidir(ref('perfil', e.perfilMint), aprobar)))).toEqual(bloqueado)

        const { id: pendiente } = yield* reportar(e, { perfil_id: e.perfilMint, fecha_prueba: '2026-10-04T10:00:00.000Z' })
        expect(yield* Effect.flip(como(e.rita)(decidir(ref('perfil', e.perfilMint), aprobar)))).toEqual(bloqueado)

        yield* como(e.rita)(decidir(ref('reporte', pendiente), aprobar))
        expect(yield* como(e.rita)(decidir(ref('perfil', e.perfilMint), aprobar))).toEqual({ cambio: true })
      })))

    it.effect('aprobar una solución con el fallo de origen pendiente o un perfil recomendado pendiente', enEscenario((e) =>
      Effect.gen(function* () {
        const { id: reporte } = yield* reportar(e, { perfil_id: e.perfilMint, ...conFallo(e) })
        const { id: sol } = yield* solucion(e, reporte, { perfil_id: e.perfilMint }, e.ana)
        expect(yield* bloqueosAprobacion(ref('solucion', sol))).toEqual(['solucion_fallo_origen_no_aprobado', 'solucion_perfil_no_aprobado'])
        yield* como(e.rita)(decidir(ref('reporte', reporte), aprobar))
        expect(yield* Effect.flip(como(e.rita)(decidir(ref('solucion', sol), aprobar)))).toEqual(
          new AprobacionBloqueada({ bloqueos: ['solucion_perfil_no_aprobado'] }),
        )
      })))

    it.effect('decidir sin rol de revisor o sin sesión', enEscenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* reportar(e)
        expect(yield* Effect.flip(como(e.bruno)(decidir(ref('reporte', id), aprobar)))).toEqual(new SinPermiso())
        expect(yield* Effect.flip(como(null)(decidir(ref('reporte', id), aprobar)))).toEqual(new NoAutenticado())
        expect(yield* Effect.flip(como(null)(registrarReporte(nuevoReporte(e))))).toEqual(new NoAutenticado())
      })))

    it.effect('rechazar lo que ya está aprobado', enEscenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* reportar(e)
        yield* como(e.rita)(decidir(ref('reporte', id), aprobar))
        expect(yield* Effect.flip(como(e.rita)(decidir(ref('reporte', id), rechazar)))).toEqual(
          new TransicionInvalida({ de: 'aprobado', a: 'rechazado' }),
        )
      })))
  })

  describe('la aplicación permite', () => {
    it.effect('reportar desde varios diagnósticos históricos del mismo equipo', enEscenario((e) =>
      Effect.gen(function* () {
        const posterior = yield* e.diagnostico(e.equipoAna, '2026-10-05T10:00:00Z', { ram_mb: 32768 })
        yield* reportar(e)
        yield* reportar(e, { diagnostico_id: posterior, fecha_prueba: '2026-10-06T10:00:00.000Z' })
        const filas = yield* e.sql`SELECT diagnostico_id FROM reporte ORDER BY fecha_prueba`
        expect(filas).toEqual([{ diagnostico_id: e.diagAna }, { diagnostico_id: posterior }])
      })))

    it.effect('un reporte sin perfil, con su medición y sus fallos', enEscenario((e) =>
      Effect.gen(function* () {
        const medicion = { fps_promedio: 54.5, resolucion: '1280x720', calidad_grafica: 'Bajo', metodo_medicion: 'MangoHud, 5 min' }
        const { id } = yield* reportar(e, { resultado: 'falla_en_ejecucion', medicion, fallos: [{ tipo_fallo_id: e.otro, detalle: 'Se cierra a los 10 min' }] })
        const reporte = Schema.decodeUnknownSync(Fila)(yield* e.sql`SELECT perfil_id, fps_promedio, resolucion, estado_revision FROM reporte WHERE id = ${id}`)
        expect(reporte).toEqual([{ perfil_id: null, fps_promedio: '54.50', resolucion: '1280x720', estado_revision: 'pendiente' }])
        expect(yield* e.sql`SELECT tipo_fallo_id, detalle FROM reporte_fallo WHERE reporte_id = ${id}`).toEqual([
          { tipo_fallo_id: e.otro, detalle: 'Se cierra a los 10 min' },
        ])
      })))

    it.effect('una versión de capa nueva se crea una sola vez', enEscenario((e) =>
      Effect.gen(function* () {
        const nueva = { _tag: 'nueva', familia: 'Proton', variante: 'GE', version: '9-20' }
        yield* reportar(e, { version_capa: nueva })
        yield* reportar(e, { version_capa: nueva, fecha_prueba: '2026-10-04T10:00:00.000Z' })
        const capas = yield* e.sql`SELECT count(*)::int AS n, count(DISTINCT r.version_capa_id)::int AS usadas
                                   FROM version_capa c JOIN reporte r ON r.version_capa_id = c.id WHERE c.variante = 'GE'`
        expect(capas).toEqual([{ n: 2, usadas: 1 }])
      })))

    it.effect('decidir dos veces lo mismo no cambia nada la segunda vez', enEscenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* reportar(e)
        expect(yield* como(e.rita)(decidir(ref('reporte', id), aprobar))).toEqual({ cambio: true })
        const antes = yield* e.sql`SELECT revisor_id, revisado_en, motivo_revision, evidencia_revision FROM reporte WHERE id = ${id}`
        const otraDecision = Schema.decodeUnknownSync(Decision)({ _tag: 'Aprobar', motivo: 'otro motivo', evidencia: 'otra evidencia' })
        expect(yield* como(e.rita)(decidir(ref('reporte', id), otraDecision))).toEqual({ cambio: false })
        expect(yield* e.sql`SELECT revisor_id, revisado_en, motivo_revision, evidencia_revision FROM reporte WHERE id = ${id}`).toEqual(antes)
      })))

    it.effect('probar un perfil pendiente y aprobarlo con ese reporte; luego publicar una solución', enEscenario((e) =>
      Effect.gen(function* () {
        const { id: funciona } = yield* reportar(e, { perfil_id: e.perfilMint })
        const { id: falla } = yield* reportar(e, { perfil_id: e.perfilMint, fecha_prueba: '2026-10-04T10:00:00.000Z', ...conFallo(e) })
        yield* como(e.rita)(decidir(ref('reporte', funciona), aprobar))
        yield* como(e.rita)(decidir(ref('perfil', e.perfilMint), aprobar))
        yield* como(e.rita)(decidir(ref('reporte', falla), aprobar))
        const { id: sol } = yield* solucion(e, falla, { perfil_id: e.perfilMint })
        expect(yield* como(e.rita)(decidir(ref('solucion', sol), aprobar))).toEqual({ cambio: true })
        const estados = yield* e.sql`SELECT estado_revision, revisor_id, evidencia_revision FROM solucion WHERE id = ${sol}`
        expect(estados).toEqual([{ estado_revision: 'aprobado', revisor_id: 'rita', evidencia_revision: 'Captura de MangoHud #7' }])
      })))

    it.effect('retirar lo aprobado conserva la evidencia', enEscenario((e) =>
      Effect.gen(function* () {
        const { id } = yield* reportar(e)
        yield* como(e.rita)(decidir(ref('reporte', id), aprobar))
        yield* como(e.rita)(decidir(ref('reporte', id), retirar))
        expect(yield* e.sql`SELECT estado_revision, motivo_revision, evidencia_revision FROM reporte WHERE id = ${id}`).toEqual([
          { estado_revision: 'retirado', motivo_revision: 'Versión obsoleta', evidencia_revision: 'Captura de MangoHud #7' },
        ])
      })))
  })
})
