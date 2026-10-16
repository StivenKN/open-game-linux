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
const ana = Visitor.of(Option.some({ id: UserId.make('ana'), alias: 'ana', rol: 'usuario' }))

const today = new Date('2026-10-15T00:00:00Z')

const scenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertar = (table: string, row: Record<string, Value>) => idOf(sql`INSERT INTO ${sql(table)} ${sql.insert(row)} RETURNING id`)
  const reviewed = {
    creado_en: new Date('2026-10-03T00:00:00Z'),
    revisor_id: 'revisor',
    revisado_en: new Date('2026-10-04T00:00:00Z'),
    motivo_revision: 'probado',
  }
  const aprobado = { ...reviewed, estado_revision: 'aprobado', evidencia_revision: 'captura de MangoHud' }

  for (const [id, email] of [['autor', 'autor@demo.opengame.test'], ['revisor', 'revisor@opengame.test'], ['ana', 'ana@opengame.test']])
    yield* sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES (${id}, ${id}, ${email}, false, ${id === 'revisor' ? 'revisor' : 'usuario'}, true)`

  const steam = yield* insertar('lanzador', { nombre: 'Steam' })
  const epic = yield* insertar('lanzador', { nombre: 'Epic Games Store' })
  const mint = yield* insertar('distribucion', { nombre: 'Linux Mint', version: '21.3' })
  const arch = yield* insertar('distribucion', { nombre: 'Arch Linux', version: 'rolling' })
  const fedora = yield* insertar('distribucion', { nombre: 'Fedora', version: '40' })
  const proton8 = yield* insertar('version_capa', { familia: 'Proton', variante: 'Valve', version: '8.0-5' })
  const ge94 = yield* insertar('version_capa', { familia: 'Proton', variante: 'GE', version: '9-4' })
  const proton9 = yield* insertar('version_capa', { familia: 'Proton', variante: 'Valve', version: '9.0-3' })
  const lanzadorFallo = yield* insertar('tipo_fallo', { codigo: 'lanzador', descripcion: 'El lanzador no abre.' })
  const antiCheat = yield* insertar('tipo_fallo', { codigo: 'anti_cheat', descripcion: 'El anti-trampas bloquea Linux.' })

  const insertGame = (titulo: string) => insertar('juego', { titulo, descripcion: 'd' })
  const insertEdition = (juego_id: number, lanzador_id: number) => insertar('edicion_juego', { juego_id, lanzador_id })
  const gta = yield* insertGame('Grand Theft Auto V')
  const gtaSteam = yield* insertEdition(gta, steam)
  const gtaEpic = yield* insertEdition(gta, epic)
  const valorant = yield* insertGame('Valorant')
  const valorantSteam = yield* insertEdition(valorant, steam)
  const cs2 = yield* insertGame('Counter-Strike 2')
  const cs2Steam = yield* insertEdition(cs2, steam)
  const ets2 = yield* insertGame('Euro Truck Simulator 2')
  const ets2Steam = yield* insertEdition(ets2, steam)

  const insertMachine = (usuario_id: string) => insertar('equipo', { usuario_id, alias: `pc de ${usuario_id}` })
  const insertDiagnostic = (equipo_id: number, distribucion_id: number, capturado_en: string, extra: Record<string, Value> = {}) =>
    insertar('diagnostico', {
      equipo_id,
      capturado_en: new Date(capturado_en),
      sistema: 'Linux',
      version_sistema: '6.8',
      distribucion_id,
      arquitectura: 'x86_64',
      cpu_modelo: 'cpu',
      gpu_modelo: 'gpu',
      ram_mb: 8192,
      soporte_vulkan: 'desconocido',
      ...extra,
    })
  const pcAutor = yield* insertMachine('autor')
  const enMint = yield* insertDiagnostic(pcAutor, mint, '2026-08-01T00:00:00Z')
  const enArch = yield* insertDiagnostic(pcAutor, arch, '2026-08-02T00:00:00Z')
  const enFedora = yield* insertDiagnostic(pcAutor, fedora, '2026-08-03T00:00:00Z')

  const requirements = { arquitectura: 'x86_64', ram_min_mb: 8192, vram_min_mb: 2048, requiere_vulkan: true, version_vulkan_min: '1.1' }
  const perfilAprobado = yield* insertar('perfil_configuracion', {
    edicion_id: gtaSteam, distribucion_id: mint, version_capa_id: proton8, autor_id: 'autor', revision: 2, titulo: 'GTAV-BAJO', ...requirements,
    creado_en: reviewed.creado_en,
  })
  const perfilEnPrueba = yield* insertar('perfil_configuracion', {
    edicion_id: gtaSteam, distribucion_id: mint, version_capa_id: proton8, autor_id: 'autor', revision: 3, titulo: 'GTAV-BAJO', ...requirements,
  })
  const perfilRetirado = yield* insertar('perfil_configuracion', {
    edicion_id: gtaSteam, distribucion_id: mint, version_capa_id: proton8, autor_id: 'autor', revision: 1, titulo: 'GTAV-BAJO',
    ...requirements, ...reviewed, estado_revision: 'retirado',
  })
  for (const [order, title] of [[2, 'Elige Proton 8.0-5'], [1, 'Activa Steam Play']] as const)
    yield* sql`INSERT INTO paso_configuracion (perfil_id, orden, titulo, instruccion) VALUES (${perfilAprobado}, ${order}, ${title}, 'i')`
  yield* sql`UPDATE perfil_configuracion SET ${sql.update(Struct.omit(aprobado, ['creado_en']))} WHERE id = ${perfilAprobado}`

  const noFps = { fps_promedio: null, resolucion: null, calidad_grafica: null, metodo_medicion: null }
  const insertReport = (row: Record<string, Value>, review: Record<string, Value> = aprobado) =>
    insertar('reporte', { observaciones: 'o', ...noFps, ...row, ...review })
  yield* insertReport({
    edicion_id: gtaSteam, diagnostico_id: enMint, version_capa_id: proton8, perfil_id: perfilAprobado, version_juego: '1.0.3179',
    resultado: 'funciona', fecha_prueba: new Date('2026-09-28T12:00:00Z'),
    fps_promedio: 54, resolucion: '1280x720', calidad_grafica: 'Bajo', metodo_medicion: 'MangoHud · misión Prólogo · 5 min',
  })
  yield* insertReport({
    edicion_id: gtaSteam, diagnostico_id: enMint, version_capa_id: proton8, perfil_id: perfilAprobado, version_juego: '1.0.3179',
    resultado: 'funciona', fecha_prueba: new Date('2026-09-14T12:00:00Z'),
  })
  yield* insertReport({
    edicion_id: gtaEpic, diagnostico_id: enArch, version_capa_id: ge94, version_juego: '1.0.3179',
    resultado: 'funciona_con_ajustes', fecha_prueba: new Date('2026-09-02T12:00:00Z'),
    fps_promedio: 60, resolucion: '1920x1080', calidad_grafica: 'Medio', metodo_medicion: 'MangoHud · conducción en ciudad · 10 min',
  })
  const gtaFedora = yield* insertReport({
    edicion_id: gtaSteam, diagnostico_id: enFedora, version_capa_id: proton9, version_juego: '1.0.3258',
    resultado: 'falla_en_ejecucion', fecha_prueba: new Date('2026-10-02T12:00:00Z'),
  })
  yield* sql`INSERT INTO reporte_fallo (reporte_id, tipo_fallo_id, detalle) VALUES (${gtaFedora}, ${lanzadorFallo}, 'el lanzador no abre')`
  const insertSolution = (titulo: string, perfil_id: number | null, review: Record<string, Value>) =>
    insertar('solucion', { reporte_id: gtaFedora, tipo_fallo_id: lanzadorFallo, autor_id: 'ana', titulo, instrucciones: 'i', perfil_id, ...review })
  yield* insertSolution('Volver a Proton 8.0-5', null, aprobado)
  yield* insertSolution('Usar el perfil retirado', perfilRetirado, aprobado)
  yield* insertSolution('Sin revisar', null, {})
  yield* insertReport({ edicion_id: gtaSteam, diagnostico_id: enMint, version_capa_id: proton8, version_juego: '1.0.3179', resultado: 'no_inicia', fecha_prueba: new Date('2026-10-05T12:00:00Z') }, {})
  yield* insertReport({ edicion_id: ets2Steam, diagnostico_id: enMint, version_capa_id: proton8, version_juego: '1.5', resultado: 'funciona', fecha_prueba: new Date('2026-10-05T12:00:00Z') }, {})

  const valorantFallo = yield* insertReport({
    edicion_id: valorantSteam, diagnostico_id: enArch, version_capa_id: ge94, version_juego: '9.07', resultado: 'no_inicia', fecha_prueba: new Date('2026-08-03T12:00:00Z'),
  })
  yield* sql`INSERT INTO reporte_fallo (reporte_id, tipo_fallo_id, detalle) VALUES (${valorantFallo}, ${antiCheat}, 'Vanguard')`
  yield* insertReport({ edicion_id: cs2Steam, diagnostico_id: enArch, version_capa_id: ge94, version_juego: '1.0', resultado: 'funciona', fecha_prueba: new Date('2026-09-01T12:00:00Z') })

  const pcAna = yield* insertMachine('ana')
  yield* insertDiagnostic(pcAna, fedora, '2026-07-01T00:00:00Z')
  yield* insertDiagnostic(pcAna, mint, '2026-09-01T00:00:00Z', { ram_mb: 16384, vram_mb: 4096, soporte_vulkan: 'si', version_vulkan: '1.3' })

  const insertGuide = (titulo: string, estado: string) =>
    insertar('guia_adopcion', { autor_id: 'revisor', tipo: 'instalacion', titulo, contenido: 'Pasos', revision: 1, estado })
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
  estado: r.status,
  pruebas: r.test_count,
  vigentes: r.recent_count,
  sin_confirmacion_reciente: r.no_recent_confirmation,
  regresiones: r.regressions.map((x) => [x.fecha_prueba, x.version_juego, x.resultado]),
  ultima_prueba: r.last_tested,
  fallos: r.failures,
  entornos: r.setups.map((e) => ({
    version_juego: e.version_juego,
    estado: e.status,
    pruebas: e.test_count,
    vigentes: e.recent_count,
    por_resultado: e.by_outcome,
    ultima_prueba: e.last_tested,
    fallos: e.failures,
    fps: e.fps,
  })),
})

const titles = (c: { readonly games: ReadonlyArray<{ readonly titulo: string }> }) => c.games.map((j) => j.titulo)

layer(PgTest)('consultas', (it) => {
  describe('fichaJuego', () => {
    it.effect('resume GTA V igual que el fixture de samples.ts, sin contar el pendiente', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const page = yield* Effect.provideService(gamePage(e.gta), Visitor, guest)
          expect(shape(page.summary)).toEqual(shape(summarize(gtaV.tests, today)))
          expect(page.summary.status).toBe('resultados_variables')
          expect(page.summary.setups).toHaveLength(3)
          expect(page.pending).toBe(1)
          expect(page.ejemplo).toBe(true)
          expect(page.personal).toBeNull()
          expect(page.causes.map((c) => [c.code, c.descripcion, c.solutions.map((x) => x.titulo)])).toEqual([
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
          expect(page.profiles.map((p) => [p.id, p.estado_revision, p.evaluation?.verdict ?? null])).toEqual([
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
          const pc = yield* e.insertar('equipo', { usuario_id: 'ana', alias: 'pc con Windows' })
          yield* e.insertar('diagnostico', {
            equipo_id: pc, capturado_en: new Date('2026-10-10T00:00:00Z'), sistema: 'Windows', version_sistema: 'Windows 10 Home 22H2 (19045)',
            distribucion_id: null, arquitectura: 'x86_64', cpu_modelo: 'cpu', gpu_modelo: 'NVIDIA GeForce GT 710', gpu_pci_id: '10de:128b',
            ram_mb: 16384, vram_mb: 2048, soporte_vulkan: 'si', version_vulkan: '1.4',
          })
          const demanding = yield* e.insertar('perfil_configuracion', {
            edicion_id: e.gtaSteam, distribucion_id: e.fedora, version_capa_id: e.proton9, autor_id: 'autor', revision: 1, titulo: 'GTAV-VULKAN',
            arquitectura: 'x86_64', ram_min_mb: 8192, requiere_vulkan: true, version_vulkan_min: '1.3', creado_en: e.aprobado.creado_en,
          })
          yield* sql`UPDATE perfil_configuracion SET ${sql.update(Struct.omit(e.aprobado, ['creado_en']))} WHERE id = ${demanding}`
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

  describe('catalogo', () => {
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
          expect(all.games.find((j) => j.titulo === 'Euro Truck Simulator 2')).toMatchObject({ pendientes: 1, summary: { test_count: 0 } })
          expect(all.counters).toEqual({ juegos_verificados: 3, reportes_aprobados: 6, perfiles_aprobados: 1, distribuciones_probadas: 3, arreglos_upstream: 0 })
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
          expect(all.games.map((j) => [j.titulo, j.summary.status, j.summary.no_recent_confirmation])).toEqual([
            ['Counter-Strike 2', 'funciona', true],
            ['Euro Truck Simulator 2', 'sin_evidencia', false],
            ['Grand Theft Auto V', 'falla_en_ejecucion', false],
            ['Valorant', 'no_inicia', true],
          ])
          expect(titles(yield* catalog({ estado: 'falla_en_ejecucion' }))).toEqual(['Grand Theft Auto V'])
          const page = yield* Effect.provideService(gamePage(e.gta), Visitor, guest)
          expect([page.summary.status, page.summary.recent_count, page.summary.test_count]).toEqual(['falla_en_ejecucion', 1, 4])
          expect(all.counters).toEqual({ juegos_verificados: 3, reportes_aprobados: 6, perfiles_aprobados: 1, distribuciones_probadas: 3, arreglos_upstream: 0 })
        }),
      ).pipe(onDay(new Date('2027-10-01T00:00:00Z'))),
    )
  })

  describe('perfil', () => {
    it.effect('muestra los pasos en orden y no evalúa un perfil en prueba', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          const approved = yield* Effect.provideService(profile(e.perfilAprobado), Visitor, guest)
          expect(approved.steps.map((p) => p.titulo)).toEqual(['Activa Steam Play', 'Elige Proton 8.0-5'])
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

  describe('guias', () => {
    it.effect('solo las publicadas son públicas', () =>
      inRollback(
        Effect.gen(function* () {
          const e = yield* scenario
          expect((yield* guides).map((g) => g.id)).toEqual([e.guiaPublicada])
          expect((yield* guide(e.guiaPublicada)).titulo).toBe('Instalar Linux Mint')
          const exit = yield* Effect.exit(guide(e.guiaBorrador))
          expect(Exit.findErrorOption(exit).pipe(Option.map((x) => x._tag))).toEqual(Option.some('NoEncontrado'))
        }),
      ),
    )
  })
})
