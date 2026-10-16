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

type Value = string | number | boolean | Date | null

const report = (f: Seed, overrides: Record<string, Value> = {}) =>
  f.sql`INSERT INTO report ${f.sql.insert({
    edition_id: f.ed,
    diagnostic_id: f.diag,
    layer_version_id: f.layer,
    game_version: '1.0',
    tested_at: new Date('2026-10-03T10:00:00Z'),
    outcome: 'funciona',
    observations: 'sin problemas',
    ...overrides,
  })} RETURNING id`

const diagnostic = (f: Seed, overrides: Record<string, Value> = {}) =>
  f.sql`INSERT INTO diagnostic ${f.sql.insert({
    machine_id: f.machine,
    captured_at: new Date('2026-10-05T10:00:00Z'),
    operating_system: 'Linux',
    os_version: '6.9',
    distribution_id: f.dist,
    architecture: 'x86_64',
    cpu_model: 'cpu',
    gpu_model: 'gpu',
    ram_mb: 8192,
    vulkan_support: 'no',
    ...overrides,
  })}`

const libraryOf = (games: number) => JSON.stringify(Array.from({ length: games }, (_, i) => ({ app_id: i + 1, nombre: 'juego' })))

const profile = (f: Seed, overrides: Record<string, Value> = {}) =>
  f.sql`INSERT INTO profile ${f.sql.insert({
    edition_id: f.ed,
    distribution_id: f.dist,
    layer_version_id: f.layer,
    author_id: f.author,
    architecture: 'x86_64',
    revision: 2,
    title: 'perfil',
    ...overrides,
  })} RETURNING id`

const guide = (f: Seed, overrides: Record<string, Value> = {}) =>
  f.sql`INSERT INTO adoption_guide ${f.sql.insert({
    author_id: f.reviewer,
    type: 'instalacion',
    title: 'Instalar Linux Mint',
    content: 'Pasos',
    revision: 1,
    status: 'publicada',
    ...overrides,
  })}`

const review = (f: Seed, table: 'report' | 'solution' | 'profile', id: number, overrides: Record<string, Value>) =>
  f.sql`UPDATE ${f.sql(table)} SET ${f.sql.update({ reviewer_id: f.reviewer, reviewed_at: new Date(), review_reason: 'probado', ...overrides })} WHERE id = ${id}`

const approveReport = (f: Seed, evidence: string | null) => review(f, 'report', f.rep, { review_status: 'aprobado', review_evidence: evidence })

const reportFailure = (f: Seed) => f.sql`INSERT INTO report_failure (report_id, failure_type_id, detail) VALUES (${f.rep}, ${f.failureType}, 'pantalla negra al iniciar')`

const step = (f: Seed, profileId: number, position = 1) =>
  f.sql`INSERT INTO profile_step (profile_id, position, title, instruction) VALUES (${profileId}, ${position}, 't', 'i')`

const solution = (f: Seed) =>
  idOf(f.sql`INSERT INTO solution (report_id, failure_type_id, author_id, title, instructions) VALUES (${f.rep}, ${f.failureType}, 'revisor', 's', 'i') RETURNING id`)

type Case = readonly [title: string, constraint: string, offense: (f: Seed) => Effect.Effect<unknown, SqlError.SqlError | Schema.SchemaError>]

const rejects: ReadonlyArray<Case> = [
  ['dependencia duplicada en un perfil', 'profile_dependency_pkey', (f) =>
    Effect.gen(function* () {
      const dep = (required: boolean) =>
        f.sql`INSERT INTO profile_dependency (profile_id, dependency_id, required, install_instruction) VALUES (${f.profile}, ${f.dependency}, ${required}, 'i')`
      yield* dep(true)
      yield* dep(false)
    })],
  ['fallo duplicado en un reporte', 'report_failure_pkey', (f) => Effect.andThen(reportFailure(f), reportFailure(f))],
  ['reporte con edición inexistente', 'report_edition_id_fkey', (f) => report(f, { edition_id: 999999 })],
  ['equipo de un usuario inexistente', 'machine_user_id_fkey', (f) => f.sql`INSERT INTO machine (user_id, alias) VALUES ('nadie', 'pc')`],
  ['perfil con capa inexistente', 'profile_layer_version_id_fkey', (f) => profile(f, { layer_version_id: 999999 })],
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
  ['revisión de perfil repetida para el mismo entorno', 'profile_revision_uq', (f) => profile(f, { revision: 1 })],
  ['captura repetida en el mismo instante', 'diagnostic_capture_uq', (f) => diagnostic(f, { captured_at: new Date('2026-10-01T10:00:00Z') })],
  ['estado de revisión inválido', 'report_review_block', (f) => f.sql`UPDATE report SET review_status = 'borrador' WHERE id = ${f.rep}`],
  ['resultado inválido', 'report_outcome_domain', (f) => report(f, { outcome: 'regular' })],
  ['rol fuera del dominio', 'app_user_role_domain', (f) => f.sql`UPDATE app_user SET role = 'superusuario' WHERE id = ${f.author}`],
  ['familia de capa fuera del dominio', 'layer_version_family_domain', (f) => f.sql`INSERT INTO layer_version (family, variant, version) VALUES ('DXVK', 'x', '2.4')`],
  ['sistema fuera del dominio', 'diagnostic_operating_system_domain', (f) => diagnostic(f, { operating_system: 'macOS', distribution_id: null })],
  ['soporte Vulkan fuera del dominio', 'diagnostic_vulkan_support_domain', (f) => diagnostic(f, { vulkan_support: 'quizas' })],
  ['tipo de guía fuera del dominio', 'adoption_guide_type_domain', (f) => guide(f, { type: 'opinion' })],
  ['estado de guía fuera del dominio', 'adoption_guide_status_domain', (f) => guide(f, { status: 'oculta' })],
  ['RAM cero', 'diagnostic_ram_positive', (f) => diagnostic(f, { ram_mb: 0 })],
  ['VRAM negativa', 'diagnostic_vram_non_negative', (f) => diagnostic(f, { vram_mb: -1 })],
  ['nivel x86-64 fuera del dominio', 'diagnostic_x86_level_domain', (f) => diagnostic(f, { x86_level: 'v5' })],
  ['TPM fuera del dominio', 'diagnostic_tpm_domain', (f) => diagnostic(f, { tpm: '3.0' })],
  ['zram negativa', 'diagnostic_zram_non_negative', (f) => diagnostic(f, { zram_mb: -1 })],
  ['API gráfica fuera del dominio', 'game_api_api_domain', (f) =>
    f.sql`INSERT INTO game_api (game_id, api) SELECT game_id, 'd3d13' FROM game_edition WHERE id = ${f.ed}`],
  ['la misma API dos veces en un juego', 'game_api_pkey', (f) =>
    f.sql`INSERT INTO game_api (game_id, api) SELECT game_id, api FROM game_edition, (VALUES ('d3d11'), ('d3d11')) AS a(api) WHERE id = ${f.ed}`],
  ['CPU mínima fuera del dominio', 'game_x86_level_min_domain', (f) =>
    f.sql`UPDATE game SET x86_level_min = 'v9' WHERE id = (SELECT game_id FROM game_edition WHERE id = ${f.ed})`],
  ['FPS negativo', 'report_fps_non_negative', (f) =>
    report(f, { avg_fps: -1, resolution: '1920x1080', graphics_quality: 'alta', measurement_method: 'MangoHud' })],
  ['revisión de perfil cero', 'profile_revision_positive', (f) => profile(f, { revision: 0 })],
  ['RAM mínima cero en un perfil', 'profile_ram_min_positive', (f) => profile(f, { ram_min_mb: 0 })],
  ['VRAM mínima negativa en un perfil', 'profile_vram_min_non_negative', (f) => profile(f, { vram_min_mb: -1 })],
  ['paso con orden cero', 'profile_step_position_positive', (f) => step(f, f.profile, 0)],
  ['dos pasos con el mismo orden en un perfil', 'profile_step_pkey', (f) => Effect.andThen(step(f, f.profile), step(f, f.profile))],
  ['revisión de guía cero', 'adoption_guide_revision_positive', (f) => guide(f, { revision: 0 })],
  ['aprobación sin evidencia (NULL)', 'report_review_block', (f) => approveReport(f, null)],
  ['aprobación con evidencia en blanco', 'report_review_block', (f) => approveReport(f, '   ')],
  ['rechazo sin motivo', 'solution_review_block', (f) =>
    Effect.gen(function* () {
      yield* reportFailure(f)
      yield* review(f, 'solution', yield* solution(f), { review_status: 'rechazado', review_reason: null })
    })],
  ['evidencia en blanco en un rechazo', 'report_review_evidence_not_blank', (f) =>
    review(f, 'report', f.rep, { review_status: 'rechazado', review_evidence: '  ' })],
  ['pendiente con revisor asignado', 'profile_review_block', (f) => f.sql`UPDATE profile SET reviewer_id = ${f.reviewer} WHERE id = ${f.profile}`],
  ...(['profile', 'report', 'solution'] as const).map((table): Case => [
    `revisión anterior a la creación (${table})`,
    `${table}_reviewed_after_created`,
    (f) =>
      Effect.gen(function* () {
        const id = table === 'profile' ? f.profile : table === 'report' ? f.rep : yield* Effect.andThen(reportFailure(f), solution(f))
        yield* review(f, table, id, { review_status: 'rechazado', reviewed_at: new Date('2000-01-01T00:00:00Z') })
      }),
  ]),
  ['FPS sin resolución, calidad ni método', 'report_fps_with_context', (f) => report(f, { avg_fps: 60 })],
  ['Linux sin distribución', 'diagnostic_linux_has_distribution', (f) => diagnostic(f, { distribution_id: null })],
  ['versión de Vulkan sin soporte', 'diagnostic_vulkan_version_needs_support', (f) => diagnostic(f, { vulkan_support: 'no', vulkan_version: '1.3' })],
  ['PCI id en mayúsculas', 'diagnostic_gpu_pci_id_format', (f) => diagnostic(f, { gpu_pci_id: '10DE:0FC6' })],
  ['biblioteca de Steam que no es una lista', 'diagnostic_steam_library_shape', (f) => diagnostic(f, { steam_library: '{"app_id": 271590}' })],
  [`biblioteca de Steam de más de ${MAX_LIBRARY_GAMES} juegos`, 'diagnostic_steam_library_shape', (f) =>
    diagnostic(f, { steam_library: libraryOf(MAX_LIBRARY_GAMES + 1) })],
  ['Vulkan mínimo en un perfil que no exige Vulkan', 'profile_vulkan_min_requires_vulkan', (f) => profile(f, { vulkan_version_min: '1.3' })],
  ['texto obligatorio en blanco', 'game_title_not_blank', (f) => f.sql`INSERT INTO game (title, description) VALUES ('   ', 'd')`],
  ['texto opcional en blanco', 'report_launcher_version_not_blank', (f) => report(f, { launcher_version: ' ' })],
  ['versión de capa «latest»', 'layer_version_exact_version', (f) => f.sql`INSERT INTO layer_version (family, variant, version) VALUES ('Wine', 'Staging', 'Latest')`],
  ['correo sin normalizar', 'app_user_email_normalized', (f) =>
    f.sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES ('m', 'm', 'Mayus@demo.opengame.test', false, 'usuario', true)`],
  ['correo de más de 254 caracteres', 'app_user_email_length', (f) => f.sql`UPDATE app_user SET email = ${`${'a'.repeat(245)}@demo.test`} WHERE id = ${f.author}`],
  ['alias de usuario de más de 60 caracteres', 'app_user_alias_length', (f) => f.sql`UPDATE app_user SET alias = ${'a'.repeat(61)} WHERE id = ${f.author}`],
  ['código de tipo de fallo con espacios', 'failure_type_code_format', (f) => f.sql`INSERT INTO failure_type (code, description) VALUES ('Anti Cheat', 'x')`],
  ['guía actualizada antes de crearse', 'adoption_guide_dates_ordered', (f) => guide(f, { updated_at: new Date('2000-01-01T00:00:00Z') })],
  ['reporte con perfil de otra edición', 'report_profile_fk', (f) => report(f, { edition_id: f.ed2, profile_id: f.profile })],
  ['solución sobre un fallo que el reporte no tiene', 'solution_failure_fk', solution],
  ['actualizar un diagnóstico', 'og_immutable', (f) => f.sql`UPDATE diagnostic SET ram_mb = 16384 WHERE id = ${f.diag}`],
  ['cambiar el dueño de un equipo con diagnósticos', 'og_owner_fixed', (f) => f.sql`UPDATE machine SET user_id = ${f.reviewer} WHERE id = ${f.machine}`],
  ['reescribir un reporte', 'og_review_only', (f) => f.sql`UPDATE report SET observations = 'otra cosa' WHERE id = ${f.rep}`],
  ['reescribir una solución', 'og_review_only', (f) =>
    Effect.gen(function* () {
      yield* reportFailure(f)
      yield* f.sql`UPDATE solution SET instructions = 'otra cosa' WHERE id = ${yield* solution(f)}`
    })],
  ['agregar un paso a un perfil usado por un reporte', 'og_profile_frozen', (f) => Effect.andThen(report(f, { profile_id: f.profile }), step(f, f.profile))],
  ['borrar un paso de un perfil usado por un reporte', 'og_profile_frozen', (f) =>
    Effect.gen(function* () {
      yield* step(f, f.profile)
      yield* report(f, { profile_id: f.profile })
      yield* f.sql`DELETE FROM profile_step WHERE profile_id = ${f.profile}`
    })],
  ['sacar un paso de un perfil revisado hacia otro pendiente', 'og_profile_frozen', (f) =>
    Effect.gen(function* () {
      yield* step(f, f.profile)
      yield* review(f, 'profile', f.profile, { review_status: 'rechazado' })
      const other = yield* idOf(profile(f))
      yield* f.sql`UPDATE profile_step SET profile_id = ${other} WHERE profile_id = ${f.profile}`
    })],
  ['reescribir un perfil revisado', 'og_profile_frozen', (f) =>
    Effect.andThen(
      review(f, 'profile', f.profile, { review_status: 'rechazado' }),
      f.sql`UPDATE profile SET title = 'otro título' WHERE id = ${f.profile}`,
    )],
  ['agregar una dependencia a un perfil revisado', 'og_profile_frozen', (f) =>
    Effect.gen(function* () {
      yield* review(f, 'profile', f.profile, { review_status: 'rechazado' })
      yield* f.sql`INSERT INTO profile_dependency (profile_id, dependency_id, required, install_instruction) VALUES (${f.profile}, ${f.dependency}, true, 'i')`
    })],
]

const accepts = (effect: Effect.Effect<unknown, unknown>) =>
  Effect.gen(function* () {
    expect(yield* constraintOf(effect)).toEqual(Option.none())
  })

layer(PgTest)('esquema', (it) => {
  describe('rechaza', () => {
    for (const [title, constraint, offense] of rejects)
      it.effect(`${title} -> ${constraint}`, () =>
        inRollback(
          Effect.gen(function* () {
            const f = yield* seed
            expect(yield* constraintOf(offense(f))).toEqual(Option.some(constraint))
          }),
        ),
      )
  })

  describe('permite', () => {
    const withSeed = (test: (f: Seed) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () => inRollback(Effect.flatMap(seed, test))

    it.effect('reporte sin perfil, en cualquier edición', withSeed((f) => accepts(report(f, { edition_id: f.ed2, profile_id: null }))))
    it.effect('reporte con un perfil de su edición y capa', withSeed((f) => accepts(report(f, { profile_id: f.profile }))))
    it.effect('varios diagnósticos históricos del mismo equipo', withSeed((f) =>
      Effect.andThen(accepts(diagnostic(f)), accepts(diagnostic(f, { captured_at: new Date('2026-10-06T10:00:00Z'), driver_version: '550.1' })))))
    it.effect('diagnóstico de Windows sin distribución', withSeed((f) => accepts(diagnostic(f, { operating_system: 'Windows', os_version: '11', distribution_id: null }))))
    it.effect(`diagnóstico con PCI id y biblioteca de Steam de ${MAX_LIBRARY_GAMES} juegos`, withSeed((f) =>
      accepts(diagnostic(f, { gpu_pci_id: '10de:0fc6', steam_library: libraryOf(MAX_LIBRARY_GAMES) }))))
    it.effect('cambiar el dueño de un equipo sin diagnósticos', withSeed((f) =>
      Effect.gen(function* () {
        const inserted = yield* idOf(f.sql`INSERT INTO machine (user_id, alias) VALUES (${f.author}, 'sobremesa') RETURNING id`)
        yield* accepts(f.sql`UPDATE machine SET user_id = ${f.reviewer} WHERE id = ${inserted}`)
      })))
    it.effect('guía general sin distribución', withSeed((f) => accepts(guide(f, { distribution_id: null }))))
    it.effect('varias ediciones sin identificador externo en el mismo lanzador', withSeed((f) =>
      Effect.gen(function* () {
        const game = yield* idOf(f.sql`INSERT INTO game (title, description) VALUES ('Tercero', 'd') RETURNING id`)
        yield* accepts(f.sql`INSERT INTO game_edition (game_id, launcher_id) VALUES (${game}, ${f.launcher})`)
      })))
    it.effect('capa Nativo para un juego nativo de Linux', withSeed((f) =>
      Effect.gen(function* () {
        const native = yield* idOf(f.sql`INSERT INTO layer_version (family, variant, version) VALUES ('Nativo', 'Steam Linux Runtime', '3.0') RETURNING id`)
        yield* accepts(report(f, { layer_version_id: native }))
      })))
    it.effect('aprobar con evidencia y luego retirar conservándola', withSeed((f) =>
      Effect.gen(function* () {
        yield* accepts(approveReport(f, 'captura #12'))
        yield* accepts(review(f, 'report', f.rep, { review_status: 'retirado', review_reason: 'versión obsoleta' }))
        const [row] = yield* f.sql`SELECT review_status, review_evidence FROM report WHERE id = ${f.rep}`
        expect(row).toEqual({ review_status: 'retirado', review_evidence: 'captura #12' })
      })))
    it.effect('un perfil pendiente sin usar admite cambios, pasos y dependencias', withSeed((f) =>
      Effect.andThen(
        accepts(Effect.andThen(f.sql`UPDATE profile SET title = 'título corregido' WHERE id = ${f.profile}`, step(f, f.profile))),
        accepts(f.sql`INSERT INTO profile_dependency (profile_id, dependency_id, required, install_instruction) VALUES (${f.profile}, ${f.dependency}, true, 'i')`),
      )))
  })

  describe('contrato con la aplicación', () => {
    it.effect('every ruleByConstraint key exists in the database', () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const rows = yield* sql`
          SELECT conname AS name FROM pg_constraint
          UNION SELECT (regexp_matches(prosrc, 'CONSTRAINT = ''(og_[a-z_]+)''', 'g'))[1] FROM pg_proc`
        const names = new Set(Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ name: Schema.String })))(rows).map((f) => f.name))
        expect(Object.keys(ruleByConstraint).filter((n) => !names.has(n))).toEqual([])
      }))

    it.effect('withDbRules turns a mapped constraint into ReglaIncumplida', () =>
      inRollback(
        Effect.gen(function* () {
          const f = yield* seed
          yield* reportFailure(f)
          const failure = yield* Effect.flip(withDbRules(reportFailure(f)))
          expect(failure).toEqual(new RuleViolated({ rule: 'fallo_duplicado' }))
        }),
      ))

    it.effect('better-auth no tiene nada que migrar sobre 1_auth', () =>
      Effect.promise(() => getMigrations(auth.options)).pipe(
        Effect.map(({ toBeCreated, toBeAdded }) => expect({ toBeCreated, toBeAdded }).toEqual({ toBeCreated: [], toBeAdded: [] })),
      ))
  })
})
