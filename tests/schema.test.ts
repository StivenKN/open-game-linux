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
  f.sql`INSERT INTO report ${f.sql.insert({
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
  f.sql`INSERT INTO diagnostic ${f.sql.insert({
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
  f.sql`INSERT INTO profile ${f.sql.insert({
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
  f.sql`INSERT INTO adoption_guide ${f.sql.insert({
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

const falloDelReporte = (f: Seed) => f.sql`INSERT INTO report_failure (report_id, failure_type_id, detail) VALUES (${f.rep}, ${f.tipoFallo}, 'pantalla negra al iniciar')`

const paso = (f: Seed, perfilId: number, orden = 1) =>
  f.sql`INSERT INTO profile_step (profile_id, position, title, instruction) VALUES (${perfilId}, ${orden}, 't', 'i')`

const solucion = (f: Seed) =>
  idOf(f.sql`INSERT INTO solution (report_id, failure_type_id, author_id, title, instructions) VALUES (${f.rep}, ${f.tipoFallo}, 'revisor', 's', 'i') RETURNING id`)

type Caso = readonly [caso: string, restriccion: string, ofensa: (f: Seed) => Effect.Effect<unknown, SqlError.SqlError | Schema.SchemaError>]

const rechaza: ReadonlyArray<Caso> = [
  ['dependencia duplicada en un perfil', 'profile_dependency_pkey', (f) =>
    Effect.gen(function* () {
      const dep = (obligatoria: boolean) =>
        f.sql`INSERT INTO profile_dependency (profile_id, dependency_id, required, install_instruction) VALUES (${f.perfil}, ${f.dependencia}, ${obligatoria}, 'i')`
      yield* dep(true)
      yield* dep(false)
    })],
  ['fallo duplicado en un reporte', 'report_failure_pkey', (f) => Effect.andThen(falloDelReporte(f), falloDelReporte(f))],
  ['reporte con edición inexistente', 'report_edition_id_fkey', (f) => reporte(f, { edicion_id: 999999 })],
  ['equipo de un usuario inexistente', 'machine_user_id_fkey', (f) => f.sql`INSERT INTO machine (user_id, alias) VALUES ('nadie', 'pc')`],
  ['perfil con capa inexistente', 'profile_layer_version_id_fkey', (f) => perfil(f, { version_capa_id: 999999 })],
  ['correo repetido', 'app_user_email_key', (f) =>
    f.sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES ('otro', 'otro', 'autor@demo.opengame.test', false, 'usuario', true)`],
  ['lanzador repetido', 'launcher_name_key', (f) => f.sql`INSERT INTO launcher (name) VALUES ('Steam')`],
  ['segunda edición del juego en el mismo lanzador', 'game_edition_game_launcher_uq', (f) =>
    f.sql`INSERT INTO game_edition (game_id, launcher_id) SELECT game_id, launcher_id FROM game_edition WHERE id = ${f.ed}`],
  ['identificador externo repetido en un lanzador', 'game_edition_external_uq', (f) =>
    Effect.gen(function* () {
      yield* f.sql`UPDATE game_edition SET external_id = '271590' WHERE id = ${f.ed}`
      yield* f.sql`UPDATE game_edition SET external_id = '271590' WHERE id = ${f.ed2}`
    })],
  ['distribución y versión repetidas', 'distribution_name_version_uq', (f) => f.sql`INSERT INTO distribution (name, version) VALUES ('Linux Mint', '22')`],
  ['versión de capa repetida', 'layer_version_uq', (f) => f.sql`INSERT INTO layer_version (family, variant, version) VALUES ('Proton', 'Valve', '9.0-4')`],
  ['dependencia repetida por nombre y gestor', 'dependency_name_package_manager_uq', (f) =>
    f.sql`INSERT INTO dependency (name, package_manager, description) VALUES ('vcrun2019', 'winetricks', 'otra')`],
  ['tipo de fallo repetido', 'failure_type_code_key', (f) => f.sql`INSERT INTO failure_type (code, description) VALUES ('otro', 'x')`],
  ['revisión de perfil repetida para el mismo entorno', 'profile_revision_uq', (f) => perfil(f, { revision: 1 })],
  ['captura repetida en el mismo instante', 'diagnostic_capture_uq', (f) => diagnostico(f, { capturado_en: new Date('2026-10-01T10:00:00Z') })],
  ['estado de revisión inválido', 'report_review_block', (f) => f.sql`UPDATE report SET review_status = 'borrador' WHERE id = ${f.rep}`],
  ['resultado inválido', 'report_outcome_domain', (f) => reporte(f, { resultado: 'regular' })],
  ['rol fuera del dominio', 'app_user_role_domain', (f) => f.sql`UPDATE app_user SET role = 'superusuario' WHERE id = ${f.autor}`],
  ['familia de capa fuera del dominio', 'layer_version_family_domain', (f) => f.sql`INSERT INTO layer_version (family, variant, version) VALUES ('DXVK', 'x', '2.4')`],
  ['sistema fuera del dominio', 'diagnostic_operating_system_domain', (f) => diagnostico(f, { sistema: 'macOS', distribucion_id: null })],
  ['soporte Vulkan fuera del dominio', 'diagnostic_vulkan_support_domain', (f) => diagnostico(f, { soporte_vulkan: 'quizas' })],
  ['tipo de guía fuera del dominio', 'adoption_guide_type_domain', (f) => guia(f, { tipo: 'opinion' })],
  ['estado de guía fuera del dominio', 'adoption_guide_status_domain', (f) => guia(f, { estado: 'oculta' })],
  ['RAM cero', 'diagnostic_ram_positive', (f) => diagnostico(f, { ram_mb: 0 })],
  ['VRAM negativa', 'diagnostic_vram_non_negative', (f) => diagnostico(f, { vram_mb: -1 })],
  ['nivel x86-64 fuera del dominio', 'diagnostic_x86_level_domain', (f) => diagnostico(f, { nivel_x86: 'v5' })],
  ['TPM fuera del dominio', 'diagnostic_tpm_domain', (f) => diagnostico(f, { tpm: '3.0' })],
  ['zram negativa', 'diagnostic_zram_non_negative', (f) => diagnostico(f, { zram_mb: -1 })],
  ['API gráfica fuera del dominio', 'game_api_api_domain', (f) =>
    f.sql`INSERT INTO game_api (game_id, api) SELECT game_id, 'd3d13' FROM game_edition WHERE id = ${f.ed}`],
  ['la misma API dos veces en un juego', 'game_api_pkey', (f) =>
    f.sql`INSERT INTO game_api (game_id, api) SELECT game_id, api FROM game_edition, (VALUES ('d3d11'), ('d3d11')) AS a(api) WHERE id = ${f.ed}`],
  ['CPU mínima fuera del dominio', 'game_x86_level_min_domain', (f) =>
    f.sql`UPDATE game SET x86_level_min = 'v9' WHERE id = (SELECT game_id FROM game_edition WHERE id = ${f.ed})`],
  ['FPS negativo', 'report_fps_non_negative', (f) =>
    reporte(f, { fps_promedio: -1, resolucion: '1920x1080', calidad_grafica: 'alta', metodo_medicion: 'MangoHud' })],
  ['revisión de perfil cero', 'profile_revision_positive', (f) => perfil(f, { revision: 0 })],
  ['RAM mínima cero en un perfil', 'profile_ram_min_positive', (f) => perfil(f, { ram_min_mb: 0 })],
  ['VRAM mínima negativa en un perfil', 'profile_vram_min_non_negative', (f) => perfil(f, { vram_min_mb: -1 })],
  ['paso con orden cero', 'profile_step_position_positive', (f) => paso(f, f.perfil, 0)],
  ['dos pasos con el mismo orden en un perfil', 'profile_step_pkey', (f) => Effect.andThen(paso(f, f.perfil), paso(f, f.perfil))],
  ['revisión de guía cero', 'adoption_guide_revision_positive', (f) => guia(f, { revision: 0 })],
  ['aprobación sin evidencia (NULL)', 'report_review_block', (f) => aprobarReporte(f, null)],
  ['aprobación con evidencia en blanco', 'report_review_block', (f) => aprobarReporte(f, '   ')],
  ['rechazo sin motivo', 'solution_review_block', (f) =>
    Effect.gen(function* () {
      yield* falloDelReporte(f)
      yield* revisar(f, 'solucion', yield* solucion(f), { estado_revision: 'rechazado', motivo_revision: null })
    })],
  ['evidencia en blanco en un rechazo', 'report_review_evidence_not_blank', (f) =>
    revisar(f, 'reporte', f.rep, { estado_revision: 'rechazado', evidencia_revision: '  ' })],
  ['pendiente con revisor asignado', 'profile_review_block', (f) => f.sql`UPDATE profile SET reviewer_id = ${f.revisor} WHERE id = ${f.perfil}`],
  ...(['perfil_configuracion', 'reporte', 'solucion'] as const).map((tabla): Caso => [
    `revisión anterior a la creación (${tabla})`,
    `${tabla}_revision_posterior`,
    (f) =>
      Effect.gen(function* () {
        const id = tabla === 'perfil_configuracion' ? f.perfil : tabla === 'reporte' ? f.rep : yield* Effect.andThen(falloDelReporte(f), solucion(f))
        yield* revisar(f, tabla, id, { estado_revision: 'rechazado', revisado_en: new Date('2000-01-01T00:00:00Z') })
      }),
  ]),
  ['FPS sin resolución, calidad ni método', 'report_fps_with_context', (f) => reporte(f, { fps_promedio: 60 })],
  ['Linux sin distribución', 'diagnostic_linux_has_distribution', (f) => diagnostico(f, { distribucion_id: null })],
  ['versión de Vulkan sin soporte', 'diagnostic_vulkan_version_needs_support', (f) => diagnostico(f, { soporte_vulkan: 'no', version_vulkan: '1.3' })],
  ['PCI id en mayúsculas', 'diagnostic_gpu_pci_id_format', (f) => diagnostico(f, { gpu_pci_id: '10DE:0FC6' })],
  ['biblioteca de Steam que no es una lista', 'diagnostic_steam_library_shape', (f) => diagnostico(f, { biblioteca_steam: '{"app_id": 271590}' })],
  [`biblioteca de Steam de más de ${MAX_LIBRARY_GAMES} juegos`, 'diagnostic_steam_library_shape', (f) =>
    diagnostico(f, { biblioteca_steam: bibliotecaDe(MAX_LIBRARY_GAMES + 1) })],
  ['Vulkan mínimo en un perfil que no exige Vulkan', 'profile_vulkan_min_requires_vulkan', (f) => perfil(f, { version_vulkan_min: '1.3' })],
  ['texto obligatorio en blanco', 'game_title_not_blank', (f) => f.sql`INSERT INTO game (title, description) VALUES ('   ', 'd')`],
  ['texto opcional en blanco', 'report_launcher_version_not_blank', (f) => reporte(f, { version_lanzador: ' ' })],
  ['versión de capa «latest»', 'layer_version_exact_version', (f) => f.sql`INSERT INTO layer_version (family, variant, version) VALUES ('Wine', 'Staging', 'Latest')`],
  ['correo sin normalizar', 'app_user_email_normalized', (f) =>
    f.sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES ('m', 'm', 'Mayus@demo.opengame.test', false, 'usuario', true)`],
  ['correo de más de 254 caracteres', 'app_user_email_length', (f) => f.sql`UPDATE app_user SET email = ${`${'a'.repeat(245)}@demo.test`} WHERE id = ${f.autor}`],
  ['alias de usuario de más de 60 caracteres', 'app_user_alias_length', (f) => f.sql`UPDATE app_user SET alias = ${'a'.repeat(61)} WHERE id = ${f.autor}`],
  ['código de tipo de fallo con espacios', 'failure_type_code_format', (f) => f.sql`INSERT INTO failure_type (code, description) VALUES ('Anti Cheat', 'x')`],
  ['guía actualizada antes de crearse', 'adoption_guide_dates_ordered', (f) => guia(f, { actualizado_en: new Date('2000-01-01T00:00:00Z') })],
  ['reporte con perfil de otra edición', 'report_profile_fk', (f) => reporte(f, { edicion_id: f.ed2, perfil_id: f.perfil })],
  ['solución sobre un fallo que el reporte no tiene', 'solution_failure_fk', solucion],
  ['actualizar un diagnóstico', 'og_immutable', (f) => f.sql`UPDATE diagnostic SET ram_mb = 16384 WHERE id = ${f.diag}`],
  ['cambiar el dueño de un equipo con diagnósticos', 'og_owner_fixed', (f) => f.sql`UPDATE machine SET user_id = ${f.revisor} WHERE id = ${f.equipo}`],
  ['reescribir un reporte', 'og_review_only', (f) => f.sql`UPDATE report SET observations = 'otra cosa' WHERE id = ${f.rep}`],
  ['reescribir una solución', 'og_review_only', (f) =>
    Effect.gen(function* () {
      yield* falloDelReporte(f)
      yield* f.sql`UPDATE solution SET instructions = 'otra cosa' WHERE id = ${yield* solucion(f)}`
    })],
  ['agregar un paso a un perfil usado por un reporte', 'og_profile_frozen', (f) => Effect.andThen(reporte(f, { perfil_id: f.perfil }), paso(f, f.perfil))],
  ['borrar un paso de un perfil usado por un reporte', 'og_profile_frozen', (f) =>
    Effect.gen(function* () {
      yield* paso(f, f.perfil)
      yield* reporte(f, { perfil_id: f.perfil })
      yield* f.sql`DELETE FROM profile_step WHERE profile_id = ${f.perfil}`
    })],
  ['sacar un paso de un perfil revisado hacia otro pendiente', 'og_profile_frozen', (f) =>
    Effect.gen(function* () {
      yield* paso(f, f.perfil)
      yield* revisar(f, 'perfil_configuracion', f.perfil, { estado_revision: 'rechazado' })
      const otro = yield* idOf(perfil(f))
      yield* f.sql`UPDATE profile_step SET profile_id = ${otro} WHERE profile_id = ${f.perfil}`
    })],
  ['reescribir un perfil revisado', 'og_profile_frozen', (f) =>
    Effect.andThen(
      revisar(f, 'perfil_configuracion', f.perfil, { estado_revision: 'rechazado' }),
      f.sql`UPDATE profile SET title = 'otro título' WHERE id = ${f.perfil}`,
    )],
  ['agregar una dependencia a un perfil revisado', 'og_profile_frozen', (f) =>
    Effect.gen(function* () {
      yield* revisar(f, 'perfil_configuracion', f.perfil, { estado_revision: 'rechazado' })
      yield* f.sql`INSERT INTO profile_dependency (profile_id, dependency_id, required, install_instruction) VALUES (${f.perfil}, ${f.dependencia}, true, 'i')`
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
        const nuevo = yield* idOf(f.sql`INSERT INTO machine (user_id, alias) VALUES (${f.autor}, 'sobremesa') RETURNING id`)
        yield* accepts(f.sql`UPDATE machine SET user_id = ${f.revisor} WHERE id = ${nuevo}`)
      })))
    it.effect('guía general sin distribución', withSeed((f) => accepts(guia(f, { distribucion_id: null }))))
    it.effect('varias ediciones sin identificador externo en el mismo lanzador', withSeed((f) =>
      Effect.gen(function* () {
        const juego = yield* idOf(f.sql`INSERT INTO game (title, description) VALUES ('Tercero', 'd') RETURNING id`)
        yield* accepts(f.sql`INSERT INTO game_edition (game_id, launcher_id) VALUES (${juego}, ${f.lanzador})`)
      })))
    it.effect('capa Nativo para un juego nativo de Linux', withSeed((f) =>
      Effect.gen(function* () {
        const nativo = yield* idOf(f.sql`INSERT INTO layer_version (family, variant, version) VALUES ('Nativo', 'Steam Linux Runtime', '3.0') RETURNING id`)
        yield* accepts(reporte(f, { version_capa_id: nativo }))
      })))
    it.effect('aprobar con evidencia y luego retirar conservándola', withSeed((f) =>
      Effect.gen(function* () {
        yield* accepts(aprobarReporte(f, 'captura #12'))
        yield* accepts(revisar(f, 'reporte', f.rep, { estado_revision: 'retirado', motivo_revision: 'versión obsoleta' }))
        const [fila] = yield* f.sql`SELECT review_status, review_evidence FROM report WHERE id = ${f.rep}`
        expect(fila).toEqual({ estado_revision: 'retirado', evidencia_revision: 'captura #12' })
      })))
    it.effect('un perfil pendiente sin usar admite cambios, pasos y dependencias', withSeed((f) =>
      Effect.andThen(
        accepts(Effect.andThen(f.sql`UPDATE profile SET title = 'título corregido' WHERE id = ${f.perfil}`, paso(f, f.perfil))),
        accepts(f.sql`INSERT INTO profile_dependency (profile_id, dependency_id, required, install_instruction) VALUES (${f.perfil}, ${f.dependencia}, true, 'i')`),
      )))
  })

  describe('contrato con la aplicación', () => {
    it.effect('every ruleByConstraint key exists in the database', () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const filas = yield* sql`
          SELECT conname AS name FROM pg_constraint
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
