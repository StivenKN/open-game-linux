import { expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { readFileSync } from 'node:fs'
import { Unauthenticated } from '../src/domain/errors.ts'
import { DiagnosticId, MachineId, UserId } from '../src/domain/ids.ts'
import { submitDiagnostic } from '../src/server/commands/diagnostic.ts'
import { Visitor } from '../src/server/auth.ts'
import { evaluateWithoutSaving, type MatrixRow, myDiagnostic, myMachines } from '../src/server/queries/diagnostic.ts'
import { inRollback, idOf, PgTest } from './support.ts'
import { seed, type Seed } from './fixtures.ts'

const prototype: object = JSON.parse(readFileSync(new URL('../prototypes/detector/out.json', import.meta.url), 'utf8'))
const payload = (overrides: object = {}) => ({ _tag: 'detector' as const, texto: JSON.stringify({ ...prototype, ...overrides }) })
const windows: object = JSON.parse(readFileSync(new URL('../prototypes/detector/windows-out.json', import.meta.url), 'utf8'))
const windowsPayload = (overrides: object = {}) => ({ _tag: 'detector' as const, texto: JSON.stringify({ ...windows, ...overrides }) })
const windowsLibrary = [
  { app_id: 9999990, nombre: 'Café "Noir": Édition™' },
  { app_id: 271590, nombre: 'Grand Theft Auto V' },
  { app_id: 227300, nombre: 'Euro Truck Simulator 2' },
  { app_id: 292030, nombre: 'The Witcher 3: Wild Hunt' },
]

const asUser = (id: string) => Effect.provideService(Visitor, Option.some({ id: Schema.decodeSync(UserId)(id), alias: id, rol: 'usuario' as const }))
const asGuest = Effect.provideService(Visitor, Option.none())

const save = (g: Omit<Parameters<typeof submitDiagnostic>[0], 'con_biblioteca'> & { readonly con_biblioteca?: boolean }) =>
  submitDiagnostic({ con_biblioteca: false, ...g })

const newMachine = (alias: string) => ({ _tag: 'nuevo' as const, alias })
const existingMachine = (id: number) => ({ _tag: 'existente' as const, id: Schema.decodeSync(MachineId)(id) })

const Count = Schema.NonEmptyArray(Schema.Struct({ n: Schema.Int }))
const count = (f: Seed, table: 'diagnostico' | 'equipo' | 'distribucion') =>
  Effect.map(Effect.flatMap(f.sql`SELECT count(*)::int AS n FROM ${f.sql(table)}`, Schema.decodeUnknownEffect(Count)), ([c]) => c.n)

const withSeed = (test: (f: Seed) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () => inRollback(Effect.flatMap(seed, test))

layer(PgTest)('registrarDiagnostico', (it) => {
  it.effect('el mismo payload dos veces converge en un equipo y un diagnóstico', withSeed((f) =>
    Effect.gen(function* () {
      const first = yield* save({ equipo: newMachine('Torre de casa'), entrada: payload() }).pipe(asUser(f.autor))
      const second = yield* save({ equipo: newMachine('torre de CASA'), entrada: payload() }).pipe(asUser(f.autor))
      expect([first.nuevo, second.nuevo]).toEqual([true, false])
      expect(second.id).toBe(first.id)
      const machines = yield* f.sql`SELECT count(*)::int AS n FROM equipo WHERE usuario_id = ${f.autor} AND lower(alias) = 'torre de casa'`
      expect(machines).toEqual([{ n: 1 }])
    })))

  it.effect('varios diagnósticos históricos del mismo equipo', withSeed((f) =>
    Effect.gen(function* () {
      const before = yield* count(f, 'diagnostico')
      const a = yield* save({ equipo: existingMachine(f.equipo), entrada: payload({ capturado_en: '2026-10-08T10:00:00Z' }) }).pipe(asUser(f.autor))
      const b = yield* save({ equipo: existingMachine(f.equipo), entrada: payload({ capturado_en: '2026-10-09T10:00:00Z', ram_mb: 32768 }) }).pipe(asUser(f.autor))
      expect(a.id).not.toBe(b.id)
      expect(yield* count(f, 'diagnostico')).toBe(before + 2)
      const [equipo] = yield* myMachines().pipe(asUser(f.autor))
      expect(equipo?.diagnostics.map((d) => [d.id, d.ram_mb])).toEqual([[b.id, 32768], [a.id, 15766], [f.diag, 8192]])
    })))

  it.effect('guarda el PCI id normalizado y miDiagnostico lo devuelve en la captura', withSeed((f) =>
    Effect.gen(function* () {
      const { id } = yield* save({ equipo: existingMachine(f.equipo), entrada: payload({ gpu_pci_id: ' 10DE:128B ' }) }).pipe(asUser(f.autor))
      expect(yield* f.sql`SELECT gpu_pci_id FROM diagnostico WHERE id = ${id}`).toEqual([{ gpu_pci_id: '10de:128b' }])
      expect((yield* myDiagnostic(id).pipe(asUser(f.autor))).capture.gpu_pci_id).toBe('10de:128b')
    })))

  it.effect('guarda un payload de Windows con su biblioteca de Steam solo si se pide', withSeed((f) =>
    Effect.gen(function* () {
      const full = yield* save({ con_biblioteca: true, equipo: newMachine('PC con Windows'), entrada: windowsPayload() }).pipe(asUser(f.autor))
      const bare = yield* save({ equipo: newMachine('PC con Windows'), entrada: windowsPayload({ capturado_en: '2026-10-16T10:00:00Z' }) }).pipe(asUser(f.autor))
      const row = (id: number) =>
        f.sql`SELECT sistema, distribucion_id, controlador, soporte_vulkan, gpu_pci_id, biblioteca_steam FROM diagnostico WHERE id = ${id}`
      expect(yield* row(full.id)).toEqual([
        { sistema: 'Windows', distribucion_id: null, controlador: null, soporte_vulkan: 'desconocido', gpu_pci_id: '10de:1380', biblioteca_steam: windowsLibrary },
      ])
      expect(yield* row(bare.id)).toMatchObject([{ sistema: 'Windows', biblioteca_steam: null }])
    })))

  it.effect('guardar otra vez la misma captura conserva la elección de la primera vez', withSeed((f) =>
    Effect.gen(function* () {
      const first = yield* save({ equipo: existingMachine(f.equipo), entrada: windowsPayload() }).pipe(asUser(f.autor))
      const second = yield* save({ con_biblioteca: true, equipo: existingMachine(f.equipo), entrada: windowsPayload() }).pipe(asUser(f.autor))
      expect(second).toEqual({ id: first.id, nuevo: false })
      expect(yield* f.sql`SELECT biblioteca_steam FROM diagnostico WHERE id = ${first.id}`).toEqual([{ biblioteca_steam: null }])
    })))

  it.effect('rechaza guardar en un equipo ajeno o inexistente, sin escribir nada', withSeed((f) =>
    Effect.gen(function* () {
      const before = yield* count(f, 'diagnostico')
      for (const equipo of [existingMachine(f.equipo), existingMachine(999999)]) {
        const failure = yield* Effect.flip(save({ equipo, entrada: payload() }).pipe(asUser(f.revisor)))
        expect(failure).toMatchObject({ _tag: 'ReglaIncumplida', rule: 'equipo_ajeno' })
      }
      expect(yield* count(f, 'diagnostico')).toBe(before)
    })))

  it.effect('un payload de Arch guarda la versión rolling y reutiliza su distribución', withSeed((f) =>
    Effect.gen(function* () {
      const arch = (capturado_en: string) => payload({ capturado_en, distribucion: { nombre: 'Arch Linux', version: '20261004.0.606936' } })
      const { id } = yield* save({ equipo: newMachine('Arch'), entrada: arch('2026-10-08T10:00:00Z') }).pipe(asUser(f.autor))
      yield* save({ equipo: newMachine('Arch'), entrada: arch('2026-10-09T10:00:00Z') }).pipe(asUser(f.autor))
      const rows = yield* f.sql`SELECT dist.version FROM diagnostico d JOIN distribucion dist ON dist.id = d.distribucion_id WHERE d.id = ${id}`
      expect(rows).toEqual([{ version: 'rolling' }])
      expect(yield* f.sql`SELECT count(*)::int AS n FROM distribucion WHERE nombre = 'Arch Linux'`).toEqual([{ n: 1 }])
    })))

  it.effect('guarda los hechos del sistema y miDiagnostico los devuelve; un payload sin ellos queda en null', withSeed((f) =>
    Effect.gen(function* () {
      const facts = { nivel_x86: 'v3', arranque_seguro: 'activo', tpm: '2.0', zram_mb: 8192, swap_mb: 0 }
      const full = yield* save({ equipo: newMachine('Con hechos'), entrada: payload(facts) }).pipe(asUser(f.autor))
      const bare = yield* save({ equipo: newMachine('Sin hechos'), entrada: payload() }).pipe(asUser(f.autor))
      const readCapture = (id: number) => Effect.map(myDiagnostic(Schema.decodeSync(DiagnosticId)(id)).pipe(asUser(f.autor)), (d) => d.capture)
      expect(yield* readCapture(full.id)).toMatchObject(facts)
      expect(yield* readCapture(bare.id)).toMatchObject({ nivel_x86: null, arranque_seguro: null, tpm: null, zram_mb: null, swap_mb: null })
    })))

  it.effect('sin sesión o con un payload ilegible no guarda nada', withSeed((f) =>
    Effect.gen(function* () {
      const before = yield* count(f, 'diagnostico')
      expect(yield* Effect.flip(save({ equipo: newMachine('x'), entrada: payload() }).pipe(asGuest))).toBeInstanceOf(Unauthenticated)
      const unreadable = yield* Effect.flip(save({ equipo: newMachine('x'), entrada: { _tag: 'detector', texto: 'no es un payload' } }).pipe(asUser(f.autor)))
      expect(unreadable).toMatchObject({ _tag: 'PayloadInvalido', reason: 'ilegible' })
      expect(yield* count(f, 'diagnostico')).toBe(before)
      expect(yield* f.sql`SELECT count(*)::int AS n FROM equipo WHERE alias = 'x'`).toEqual([{ n: 0 }])
    })))
})

layer(PgTest)('consultas de diagnóstico', (it) => {
  const addProfiles = (f: Seed) =>
    Effect.gen(function* () {
      yield* f.sql`UPDATE perfil_configuracion SET ram_min_mb = 32768, vram_min_mb = 2048 WHERE id = ${f.perfil}`
      yield* f.sql`UPDATE perfil_configuracion SET ${f.sql.update({ estado_revision: 'aprobado', revisor_id: f.revisor, revisado_en: new Date(), motivo_revision: 'probado', evidencia_revision: 'reporte' })} WHERE id = ${f.perfil}`
      yield* f.sql`INSERT INTO perfil_configuracion (edicion_id, distribucion_id, version_capa_id, autor_id, arquitectura, revision, titulo, ram_min_mb)
                   VALUES (${f.ed2}, ${f.dist}, ${f.capa}, ${f.autor}, 'x86_64', 1, 'pendiente', 1024)`
    })

  it.effect('evaluarSinGuardar evalúa contra perfiles aprobados y no guarda nada, ni la distribución', withSeed((f) =>
    Effect.gen(function* () {
      yield* addProfiles(f)
      const before = yield* Effect.all([count(f, 'diagnostico'), count(f, 'equipo'), count(f, 'distribucion')])
      const { capture, matrix } = yield* evaluateWithoutSaving(payload({ distribucion: { nombre: 'Distro Nueva', version: '1' } }))
      expect(yield* Effect.all([count(f, 'diagnostico'), count(f, 'equipo'), count(f, 'distribucion')])).toEqual(before)
      expect(capture.ram_mb).toBe(15766)
      const row = (title: string) => matrix.find((m) => m.titulo === title)
      expect(row('Juego')).toMatchObject({ status: 'sin_evidencia', test_count: 0, profile: { id: f.perfil, evaluation: { verdict: 'no_cumple' } } })
      expect(row('Juego')?.profile?.evaluation.checks.map((c) => [c.requirement, c.status])).toEqual([['ram', 'no_cumple'], ['vram', 'desconocido']])
      expect(row('Otro juego')?.profile).toBeNull()
    })))

  it.effect('evaluarSinGuardar proyecta la GPU a Linux desde el PCI id cuando no hay vulkaninfo', withSeed(() =>
    Effect.gen(function* () {
      const { machine: equipo } = yield* evaluateWithoutSaving(payload({ gpu_pci_id: '8086:9a49', controlador: 'i915' }))
      expect(equipo).toMatchObject({
        vulkan: { support: 'si', origin: 'proyectado', range: { from: { text: '1.3' }, to: { text: '1.4' } } },
        gpu: { family: 'intel_gen9_o_posterior', driver: 'i915', warnings: [] },
        paths: { d3d9_11: 'dxvk_2', d3d12: true },
      })
    })))

  it.effect('sin reportes, cada juego recibe su ruta gráfica, igual al evaluar y al releer lo guardado', withSeed((f) =>
    Effect.gen(function* () {
      yield* f.sql`INSERT INTO juego_api (juego_id, api) SELECT juego_id, api FROM edicion_juego, unnest(ARRAY['d3d11', 'd3d12']) AS api WHERE id = ${f.ed}`
      yield* f.sql`INSERT INTO juego_api (juego_id, api) SELECT juego_id, 'vulkan' FROM edicion_juego WHERE id = ${f.ed2}`
      yield* f.sql`UPDATE juego SET nivel_x86_min = 'v2' WHERE id = (SELECT juego_id FROM edicion_juego WHERE id = ${f.ed2})`
      // A Kepler without vulkaninfo on an x86-64-v1 CPU.
      const entrada = payload({ gpu_pci_id: '10de:1187', controlador: 'nouveau', nivel_x86: 'v1' })
      const paths = (matrix: ReadonlyArray<MatrixRow>) => matrix.map((m) => [m.titulo, m.path])
      const expected = [
        ['Juego', { status: 'con_ruta', path: 'dxvk_sarek' }],
        ['Otro juego', { status: 'sin_ruta', reason: 'cpu' }],
      ]
      const evaluated = yield* evaluateWithoutSaving(entrada)
      expect(paths(evaluated.matrix)).toEqual(expected)
      const { id } = yield* save({ equipo: existingMachine(f.equipo), entrada }).pipe(asUser(f.autor))
      const saved = yield* myDiagnostic(id).pipe(asUser(f.autor))
      expect(paths(saved.matrix)).toEqual(expected)
      expect(saved.distributions.evaluated.map((d) => [d.key, d.verdict])).toEqual([
        ['mint_22', 'con_ajustes'],
        ['ubuntu_2404', 'con_ajustes'],
        ['fedora', 'con_ajustes'],
        ['bazzite', 'descartada'],
        ['cachyos', 'con_ajustes'],
        ['arch', 'con_ajustes'],
      ])
    })))

  const catalogWithSteam = (f: Seed) =>
    Effect.gen(function* () {
      const gta = yield* idOf(f.sql`INSERT INTO juego (titulo, descripcion) VALUES ('Grand Theft Auto V', 'd') RETURNING id`)
      yield* f.sql`INSERT INTO edicion_juego (juego_id, lanzador_id, identificador_externo) VALUES (${gta}, ${f.lanzador}, '271590')`
      const epic = yield* idOf(f.sql`INSERT INTO lanzador (nombre) VALUES ('Epic Games Store') RETURNING id`)
      yield* f.sql`INSERT INTO edicion_juego (juego_id, lanzador_id, identificador_externo) SELECT juego_id, ${epic}, '227300' FROM edicion_juego WHERE id = ${f.ed2}`
    })
  const inLibrary = (matrix: ReadonlyArray<{ readonly titulo: string; readonly in_library: boolean }>) =>
    matrix.filter((m) => m.in_library).map((m) => m.titulo)

  it.effect('miDiagnostico separa la biblioteca guardada en juegos del catálogo y juegos desconocidos', withSeed((f) =>
    Effect.gen(function* () {
      yield* catalogWithSteam(f)
      const { id } = yield* save({ con_biblioteca: true, equipo: existingMachine(f.equipo), entrada: windowsPayload() }).pipe(asUser(f.autor))
      const saved = yield* myDiagnostic(id).pipe(asUser(f.autor))
      expect(inLibrary(saved.matrix)).toEqual(['Grand Theft Auto V'])
      expect(saved.matrix.map((m) => m.titulo)).toEqual(['Grand Theft Auto V', 'Juego', 'Otro juego'])
      expect(saved.library).toEqual({
        total: 4,
        unknown: [
          { app_id: 9999990, nombre: 'Café "Noir": Édition™' },
          { app_id: 227300, nombre: 'Euro Truck Simulator 2' },
          { app_id: 292030, nombre: 'The Witcher 3: Wild Hunt' },
        ],
      })
      expect(yield* Effect.flip(myDiagnostic(id).pipe(asUser(f.revisor)))).toMatchObject({ _tag: 'NoEncontrado' })
    })))

  it.effect('sin guardar la biblioteca, el diagnóstico guardado no la muestra', withSeed((f) =>
    Effect.gen(function* () {
      yield* catalogWithSteam(f)
      const { id } = yield* save({ equipo: existingMachine(f.equipo), entrada: windowsPayload() }).pipe(asUser(f.autor))
      const saved = yield* myDiagnostic(id).pipe(asUser(f.autor))
      expect([saved.library, saved.capture.biblioteca_steam, inLibrary(saved.matrix)]).toEqual([null, null, []])
    })))

  it.effect('un invitado ve su biblioteca evaluada sin que se guarde nada', withSeed((f) =>
    Effect.gen(function* () {
      yield* catalogWithSteam(f)
      const before = yield* Effect.all([count(f, 'diagnostico'), count(f, 'equipo')])
      const evaluated = yield* evaluateWithoutSaving(windowsPayload()).pipe(asGuest)
      expect(yield* Effect.all([count(f, 'diagnostico'), count(f, 'equipo')])).toEqual(before)
      expect(inLibrary(evaluated.matrix)).toEqual(['Grand Theft Auto V'])
      expect(evaluated.library?.unknown.map((j) => j.app_id)).toEqual([9999990, 227300, 292030])
    })))

  it.effect('miDiagnostico es solo del dueño; misEquipos de un invitado está vacío', withSeed((f) =>
    Effect.gen(function* () {
      yield* addProfiles(f)
      const id = Schema.decodeSync(DiagnosticId)(f.diag)
      const own = yield* myDiagnostic(id).pipe(asUser(f.autor))
      expect(own).toMatchObject({ alias: 'portátil', capture: { sistema: 'Linux', distribucion: { nombre: 'Linux Mint', version: '22' }, ram_mb: 8192 } })
      expect(own.matrix.find((m) => m.titulo === 'Juego')?.profile?.evaluation.verdict).toBe('no_cumple')
      expect(yield* Effect.flip(myDiagnostic(id).pipe(asUser(f.revisor)))).toMatchObject({ _tag: 'NoEncontrado' })
      expect(yield* myMachines().pipe(asGuest)).toEqual([])
    })))
})
