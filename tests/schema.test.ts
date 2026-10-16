import { describe, expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient, type SqlError } from 'effect/sql'
import { getMigrations } from 'better-auth/db/migration'
import { MAX_LIBRARY_GAMES } from '../src/domain/library.ts'
import { RuleViolated } from '../src/domain/errors.ts'
import { auth } from '../src/server/auth.ts'
import { withDbRules, ruleByConstraint } from '../src/server/schema/constraints.ts'
import { inRollback, idOf, PgTest, constraintOf } from './support.ts'
import { seed, type Seed } from './fixtures.ts'

type Valor = string | number | boolean | Date | null

const reporte = (f: Seed, cambios: Record<string, Valor> = {}) =>
  f.sql`INSERT INTO reporte ${f.sql.insert({
    edicion_id: f.ed,
    diagnostico_id: f.diag,
    version_capa_id: f.capa,
    version_juego: '1.0',
    fecha_prueba: new Date('2026-10-03T10:00:00Z'),
    resultado: 'funciona',
    observaciones: 'sin problemas',
    ...cambios,
  })} RETURNING id`

const diagnostico = (f: Seed, cambios: Record<string, Valor> = {}) =>
  f.sql`INSERT INTO diagnostico ${f.sql.insert({
    equipo_id: f.equipo,
    capturado_en: new Date('2026-10-05T10:00:00Z'),
    sistema: 'Linux',
    version_sistema: '6.9',
    distribucion_id: f.dist,
    arquitectura: 'x86_64',
    cpu_modelo: 'cpu',
    gpu_modelo: 'gpu',
    ram_mb: 8192,
    soporte_vulkan: 'no',
    ...cambios,
  })}`

const bibliotecaDe = (juegos: number) => JSON.stringify(Array.from({ length: juegos }, (_, i) => ({ app_id: i + 1, nombre: 'juego' })))

const perfil = (f: Seed, cambios: Record<string, Valor> = {}) =>
  f.sql`INSERT INTO perfil_configuracion ${f.sql.insert({
    edicion_id: f.ed,
    distribucion_id: f.dist,
    version_capa_id: f.capa,
    autor_id: f.autor,
    arquitectura: 'x86_64',
    revision: 2,
    titulo: 'perfil',
    ...cambios,
  })} RETURNING id`

const guia = (f: Seed, cambios: Record<string, Valor> = {}) =>
  f.sql`INSERT INTO guia_adopcion ${f.sql.insert({
    autor_id: f.revisor,
    tipo: 'instalacion',
    titulo: 'Instalar Linux Mint',
    contenido: 'Pasos',
    revision: 1,
    estado: 'publicada',
    ...cambios,
  })}`

const revisar = (f: Seed, tabla: 'reporte' | 'solucion' | 'perfil_configuracion', id: number, cambios: Record<string, Valor>) =>
  f.sql`UPDATE ${f.sql(tabla)} SET ${f.sql.update({ revisor_id: f.revisor, revisado_en: new Date(), motivo_revision: 'probado', ...cambios })} WHERE id = ${id}`

const aprobarReporte = (f: Seed, evidencia: string | null) => revisar(f, 'reporte', f.rep, { estado_revision: 'aprobado', evidencia_revision: evidencia })

const falloDelReporte = (f: Seed) => f.sql`INSERT INTO reporte_fallo (reporte_id, tipo_fallo_id, detalle) VALUES (${f.rep}, ${f.tipoFallo}, 'pantalla negra al iniciar')`

const paso = (f: Seed, perfilId: number, orden = 1) =>
  f.sql`INSERT INTO paso_configuracion (perfil_id, orden, titulo, instruccion) VALUES (${perfilId}, ${orden}, 't', 'i')`

const solucion = (f: Seed) =>
  idOf(f.sql`INSERT INTO solucion (reporte_id, tipo_fallo_id, autor_id, titulo, instrucciones) VALUES (${f.rep}, ${f.tipoFallo}, 'revisor', 's', 'i') RETURNING id`)

type Caso = readonly [caso: string, restriccion: string, ofensa: (f: Seed) => Effect.Effect<unknown, SqlError.SqlError | Schema.SchemaError>]

const rechaza: ReadonlyArray<Caso> = [
  ['dependencia duplicada en un perfil', 'perfil_dependencia_pkey', (f) =>
    Effect.gen(function* () {
      const dep = (obligatoria: boolean) =>
        f.sql`INSERT INTO perfil_dependencia (perfil_id, dependencia_id, obligatoria, instruccion_instalacion) VALUES (${f.perfil}, ${f.dependencia}, ${obligatoria}, 'i')`
      yield* dep(true)
      yield* dep(false)
    })],
  ['fallo duplicado en un reporte', 'reporte_fallo_pkey', (f) => Effect.andThen(falloDelReporte(f), falloDelReporte(f))],
  ['reporte con edición inexistente', 'reporte_edicion_id_fkey', (f) => reporte(f, { edicion_id: 999999 })],
  ['equipo de un usuario inexistente', 'equipo_usuario_id_fkey', (f) => f.sql`INSERT INTO equipo (usuario_id, alias) VALUES ('nadie', 'pc')`],
  ['perfil con capa inexistente', 'perfil_configuracion_version_capa_id_fkey', (f) => perfil(f, { version_capa_id: 999999 })],
  ['correo repetido', 'usuario_correo_key', (f) =>
    f.sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES ('otro', 'otro', 'autor@demo.opengame.test', false, 'usuario', true)`],
  ['lanzador repetido', 'lanzador_nombre_key', (f) => f.sql`INSERT INTO lanzador (nombre) VALUES ('Steam')`],
  ['segunda edición del juego en el mismo lanzador', 'edicion_juego_juego_lanzador_uq', (f) =>
    f.sql`INSERT INTO edicion_juego (juego_id, lanzador_id) SELECT juego_id, lanzador_id FROM edicion_juego WHERE id = ${f.ed}`],
  ['identificador externo repetido en un lanzador', 'edicion_juego_externo_uq', (f) =>
    Effect.gen(function* () {
      yield* f.sql`UPDATE edicion_juego SET identificador_externo = '271590' WHERE id = ${f.ed}`
      yield* f.sql`UPDATE edicion_juego SET identificador_externo = '271590' WHERE id = ${f.ed2}`
    })],
  ['distribución y versión repetidas', 'distribucion_nombre_version_uq', (f) => f.sql`INSERT INTO distribucion (nombre, version) VALUES ('Linux Mint', '22')`],
  ['versión de capa repetida', 'version_capa_uq', (f) => f.sql`INSERT INTO version_capa (familia, variante, version) VALUES ('Proton', 'Valve', '9.0-4')`],
  ['dependencia repetida por nombre y gestor', 'dependencia_nombre_gestor_uq', (f) =>
    f.sql`INSERT INTO dependencia (nombre, gestor, descripcion) VALUES ('vcrun2019', 'winetricks', 'otra')`],
  ['tipo de fallo repetido', 'tipo_fallo_codigo_key', (f) => f.sql`INSERT INTO tipo_fallo (codigo, descripcion) VALUES ('otro', 'x')`],
  ['revisión de perfil repetida para el mismo entorno', 'perfil_configuracion_revision_uq', (f) => perfil(f, { revision: 1 })],
  ['captura repetida en el mismo instante', 'diagnostico_captura_uq', (f) => diagnostico(f, { capturado_en: new Date('2026-10-01T10:00:00Z') })],
  ['estado de revisión inválido', 'reporte_bloque_revision', (f) => f.sql`UPDATE reporte SET estado_revision = 'borrador' WHERE id = ${f.rep}`],
  ['resultado inválido', 'reporte_resultado_dominio', (f) => reporte(f, { resultado: 'regular' })],
  ['rol fuera del dominio', 'usuario_rol_dominio', (f) => f.sql`UPDATE usuario SET rol = 'superusuario' WHERE id = ${f.autor}`],
  ['familia de capa fuera del dominio', 'version_capa_familia_dominio', (f) => f.sql`INSERT INTO version_capa (familia, variante, version) VALUES ('DXVK', 'x', '2.4')`],
  ['sistema fuera del dominio', 'diagnostico_sistema_dominio', (f) => diagnostico(f, { sistema: 'macOS', distribucion_id: null })],
  ['soporte Vulkan fuera del dominio', 'diagnostico_soporte_vulkan_dominio', (f) => diagnostico(f, { soporte_vulkan: 'quizas' })],
  ['tipo de guía fuera del dominio', 'guia_adopcion_tipo_dominio', (f) => guia(f, { tipo: 'opinion' })],
  ['estado de guía fuera del dominio', 'guia_adopcion_estado_dominio', (f) => guia(f, { estado: 'oculta' })],
  ['RAM cero', 'diagnostico_ram_positiva', (f) => diagnostico(f, { ram_mb: 0 })],
  ['VRAM negativa', 'diagnostico_vram_no_negativa', (f) => diagnostico(f, { vram_mb: -1 })],
  ['nivel x86-64 fuera del dominio', 'diagnostico_nivel_x86_dominio', (f) => diagnostico(f, { nivel_x86: 'v5' })],
  ['TPM fuera del dominio', 'diagnostico_tpm_dominio', (f) => diagnostico(f, { tpm: '3.0' })],
  ['zram negativa', 'diagnostico_zram_no_negativa', (f) => diagnostico(f, { zram_mb: -1 })],
  ['API gráfica fuera del dominio', 'juego_api_api_dominio', (f) =>
    f.sql`INSERT INTO juego_api (juego_id, api) SELECT juego_id, 'd3d13' FROM edicion_juego WHERE id = ${f.ed}`],
  ['la misma API dos veces en un juego', 'juego_api_pkey', (f) =>
    f.sql`INSERT INTO juego_api (juego_id, api) SELECT juego_id, api FROM edicion_juego, (VALUES ('d3d11'), ('d3d11')) AS a(api) WHERE id = ${f.ed}`],
  ['CPU mínima fuera del dominio', 'juego_nivel_x86_min_dominio', (f) =>
    f.sql`UPDATE juego SET nivel_x86_min = 'v9' WHERE id = (SELECT juego_id FROM edicion_juego WHERE id = ${f.ed})`],
  ['FPS negativo', 'reporte_fps_no_negativo', (f) =>
    reporte(f, { fps_promedio: -1, resolucion: '1920x1080', calidad_grafica: 'alta', metodo_medicion: 'MangoHud' })],
  ['revisión de perfil cero', 'perfil_configuracion_revision_positiva', (f) => perfil(f, { revision: 0 })],
  ['RAM mínima cero en un perfil', 'perfil_configuracion_ram_min_positiva', (f) => perfil(f, { ram_min_mb: 0 })],
  ['VRAM mínima negativa en un perfil', 'perfil_configuracion_vram_min_no_negativa', (f) => perfil(f, { vram_min_mb: -1 })],
  ['paso con orden cero', 'paso_configuracion_orden_positivo', (f) => paso(f, f.perfil, 0)],
  ['dos pasos con el mismo orden en un perfil', 'paso_configuracion_pkey', (f) => Effect.andThen(paso(f, f.perfil), paso(f, f.perfil))],
  ['revisión de guía cero', 'guia_adopcion_revision_positiva', (f) => guia(f, { revision: 0 })],
  ['aprobación sin evidencia (NULL)', 'reporte_bloque_revision', (f) => aprobarReporte(f, null)],
  ['aprobación con evidencia en blanco', 'reporte_bloque_revision', (f) => aprobarReporte(f, '   ')],
  ['rechazo sin motivo', 'solucion_bloque_revision', (f) =>
    Effect.gen(function* () {
      yield* falloDelReporte(f)
      yield* revisar(f, 'solucion', yield* solucion(f), { estado_revision: 'rechazado', motivo_revision: null })
    })],
  ['evidencia en blanco en un rechazo', 'reporte_evidencia_revision_no_vacio', (f) =>
    revisar(f, 'reporte', f.rep, { estado_revision: 'rechazado', evidencia_revision: '  ' })],
  ['pendiente con revisor asignado', 'perfil_configuracion_bloque_revision', (f) => f.sql`UPDATE perfil_configuracion SET revisor_id = ${f.revisor} WHERE id = ${f.perfil}`],
  ...(['perfil_configuracion', 'reporte', 'solucion'] as const).map((tabla): Caso => [
    `revisión anterior a la creación (${tabla})`,
    `${tabla}_revision_posterior`,
    (f) =>
      Effect.gen(function* () {
        const id = tabla === 'perfil_configuracion' ? f.perfil : tabla === 'reporte' ? f.rep : yield* Effect.andThen(falloDelReporte(f), solucion(f))
        yield* revisar(f, tabla, id, { estado_revision: 'rechazado', revisado_en: new Date('2000-01-01T00:00:00Z') })
      }),
  ]),
  ['FPS sin resolución, calidad ni método', 'reporte_fps_con_contexto', (f) => reporte(f, { fps_promedio: 60 })],
  ['Linux sin distribución', 'diagnostico_linux_con_distribucion', (f) => diagnostico(f, { distribucion_id: null })],
  ['versión de Vulkan sin soporte', 'diagnostico_version_vulkan_solo_con_soporte', (f) => diagnostico(f, { soporte_vulkan: 'no', version_vulkan: '1.3' })],
  ['PCI id en mayúsculas', 'diagnostico_gpu_pci_id_formato', (f) => diagnostico(f, { gpu_pci_id: '10DE:0FC6' })],
  ['biblioteca de Steam que no es una lista', 'diagnostico_biblioteca_steam_forma', (f) => diagnostico(f, { biblioteca_steam: '{"app_id": 271590}' })],
  [`biblioteca de Steam de más de ${MAX_LIBRARY_GAMES} juegos`, 'diagnostico_biblioteca_steam_forma', (f) =>
    diagnostico(f, { biblioteca_steam: bibliotecaDe(MAX_LIBRARY_GAMES + 1) })],
  ['Vulkan mínimo en un perfil que no exige Vulkan', 'perfil_configuracion_vulkan_min_requiere_vulkan', (f) => perfil(f, { version_vulkan_min: '1.3' })],
  ['texto obligatorio en blanco', 'juego_titulo_no_vacio', (f) => f.sql`INSERT INTO juego (titulo, descripcion) VALUES ('   ', 'd')`],
  ['texto opcional en blanco', 'reporte_version_lanzador_no_vacio', (f) => reporte(f, { version_lanzador: ' ' })],
  ['versión de capa «latest»', 'version_capa_version_exacta', (f) => f.sql`INSERT INTO version_capa (familia, variante, version) VALUES ('Wine', 'Staging', 'Latest')`],
  ['correo sin normalizar', 'usuario_correo_normalizado', (f) =>
    f.sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES ('m', 'm', 'Mayus@demo.opengame.test', false, 'usuario', true)`],
  ['correo de más de 254 caracteres', 'usuario_correo_largo', (f) => f.sql`UPDATE usuario SET correo = ${`${'a'.repeat(245)}@demo.test`} WHERE id = ${f.autor}`],
  ['alias de usuario de más de 60 caracteres', 'usuario_alias_largo', (f) => f.sql`UPDATE usuario SET alias = ${'a'.repeat(61)} WHERE id = ${f.autor}`],
  ['código de tipo de fallo con espacios', 'tipo_fallo_codigo_formato', (f) => f.sql`INSERT INTO tipo_fallo (codigo, descripcion) VALUES ('Anti Cheat', 'x')`],
  ['guía actualizada antes de crearse', 'guia_adopcion_fechas_ordenadas', (f) => guia(f, { actualizado_en: new Date('2000-01-01T00:00:00Z') })],
  ['reporte con perfil de otra edición', 'reporte_perfil_fk', (f) => reporte(f, { edicion_id: f.ed2, perfil_id: f.perfil })],
  ['solución sobre un fallo que el reporte no tiene', 'solucion_fallo_fk', solucion],
  ['actualizar un diagnóstico', 'og_inmutable', (f) => f.sql`UPDATE diagnostico SET ram_mb = 16384 WHERE id = ${f.diag}`],
  ['cambiar el dueño de un equipo con diagnósticos', 'og_propietario_fijo', (f) => f.sql`UPDATE equipo SET usuario_id = ${f.revisor} WHERE id = ${f.equipo}`],
  ['reescribir un reporte', 'og_solo_revision', (f) => f.sql`UPDATE reporte SET observaciones = 'otra cosa' WHERE id = ${f.rep}`],
  ['reescribir una solución', 'og_solo_revision', (f) =>
    Effect.gen(function* () {
      yield* falloDelReporte(f)
      yield* f.sql`UPDATE solucion SET instrucciones = 'otra cosa' WHERE id = ${yield* solucion(f)}`
    })],
  ['agregar un paso a un perfil usado por un reporte', 'og_perfil_congelado', (f) => Effect.andThen(reporte(f, { perfil_id: f.perfil }), paso(f, f.perfil))],
  ['borrar un paso de un perfil usado por un reporte', 'og_perfil_congelado', (f) =>
    Effect.gen(function* () {
      yield* paso(f, f.perfil)
      yield* reporte(f, { perfil_id: f.perfil })
      yield* f.sql`DELETE FROM paso_configuracion WHERE perfil_id = ${f.perfil}`
    })],
  ['sacar un paso de un perfil revisado hacia otro pendiente', 'og_perfil_congelado', (f) =>
    Effect.gen(function* () {
      yield* paso(f, f.perfil)
      yield* revisar(f, 'perfil_configuracion', f.perfil, { estado_revision: 'rechazado' })
      const otro = yield* idOf(perfil(f))
      yield* f.sql`UPDATE paso_configuracion SET perfil_id = ${otro} WHERE perfil_id = ${f.perfil}`
    })],
  ['reescribir un perfil revisado', 'og_perfil_congelado', (f) =>
    Effect.andThen(
      revisar(f, 'perfil_configuracion', f.perfil, { estado_revision: 'rechazado' }),
      f.sql`UPDATE perfil_configuracion SET titulo = 'otro título' WHERE id = ${f.perfil}`,
    )],
  ['agregar una dependencia a un perfil revisado', 'og_perfil_congelado', (f) =>
    Effect.gen(function* () {
      yield* revisar(f, 'perfil_configuracion', f.perfil, { estado_revision: 'rechazado' })
      yield* f.sql`INSERT INTO perfil_dependencia (perfil_id, dependencia_id, obligatoria, instruccion_instalacion) VALUES (${f.perfil}, ${f.dependencia}, true, 'i')`
    })],
]

const accepts = (effect: Effect.Effect<unknown, unknown>) =>
  Effect.gen(function* () {
    expect(yield* constraintOf(effect)).toEqual(Option.none())
  })

layer(PgTest)('esquema', (it) => {
  describe('rechaza', () => {
    for (const [caso, restriccion, ofensa] of rechaza)
      it.effect(`${caso} -> ${restriccion}`, () =>
        inRollback(
          Effect.gen(function* () {
            const f = yield* seed
            expect(yield* constraintOf(ofensa(f))).toEqual(Option.some(restriccion))
          }),
        ),
      )
  })

  describe('permite', () => {
    const withSeed = (test: (f: Seed) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () => inRollback(Effect.flatMap(seed, test))

    it.effect('reporte sin perfil, en cualquier edición', withSeed((f) => accepts(reporte(f, { edicion_id: f.ed2, perfil_id: null }))))
    it.effect('reporte con un perfil de su edición y capa', withSeed((f) => accepts(reporte(f, { perfil_id: f.perfil }))))
    it.effect('varios diagnósticos históricos del mismo equipo', withSeed((f) =>
      Effect.andThen(accepts(diagnostico(f)), accepts(diagnostico(f, { capturado_en: new Date('2026-10-06T10:00:00Z'), version_controlador: '550.1' })))))
    it.effect('diagnóstico de Windows sin distribución', withSeed((f) => accepts(diagnostico(f, { sistema: 'Windows', version_sistema: '11', distribucion_id: null }))))
    it.effect(`diagnóstico con PCI id y biblioteca de Steam de ${MAX_LIBRARY_GAMES} juegos`, withSeed((f) =>
      accepts(diagnostico(f, { gpu_pci_id: '10de:0fc6', biblioteca_steam: bibliotecaDe(MAX_LIBRARY_GAMES) }))))
    it.effect('cambiar el dueño de un equipo sin diagnósticos', withSeed((f) =>
      Effect.gen(function* () {
        const nuevo = yield* idOf(f.sql`INSERT INTO equipo (usuario_id, alias) VALUES (${f.autor}, 'sobremesa') RETURNING id`)
        yield* accepts(f.sql`UPDATE equipo SET usuario_id = ${f.revisor} WHERE id = ${nuevo}`)
      })))
    it.effect('guía general sin distribución', withSeed((f) => accepts(guia(f, { distribucion_id: null }))))
    it.effect('varias ediciones sin identificador externo en el mismo lanzador', withSeed((f) =>
      Effect.gen(function* () {
        const juego = yield* idOf(f.sql`INSERT INTO juego (titulo, descripcion) VALUES ('Tercero', 'd') RETURNING id`)
        yield* accepts(f.sql`INSERT INTO edicion_juego (juego_id, lanzador_id) VALUES (${juego}, ${f.lanzador})`)
      })))
    it.effect('capa Nativo para un juego nativo de Linux', withSeed((f) =>
      Effect.gen(function* () {
        const nativo = yield* idOf(f.sql`INSERT INTO version_capa (familia, variante, version) VALUES ('Nativo', 'Steam Linux Runtime', '3.0') RETURNING id`)
        yield* accepts(reporte(f, { version_capa_id: nativo }))
      })))
    it.effect('aprobar con evidencia y luego retirar conservándola', withSeed((f) =>
      Effect.gen(function* () {
        yield* accepts(aprobarReporte(f, 'captura #12'))
        yield* accepts(revisar(f, 'reporte', f.rep, { estado_revision: 'retirado', motivo_revision: 'versión obsoleta' }))
        const [fila] = yield* f.sql`SELECT estado_revision, evidencia_revision FROM reporte WHERE id = ${f.rep}`
        expect(fila).toEqual({ estado_revision: 'retirado', evidencia_revision: 'captura #12' })
      })))
    it.effect('un perfil pendiente sin usar admite cambios, pasos y dependencias', withSeed((f) =>
      Effect.andThen(
        accepts(Effect.andThen(f.sql`UPDATE perfil_configuracion SET titulo = 'título corregido' WHERE id = ${f.perfil}`, paso(f, f.perfil))),
        accepts(f.sql`INSERT INTO perfil_dependencia (perfil_id, dependencia_id, obligatoria, instruccion_instalacion) VALUES (${f.perfil}, ${f.dependencia}, true, 'i')`),
      )))
  })

  describe('contrato con la aplicación', () => {
    it.effect('every ruleByConstraint key exists in the database', () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const filas = yield* sql`
          SELECT conname AS nombre FROM pg_constraint
          UNION SELECT (regexp_matches(prosrc, 'CONSTRAINT = ''(og_[a-z_]+)''', 'g'))[1] FROM pg_proc`
        const nombres = new Set(Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ nombre: Schema.String })))(filas).map((f) => f.nombre))
        expect(Object.keys(ruleByConstraint).filter((n) => !nombres.has(n))).toEqual([])
      }))

    it.effect('withDbRules turns a mapped constraint into ReglaIncumplida', () =>
      inRollback(
        Effect.gen(function* () {
          const f = yield* seed
          yield* falloDelReporte(f)
          const failure = yield* Effect.flip(withDbRules(falloDelReporte(f)))
          expect(failure).toEqual(new RuleViolated({ rule: 'fallo_duplicado' }))
        }),
      ))

    it.effect('better-auth no tiene nada que migrar sobre 1_auth', () =>
      Effect.promise(() => getMigrations(auth.options)).pipe(
        Effect.map(({ toBeCreated, toBeAdded }) => expect({ toBeCreated, toBeAdded }).toEqual({ toBeCreated: [], toBeAdded: [] })),
      ))
  })
})
