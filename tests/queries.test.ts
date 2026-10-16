import { describe, expect, layer } from '@effect/vitest'
import { Effect, Exit, Option, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { type CompatibilitySummary, summarize } from '../src/domain/compatibility.ts'
import { GuideId, GameId, LauncherId, ProfileId, UserId } from '../src/domain/ids.ts'
import { gtaV } from '../src/domain/samples.ts'
import { Visitor } from '../src/server/auth.ts'
import { catalog } from '../src/server/queries/catalog.ts'
import { gamePage } from '../src/server/queries/game.ts'
import { guide, guides } from '../src/server/queries/guides.ts'
import { profile } from '../src/server/queries/profile.ts'
import { onDay, inRollback, idOf, PgTest } from './support.ts'

type Value = string | number | boolean | Date | null

const guest = Visitor.of(Option.none())
const ana = Visitor.of(Option.some({ id: UserId.make('ana'), alias: 'ana', role: 'usuario' }))

const today = new Date('2026-10-15T00:00:00Z')

const scenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertar = (table: string, row: Record<string, Value>) => idOf(sql`INSERT INTO ${sql(table)} ${sql.insert(row)} RETURNING id`)
  const reviewed = {
    created_at: new Date('2026-10-03T00:00:00Z'),
    reviewer_id: 'revisor',
    reviewed_at: new Date('2026-10-04T00:00:00Z'),
    review_reason: 'probado',
  }
  const aprobado = { ...reviewed, review_status: 'aprobado', review_evidence: 'captura de MangoHud' }

  for (const [id, email] of [['autor', 'autor@demo.opengame.test'], ['revisor', 'revisor@opengame.test'], ['ana', 'ana@opengame.test']])
    yield* sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES (${id}, ${id}, ${email}, false, ${id === 'revisor' ? 'revisor' : 'usuario'}, true)`

  const steam = yield* insertar('lanzador', { name: 'Steam' })
  const epic = yield* insertar('lanzador', { name: 'Epic Games Store' })
  const mint = yield* insertar('distribucion', { name: 'Linux Mint', version: '21.3' })
  const arch = yield* insertar('distribucion', { name: 'Arch Linux', version: 'rolling' })
  const fedora = yield* insertar('distribucion', { name: 'Fedora', version: '40' })
  const proton8 = yield* insertar('version_capa', { family: 'Proton', variant: 'Valve', version: '8.0-5' })
  const ge94 = yield* insertar('version_capa', { family: 'Proton', variant: 'GE', version: '9-4' })
  const proton9 = yield* insertar('version_capa', { family: 'Proton', variant: 'Valve', version: '9.0-3' })
  const lanzadorFallo = yield* insertar('tipo_fallo', { code: 'lanzador', description: 'El lanzador no abre.' })
  const antiCheat = yield* insertar('tipo_fallo', { code: 'anti_cheat', description: 'El anti-trampas bloquea Linux.' })

  const insertGame = (title: string) => insertar('juego', { title, description: 'd' })
  const insertEdition = (game_id: number, launcher_id: number) => insertar('edicion_juego', { game_id, launcher_id })
  const gta = yield* insertGame('Grand Theft Auto V')
  const gtaSteam = yield* insertEdition(gta, steam)
  const gtaEpic = yield* insertEdition(gta, epic)
  const valorant = yield* insertGame('Valorant')
  const valorantSteam = yield* insertEdition(valorant, steam)
  const cs2 = yield* insertGame('Counter-Strike 2')
  const cs2Steam = yield* insertEdition(cs2, steam)
  const ets2 = yield* insertGame('Euro Truck Simulator 2')
  const ets2Steam = yield* insertEdition(ets2, steam)

  const insertMachine = (user_id: string) => insertar('equipo', { user_id, alias: `pc de ${user_id}` })
  const insertDiagnostic = (machine_id: number, distribution_id: number, captured_at: string, extra: Record<string, Value> = {}) =>
    insertar('diagnostico', {
      machine_id,
      captured_at: new Date(captured_at),
      operating_system: 'Linux',
      os_version: '6.8',
      distribution_id,
      architecture: 'x86_64',
      cpu_model: 'cpu',
      gpu_model: 'gpu',
      ram_mb: 8192,
      vulkan_support: 'desconocido',
      ...extra,
    })
  const pcAutor = yield* insertMachine('autor')
  const enMint = yield* insertDiagnostic(pcAutor, mint, '2026-08-01T00:00:00Z')
  const enArch = yield* insertDiagnostic(pcAutor, arch, '2026-08-02T00:00:00Z')
  const enFedora = yield* insertDiagnostic(pcAutor, fedora, '2026-08-03T00:00:00Z')

  const requirements = { architecture: 'x86_64', ram_min_mb: 8192, vram_min_mb: 2048, requires_vulkan: true, vulkan_version_min: '1.1' }
  const perfilAprobado = yield* insertar('perfil_configuracion', {
    edition_id: gtaSteam, distribution_id: mint, layer_version_id: proton8, author_id: 'autor', revision: 2, title: 'GTAV-BAJO', ...requirements,
    created_at: reviewed.created_at,
  })
  const perfilEnPrueba = yield* insertar('perfil_configuracion', {
    edition_id: gtaSteam, distribution_id: mint, layer_version_id: proton8, author_id: 'autor', revision: 3, title: 'GTAV-BAJO', ...requirements,
  })
  const perfilRetirado = yield* insertar('perfil_configuracion', {
    edition_id: gtaSteam, distribution_id: mint, layer_version_id: proton8, author_id: 'autor', revision: 1, title: 'GTAV-BAJO',
    ...requirements, ...reviewed, review_status: 'retirado',
  })
  for (const [order, title] of [[2, 'Elige Proton 8.0-5'], [1, 'Activa Steam Play']] as const)
    yield* sql`INSERT INTO profile_step (profile_id, position, title, instruction) VALUES (${perfilAprobado}, ${order}, ${title}, 'i')`
  yield* sql`UPDATE profile SET ${sql.update(Struct.omit(aprobado, ['created_at']))} WHERE id = ${perfilAprobado}`

  const noFps = { avg_fps: null, resolution: null, graphics_quality: null, measurement_method: null }
  const insertReport = (row: Record<string, Value>, review: Record<string, Value> = aprobado) =>
    insertar('reporte', { observations: 'o', ...noFps, ...row, ...review })
  yield* insertReport({
    edition_id: gtaSteam, diagnostic_id: enMint, layer_version_id: proton8, profile_id: perfilAprobado, game_version: '1.0.3179',
    outcome: 'funciona', tested_at: new Date('2026-09-28T12:00:00Z'),
    avg_fps: 54, resolution: '1280x720', graphics_quality: 'Bajo', measurement_method: 'MangoHud · misión Prólogo · 5 min',
  })
  yield* insertReport({
    edition_id: gtaSteam, diagnostic_id: enMint, layer_version_id: proton8, profile_id: perfilAprobado, game_version: '1.0.3179',
    outcome: 'funciona', tested_at: new Date('2026-09-14T12:00:00Z'),
  })
  yield* insertReport({
    edition_id: gtaEpic, diagnostic_id: enArch, layer_version_id: ge94, game_version: '1.0.3179',
    outcome: 'funciona_con_ajustes', tested_at: new Date('2026-09-02T12:00:00Z'),
    avg_fps: 60, resolution: '1920x1080', graphics_quality: 'Medio', measurement_method: 'MangoHud · conducción en ciudad · 10 min',
  })
  const gtaFedora = yield* insertReport({
    edition_id: gtaSteam, diagnostic_id: enFedora, layer_version_id: proton9, game_version: '1.0.3258',
    outcome: 'falla_en_ejecucion', tested_at: new Date('2026-10-02T12:00:00Z'),
  })
  yield* sql`INSERT INTO report_failure (report_id, failure_type_id, detail) VALUES (${gtaFedora}, ${lanzadorFallo}, 'el lanzador no abre')`
  const insertSolution = (title: string, profile_id: number | null, review: Record<string, Value>) =>
    insertar('solucion', { report_id: gtaFedora, failure_type_id: lanzadorFallo, author_id: 'ana', title, instructions: 'i', profile_id, ...review })
  yield* insertSolution('Volver a Proton 8.0-5', null, aprobado)
  yield* insertSolution('Usar el perfil retirado', perfilRetirado, aprobado)
  yield* insertSolution('Sin revisar', null, {})
  yield* insertReport({ edition_id: gtaSteam, diagnostic_id: enMint, layer_version_id: proton8, game_version: '1.0.3179', outcome: 'no_inicia', tested_at: new Date('2026-10-05T12:00:00Z') }, {})
  yield* insertReport({ edition_id: ets2Steam, diagnostic_id: enMint, layer_version_id: proton8, game_version: '1.5', outcome: 'funciona', tested_at: new Date('2026-10-05T12:00:00Z') }, {})

  const valorantFallo = yield* insertReport({
    edition_id: valorantSteam, diagnostic_id: enArch, layer_version_id: ge94, game_version: '9.07', outcome: 'no_inicia', tested_at: new Date('2026-08-03T12:00:00Z'),
  })
  yield* sql`INSERT INTO report_failure (report_id, failure_type_id, detail) VALUES (${valorantFallo}, ${antiCheat}, 'Vanguard')`
  yield* insertReport({ edition_id: cs2Steam, diagnostic_id: enArch, layer_version_id: ge94, game_version: '1.0', outcome: 'funciona', tested_at: new Date('2026-09-01T12:00:00Z') })

  const pcAna = yield* insertMachine('ana')
  yield* insertDiagnostic(pcAna, fedora, '2026-07-01T00:00:00Z')
  yield* insertDiagnostic(pcAna, mint, '2026-09-01T00:00:00Z', { ram_mb: 16384, vram_mb: 4096, vulkan_support: 'si', vulkan_version: '1.3' })

  const insertGuide = (title: string, status: string) =>
    insertar('guia_adopcion', { author_id: 'revisor', type: 'instalacion', title, content: 'Pasos', revision: 1, status })
  const guiaPublicada = yield* insertGuide('Instalar Linux Mint', 'publicada')
  const guiaBorrador = yield* insertGuide('Borrador sin publicar', 'borrador')

  return {
    insertar,
    aprobado,
    gta: GameId.make(gta),
    gtaSteam,
    fedora,
    proton9,
    epic: LauncherId.make(epic),
    perfilAprobado: ProfileId.make(perfilAprobado),
    perfilEnPrueba: ProfileId.make(perfilEnPrueba),
    perfilRetirado: ProfileId.make(perfilRetirado),
    guiaPublicada: GuideId.make(guiaPublicada),
    guiaBorrador: GuideId.make(guiaBorrador),
  }
})

const shape = (r: CompatibilitySummary) => ({
  status: r.status,
  pruebas: r.test_count,
  vigentes: r.recent_count,
  sin_confirmacion_reciente: r.no_recent_confirmation,
  regresiones: r.regressions.map((x) => [x.tested_at, x.game_version, x.outcome]),
  ultima_prueba: r.last_tested,
  failures: r.failures,
  entornos: r.setups.map((e) => ({
    game_version: e.game_version,
    status: e.status,
    pruebas: e.test_count,
    vigentes: e.recent_count,
    por_resultado: e.by_outcome,
    ultima_prueba: e.last_tested,
    failures: e.failures,
    fps: e.fps,
  })),
})

const titles = (c: { readonly games: ReadonlyArray<{ readonly title: string }> }) => c.games.map((j) => j.title)

layer(PgTest)('consultas', (it) => {
  describe('gamePage', () => {
    it.effect('resume GTA V igual que el fixture de samples.ts, sin contar el pendiente', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const page = yield* Effect.provideService(gamePage(e.gta), Visitor, guest)
          expect(shape(page.summary)).toEqual(shape(summarize(gtaV.tests, today)))
          expect(page.summary.status).toBe('resultados_variables')
          expect(page.summary.setups).toHaveLength(3)
          expect(page.pending).toBe(1)
          expect(page.demo).toBe(true)
          expect(page.personal).toBeNull()
          expect(page.causes.map((c) => [c.code, c.description, c.solutions.map((x) => x.title)])).toEqual([
            ['lanzador', 'El lanzador no abre.', ['Volver a Proton 8.0-5']],
          ])
        }),
      ).pipe(onDay(today)),
    )

    it.effect('compara con el diagnóstico más reciente del visitante y lista perfiles aprobados primero', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const page = yield* Effect.provideService(gamePage(e.gta), Visitor, ana)
          expect(page.personal?.on_my_distribution?.name).toBe('Linux Mint 21.3')
          expect(page.personal?.on_my_distribution?.summary.status).toBe('funciona')
          expect(page.personal?.on_my_distribution?.summary.test_count).toBe(2)
          expect(page.personal?.profile).toMatchObject({ id: e.perfilAprobado, evaluation: { verdict: 'cumple' } })
          expect(page.profiles.map((p) => [p.id, p.review_status, p.evaluation?.verdict ?? null])).toEqual([
            [e.perfilAprobado, 'aprobado', 'cumple'],
            [e.perfilEnPrueba, 'pendiente', null],
          ])
        }),
      ).pipe(onDay(today)),
    )

    it.effect('un diagnóstico de Windows con una Kepler proyecta Vulkan 1.2 y no cumple un mínimo de 1.3', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const sql = yield* SqlClient.SqlClient
          const pc = yield* e.insertar('equipo', { user_id: 'ana', alias: 'pc con Windows' })
          yield* e.insertar('diagnostico', {
            machine_id: pc, captured_at: new Date('2026-10-10T00:00:00Z'), operating_system: 'Windows', os_version: 'Windows 10 Home 22H2 (19045)',
            distribution_id: null, architecture: 'x86_64', cpu_model: 'cpu', gpu_model: 'NVIDIA GeForce GT 710', gpu_pci_id: '10de:128b',
            ram_mb: 16384, vram_mb: 2048, vulkan_support: 'si', vulkan_version: '1.4',
          })
          const demanding = yield* e.insertar('perfil_configuracion', {
            edition_id: e.gtaSteam, distribution_id: e.fedora, layer_version_id: e.proton9, author_id: 'autor', revision: 1, title: 'GTAV-VULKAN',
            architecture: 'x86_64', ram_min_mb: 8192, requires_vulkan: true, vulkan_version_min: '1.3', created_at: e.aprobado.created_at,
          })
          yield* sql`UPDATE profile SET ${sql.update(Struct.omit(e.aprobado, ['created_at']))} WHERE id = ${demanding}`
          const page = yield* Effect.provideService(gamePage(e.gta), Visitor, ana)
          expect(page.profiles.find((p) => p.id === demanding)?.evaluation).toEqual({
            verdict: 'no_cumple',
            advisory_only: true,
            checks: [
              { requirement: 'ram', status: 'cumple', required: '8192', detected: { value: '16384', origin: 'medido' } },
              { requirement: 'vulkan', status: 'no_cumple', required: '1.3', detected: { value: '1.2', origin: 'proyectado' } },
            ],
          })
        }),
      ),
    )

    it.effect('un juego que no existe es NoEncontrado', () =>
      inRollback(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(Effect.provideService(gamePage(GameId.make(999999)), Visitor, guest))
          expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag))).toEqual(Option.some('NoEncontrado'))
        }),
      ),
    )
  })

  describe('catalog', () => {
    it.effect('filtra por estado calculado, anti-cheat y título, y cuenta solo lo aprobado', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          expect(titles(yield* catalog({ estado: 'funciona' }))).toEqual(['Counter-Strike 2'])
          expect(titles(yield* catalog({ estado: 'sin_evidencia' }))).toEqual(['Euro Truck Simulator 2'])
          expect(titles(yield* catalog({ sin_anti_cheat: true }))).not.toContain('Valorant')
          expect(titles(yield* catalog({ q: 'theft' }))).toEqual(['Grand Theft Auto V'])
          expect(titles(yield* catalog({ q: '%' }))).toEqual([])
          expect(titles(yield* catalog({ lanzador: e.epic }))).toEqual(['Grand Theft Auto V'])
          const all = yield* catalog({})
          expect(all.games.find((j) => j.title === 'Euro Truck Simulator 2')).toMatchObject({ pending: 1, summary: { test_count: 0 } })
          expect(all.counters).toEqual({ verified_games: 3, approved_reports: 6, approved_profiles: 1, tested_distributions: 3, upstream_fixes: 0 })
        }),
      ).pipe(onDay(today)),
    )

    it.effect('cuenta cada estado sobre los demás filtros, sin aplicar el de estado', () =>
      inRollback(
        Effect.gen(function* () {
          yield* scenario
          const byStatus = { sin_evidencia: 1, funciona: 1, funciona_con_ajustes: 0, no_inicia: 1, falla_en_ejecucion: 0, resultados_variables: 1 }
          expect((yield* catalog({})).by_status).toEqual(byStatus)
          expect((yield* catalog({ estado: 'funciona' })).by_status).toEqual(byStatus)
          expect((yield* catalog({ sin_anti_cheat: true })).by_status).toEqual({ ...byStatus, no_inicia: 0 })
          expect((yield* catalog({ q: 'theft' })).by_status).toEqual({ ...byStatus, sin_evidencia: 0, funciona: 0, no_inicia: 0 })
        }),
      ).pipe(onDay(today)),
    )
  })

  describe('vigencia', () => {
    it.effect('un año después, ficha y catálogo calculan el estado con lo reciente y marcan lo viejo', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const all = yield* catalog({})
          expect(all.games.map((j) => [j.title, j.summary.status, j.summary.no_recent_confirmation])).toEqual([
            ['Counter-Strike 2', 'funciona', true],
            ['Euro Truck Simulator 2', 'sin_evidencia', false],
            ['Grand Theft Auto V', 'falla_en_ejecucion', false],
            ['Valorant', 'no_inicia', true],
          ])
          expect(titles(yield* catalog({ estado: 'falla_en_ejecucion' }))).toEqual(['Grand Theft Auto V'])
          const page = yield* Effect.provideService(gamePage(e.gta), Visitor, guest)
          expect([page.summary.status, page.summary.recent_count, page.summary.test_count]).toEqual(['falla_en_ejecucion', 1, 4])
          expect(all.counters).toEqual({ verified_games: 3, approved_reports: 6, approved_profiles: 1, tested_distributions: 3, upstream_fixes: 0 })
        }),
      ).pipe(onDay(new Date('2027-10-01T00:00:00Z'))),
    )
  })

  describe('profile', () => {
    it.effect('muestra los pasos en orden y no evalúa un perfil en prueba', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const approved = yield* Effect.provideService(profile(e.perfilAprobado), Visitor, guest)
          expect(approved.steps.map((p) => p.title)).toEqual(['Activa Steam Play', 'Elige Proton 8.0-5'])
          expect(approved.evaluation).toBe('sin_diagnostico')
          const inTesting = yield* Effect.provideService(profile(e.perfilEnPrueba), Visitor, ana)
          expect(inTesting.evaluation).toBe('perfil_en_prueba')
          const withDiagnostic = yield* Effect.provideService(profile(e.perfilAprobado), Visitor, ana)
          expect(withDiagnostic.evaluation).toMatchObject({ verdict: 'cumple' })
        }),
      ),
    )

    it.effect('un perfil retirado no es público', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const exit = yield* Effect.exit(Effect.provideService(profile(e.perfilRetirado), Visitor, guest))
          expect(Exit.findErrorOption(exit).pipe(Option.map((x) => x._tag))).toEqual(Option.some('NoEncontrado'))
        }),
      ),
    )
  })

  describe('guides', () => {
    it.effect('solo las publicadas son públicas', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          expect((yield* guides).map((g) => g.id)).toEqual([e.guiaPublicada])
          expect((yield* guide(e.guiaPublicada)).title).toBe('Instalar Linux Mint')
          const exit = yield* Effect.exit(guide(e.guiaBorrador))
          expect(Exit.findErrorOption(exit).pipe(Option.map((x) => x._tag))).toEqual(Option.some('NoEncontrado'))
        }),
      ),
    )
  })
})
