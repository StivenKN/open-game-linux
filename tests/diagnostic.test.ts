import { expect, layer } from '@effect/vitest'
import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { readFileSync } from 'node:fs'
import { Unauthenticated } from '../src/domain/errors.ts'
import { DiagnosticId, MachineId, UserId } from '../src/domain/ids.ts'
import { registrarDiagnostico } from '../src/server/commands/diagnostic.ts'
import { Visitante } from '../src/server/auth.ts'
import { evaluarSinGuardar, type FilaMatriz, miDiagnostico, misEquipos } from '../src/server/queries/diagnostic.ts'
import { enRollback, idDe, PgTest } from './support.ts'
import { base, type Base } from './fixtures.ts'

const prototipo: object = JSON.parse(readFileSync(new URL('../prototypes/detector/out.json', import.meta.url), 'utf8'))
const payload = (cambios: object = {}) => ({ _tag: 'detector' as const, texto: JSON.stringify({ ...prototipo, ...cambios }) })
const windows: object = JSON.parse(readFileSync(new URL('../prototypes/detector/windows-out.json', import.meta.url), 'utf8'))
const payloadWindows = (cambios: object = {}) => ({ _tag: 'detector' as const, texto: JSON.stringify({ ...windows, ...cambios }) })
const bibliotecaWindows = [
  { app_id: 9999990, nombre: 'Café "Noir": Édition™' },
  { app_id: 271590, nombre: 'Grand Theft Auto V' },
  { app_id: 227300, nombre: 'Euro Truck Simulator 2' },
  { app_id: 292030, nombre: 'The Witcher 3: Wild Hunt' },
]

const como = (id: string) => Effect.provideService(Visitante, Option.some({ id: Schema.decodeSync(UserId)(id), alias: id, rol: 'usuario' as const }))
const comoInvitado = Effect.provideService(Visitante, Option.none())

const guardar = (g: Omit<Parameters<typeof registrarDiagnostico>[0], 'con_biblioteca'> & { readonly con_biblioteca?: boolean }) =>
  registrarDiagnostico({ con_biblioteca: false, ...g })

const nuevo = (alias: string) => ({ _tag: 'nuevo' as const, alias })
const existente = (id: number) => ({ _tag: 'existente' as const, id: Schema.decodeSync(MachineId)(id) })

const Cuenta = Schema.NonEmptyArray(Schema.Struct({ n: Schema.Int }))
const contar = (f: Base, tabla: 'diagnostico' | 'equipo' | 'distribucion') =>
  Effect.map(Effect.flatMap(f.sql`SELECT count(*)::int AS n FROM ${f.sql(tabla)}`, Schema.decodeUnknownEffect(Cuenta)), ([c]) => c.n)

const conBase = (prueba: (f: Base) => Effect.Effect<void, unknown, SqlClient.SqlClient>) => () => enRollback(Effect.flatMap(base, prueba))

layer(PgTest)('registrarDiagnostico', (it) => {
  it.effect('el mismo payload dos veces converge en un equipo y un diagnóstico', conBase((f) =>
    Effect.gen(function* () {
      const primero = yield* guardar({ equipo: nuevo('Torre de casa'), entrada: payload() }).pipe(como(f.autor))
      const segundo = yield* guardar({ equipo: nuevo('torre de CASA'), entrada: payload() }).pipe(como(f.autor))
      expect([primero.nuevo, segundo.nuevo]).toEqual([true, false])
      expect(segundo.id).toBe(primero.id)
      const equipos = yield* f.sql`SELECT count(*)::int AS n FROM equipo WHERE usuario_id = ${f.autor} AND lower(alias) = 'torre de casa'`
      expect(equipos).toEqual([{ n: 1 }])
    })))

  it.effect('varios diagnósticos históricos del mismo equipo', conBase((f) =>
    Effect.gen(function* () {
      const antes = yield* contar(f, 'diagnostico')
      const a = yield* guardar({ equipo: existente(f.equipo), entrada: payload({ capturado_en: '2026-10-08T10:00:00Z' }) }).pipe(como(f.autor))
      const b = yield* guardar({ equipo: existente(f.equipo), entrada: payload({ capturado_en: '2026-10-09T10:00:00Z', ram_mb: 32768 }) }).pipe(como(f.autor))
      expect(a.id).not.toBe(b.id)
      expect(yield* contar(f, 'diagnostico')).toBe(antes + 2)
      const [equipo] = yield* misEquipos().pipe(como(f.autor))
      expect(equipo?.diagnosticos.map((d) => [d.id, d.ram_mb])).toEqual([[b.id, 32768], [a.id, 15766], [f.diag, 8192]])
    })))

  it.effect('guarda el PCI id normalizado y miDiagnostico lo devuelve en la captura', conBase((f) =>
    Effect.gen(function* () {
      const { id } = yield* guardar({ equipo: existente(f.equipo), entrada: payload({ gpu_pci_id: ' 10DE:128B ' }) }).pipe(como(f.autor))
      expect(yield* f.sql`SELECT gpu_pci_id FROM diagnostico WHERE id = ${id}`).toEqual([{ gpu_pci_id: '10de:128b' }])
      expect((yield* miDiagnostico(id).pipe(como(f.autor))).captura.gpu_pci_id).toBe('10de:128b')
    })))

  it.effect('guarda un payload de Windows con su biblioteca de Steam solo si se pide', conBase((f) =>
    Effect.gen(function* () {
      const con = yield* guardar({ con_biblioteca: true, equipo: nuevo('PC con Windows'), entrada: payloadWindows() }).pipe(como(f.autor))
      const sin = yield* guardar({ equipo: nuevo('PC con Windows'), entrada: payloadWindows({ capturado_en: '2026-10-16T10:00:00Z' }) }).pipe(como(f.autor))
      const fila = (id: number) =>
        f.sql`SELECT sistema, distribucion_id, controlador, soporte_vulkan, gpu_pci_id, biblioteca_steam FROM diagnostico WHERE id = ${id}`
      expect(yield* fila(con.id)).toEqual([
        { sistema: 'Windows', distribucion_id: null, controlador: null, soporte_vulkan: 'desconocido', gpu_pci_id: '10de:1380', biblioteca_steam: bibliotecaWindows },
      ])
      expect(yield* fila(sin.id)).toMatchObject([{ sistema: 'Windows', biblioteca_steam: null }])
    })))

  it.effect('guardar otra vez la misma captura conserva la elección de la primera vez', conBase((f) =>
    Effect.gen(function* () {
      const primero = yield* guardar({ equipo: existente(f.equipo), entrada: payloadWindows() }).pipe(como(f.autor))
      const segundo = yield* guardar({ con_biblioteca: true, equipo: existente(f.equipo), entrada: payloadWindows() }).pipe(como(f.autor))
      expect(segundo).toEqual({ id: primero.id, nuevo: false })
      expect(yield* f.sql`SELECT biblioteca_steam FROM diagnostico WHERE id = ${primero.id}`).toEqual([{ biblioteca_steam: null }])
    })))

  it.effect('rechaza guardar en un equipo ajeno o inexistente, sin escribir nada', conBase((f) =>
    Effect.gen(function* () {
      const antes = yield* contar(f, 'diagnostico')
      for (const equipo of [existente(f.equipo), existente(999999)]) {
        const fallo = yield* Effect.flip(guardar({ equipo, entrada: payload() }).pipe(como(f.revisor)))
        expect(fallo).toMatchObject({ _tag: 'ReglaIncumplida', rule: 'equipo_ajeno' })
      }
      expect(yield* contar(f, 'diagnostico')).toBe(antes)
    })))

  it.effect('un payload de Arch guarda la versión rolling y reutiliza su distribución', conBase((f) =>
    Effect.gen(function* () {
      const arch = (capturado_en: string) => payload({ capturado_en, distribucion: { nombre: 'Arch Linux', version: '20261004.0.606936' } })
      const { id } = yield* guardar({ equipo: nuevo('Arch'), entrada: arch('2026-10-08T10:00:00Z') }).pipe(como(f.autor))
      yield* guardar({ equipo: nuevo('Arch'), entrada: arch('2026-10-09T10:00:00Z') }).pipe(como(f.autor))
      const filas = yield* f.sql`SELECT dist.version FROM diagnostico d JOIN distribucion dist ON dist.id = d.distribucion_id WHERE d.id = ${id}`
      expect(filas).toEqual([{ version: 'rolling' }])
      expect(yield* f.sql`SELECT count(*)::int AS n FROM distribucion WHERE nombre = 'Arch Linux'`).toEqual([{ n: 1 }])
    })))

  it.effect('guarda los hechos del sistema y miDiagnostico los devuelve; un payload sin ellos queda en null', conBase((f) =>
    Effect.gen(function* () {
      const hechos = { nivel_x86: 'v3', arranque_seguro: 'activo', tpm: '2.0', zram_mb: 8192, swap_mb: 0 }
      const con = yield* guardar({ equipo: nuevo('Con hechos'), entrada: payload(hechos) }).pipe(como(f.autor))
      const sin = yield* guardar({ equipo: nuevo('Sin hechos'), entrada: payload() }).pipe(como(f.autor))
      const leer = (id: number) => Effect.map(miDiagnostico(Schema.decodeSync(DiagnosticId)(id)).pipe(como(f.autor)), (d) => d.captura)
      expect(yield* leer(con.id)).toMatchObject(hechos)
      expect(yield* leer(sin.id)).toMatchObject({ nivel_x86: null, arranque_seguro: null, tpm: null, zram_mb: null, swap_mb: null })
    })))

  it.effect('sin sesión o con un payload ilegible no guarda nada', conBase((f) =>
    Effect.gen(function* () {
      const antes = yield* contar(f, 'diagnostico')
      expect(yield* Effect.flip(guardar({ equipo: nuevo('x'), entrada: payload() }).pipe(comoInvitado))).toBeInstanceOf(Unauthenticated)
      const ilegible = yield* Effect.flip(guardar({ equipo: nuevo('x'), entrada: { _tag: 'detector', texto: 'no es un payload' } }).pipe(como(f.autor)))
      expect(ilegible).toMatchObject({ _tag: 'PayloadInvalido', reason: 'ilegible' })
      expect(yield* contar(f, 'diagnostico')).toBe(antes)
      expect(yield* f.sql`SELECT count(*)::int AS n FROM equipo WHERE alias = 'x'`).toEqual([{ n: 0 }])
    })))
})

layer(PgTest)('consultas de diagnóstico', (it) => {
  const perfiles = (f: Base) =>
    Effect.gen(function* () {
      yield* f.sql`UPDATE perfil_configuracion SET ram_min_mb = 32768, vram_min_mb = 2048 WHERE id = ${f.perfil}`
      yield* f.sql`UPDATE perfil_configuracion SET ${f.sql.update({ estado_revision: 'aprobado', revisor_id: f.revisor, revisado_en: new Date(), motivo_revision: 'probado', evidencia_revision: 'reporte' })} WHERE id = ${f.perfil}`
      yield* f.sql`INSERT INTO perfil_configuracion (edicion_id, distribucion_id, version_capa_id, autor_id, arquitectura, revision, titulo, ram_min_mb)
                   VALUES (${f.ed2}, ${f.dist}, ${f.capa}, ${f.autor}, 'x86_64', 1, 'pendiente', 1024)`
    })

  it.effect('evaluarSinGuardar evalúa contra perfiles aprobados y no guarda nada, ni la distribución', conBase((f) =>
    Effect.gen(function* () {
      yield* perfiles(f)
      const antes = yield* Effect.all([contar(f, 'diagnostico'), contar(f, 'equipo'), contar(f, 'distribucion')])
      const { captura, matriz } = yield* evaluarSinGuardar(payload({ distribucion: { nombre: 'Distro Nueva', version: '1' } }))
      expect(yield* Effect.all([contar(f, 'diagnostico'), contar(f, 'equipo'), contar(f, 'distribucion')])).toEqual(antes)
      expect(captura.ram_mb).toBe(15766)
      const fila = (titulo: string) => matriz.find((m) => m.titulo === titulo)
      expect(fila('Juego')).toMatchObject({ estado: 'sin_evidencia', pruebas: 0, perfil: { id: f.perfil, evaluacion: { verdict: 'no_cumple' } } })
      expect(fila('Juego')?.perfil?.evaluacion.checks.map((c) => [c.requirement, c.status])).toEqual([['ram', 'no_cumple'], ['vram', 'desconocido']])
      expect(fila('Otro juego')?.perfil).toBeNull()
    })))

  it.effect('evaluarSinGuardar proyecta la GPU a Linux desde el PCI id cuando no hay vulkaninfo', conBase(() =>
    Effect.gen(function* () {
      const { equipo } = yield* evaluarSinGuardar(payload({ gpu_pci_id: '8086:9a49', controlador: 'i915' }))
      expect(equipo).toMatchObject({
        vulkan: { support: 'si', origin: 'proyectado', range: { from: { text: '1.3' }, to: { text: '1.4' } } },
        gpu: { family: 'intel_gen9_o_posterior', driver: 'i915', warnings: [] },
        paths: { d3d9_11: 'dxvk_2', d3d12: true },
      })
    })))

  it.effect('sin reportes, cada juego recibe su ruta gráfica, igual al evaluar y al releer lo guardado', conBase((f) =>
    Effect.gen(function* () {
      yield* f.sql`INSERT INTO juego_api (juego_id, api) SELECT juego_id, api FROM edicion_juego, unnest(ARRAY['d3d11', 'd3d12']) AS api WHERE id = ${f.ed}`
      yield* f.sql`INSERT INTO juego_api (juego_id, api) SELECT juego_id, 'vulkan' FROM edicion_juego WHERE id = ${f.ed2}`
      yield* f.sql`UPDATE juego SET nivel_x86_min = 'v2' WHERE id = (SELECT juego_id FROM edicion_juego WHERE id = ${f.ed2})`
      // A Kepler without vulkaninfo on an x86-64-v1 CPU.
      const entrada = payload({ gpu_pci_id: '10de:1187', controlador: 'nouveau', nivel_x86: 'v1' })
      const rutas = (matriz: ReadonlyArray<FilaMatriz>) => matriz.map((m) => [m.titulo, m.ruta])
      const esperado = [
        ['Juego', { status: 'con_ruta', path: 'dxvk_sarek' }],
        ['Otro juego', { status: 'sin_ruta', reason: 'cpu' }],
      ]
      const evaluado = yield* evaluarSinGuardar(entrada)
      expect(rutas(evaluado.matriz)).toEqual(esperado)
      const { id } = yield* guardar({ equipo: existente(f.equipo), entrada }).pipe(como(f.autor))
      const guardado = yield* miDiagnostico(id).pipe(como(f.autor))
      expect(rutas(guardado.matriz)).toEqual(esperado)
      expect(guardado.distribuciones.evaluadas.map((d) => [d.key, d.verdict])).toEqual([
        ['mint_22', 'con_ajustes'],
        ['ubuntu_2404', 'con_ajustes'],
        ['fedora', 'con_ajustes'],
        ['bazzite', 'descartada'],
        ['cachyos', 'con_ajustes'],
        ['arch', 'con_ajustes'],
      ])
    })))

  const catalogoConSteam = (f: Base) =>
    Effect.gen(function* () {
      const gta = yield* idDe(f.sql`INSERT INTO juego (titulo, descripcion) VALUES ('Grand Theft Auto V', 'd') RETURNING id`)
      yield* f.sql`INSERT INTO edicion_juego (juego_id, lanzador_id, identificador_externo) VALUES (${gta}, ${f.lanzador}, '271590')`
      const epic = yield* idDe(f.sql`INSERT INTO lanzador (nombre) VALUES ('Epic Games Store') RETURNING id`)
      yield* f.sql`INSERT INTO edicion_juego (juego_id, lanzador_id, identificador_externo) SELECT juego_id, ${epic}, '227300' FROM edicion_juego WHERE id = ${f.ed2}`
    })
  const enBiblioteca = (matriz: ReadonlyArray<{ readonly titulo: string; readonly en_biblioteca: boolean }>) =>
    matriz.filter((m) => m.en_biblioteca).map((m) => m.titulo)

  it.effect('miDiagnostico separa la biblioteca guardada en juegos del catálogo y juegos desconocidos', conBase((f) =>
    Effect.gen(function* () {
      yield* catalogoConSteam(f)
      const { id } = yield* guardar({ con_biblioteca: true, equipo: existente(f.equipo), entrada: payloadWindows() }).pipe(como(f.autor))
      const guardado = yield* miDiagnostico(id).pipe(como(f.autor))
      expect(enBiblioteca(guardado.matriz)).toEqual(['Grand Theft Auto V'])
      expect(guardado.matriz.map((m) => m.titulo)).toEqual(['Grand Theft Auto V', 'Juego', 'Otro juego'])
      expect(guardado.biblioteca).toEqual({
        total: 4,
        unknown: [
          { app_id: 9999990, nombre: 'Café "Noir": Édition™' },
          { app_id: 227300, nombre: 'Euro Truck Simulator 2' },
          { app_id: 292030, nombre: 'The Witcher 3: Wild Hunt' },
        ],
      })
      expect(yield* Effect.flip(miDiagnostico(id).pipe(como(f.revisor)))).toMatchObject({ _tag: 'NoEncontrado' })
    })))

  it.effect('sin guardar la biblioteca, el diagnóstico guardado no la muestra', conBase((f) =>
    Effect.gen(function* () {
      yield* catalogoConSteam(f)
      const { id } = yield* guardar({ equipo: existente(f.equipo), entrada: payloadWindows() }).pipe(como(f.autor))
      const guardado = yield* miDiagnostico(id).pipe(como(f.autor))
      expect([guardado.biblioteca, guardado.captura.biblioteca_steam, enBiblioteca(guardado.matriz)]).toEqual([null, null, []])
    })))

  it.effect('un invitado ve su biblioteca evaluada sin que se guarde nada', conBase((f) =>
    Effect.gen(function* () {
      yield* catalogoConSteam(f)
      const antes = yield* Effect.all([contar(f, 'diagnostico'), contar(f, 'equipo')])
      const evaluado = yield* evaluarSinGuardar(payloadWindows()).pipe(comoInvitado)
      expect(yield* Effect.all([contar(f, 'diagnostico'), contar(f, 'equipo')])).toEqual(antes)
      expect(enBiblioteca(evaluado.matriz)).toEqual(['Grand Theft Auto V'])
      expect(evaluado.biblioteca?.unknown.map((j) => j.app_id)).toEqual([9999990, 227300, 292030])
    })))

  it.effect('miDiagnostico es solo del dueño; misEquipos de un invitado está vacío', conBase((f) =>
    Effect.gen(function* () {
      yield* perfiles(f)
      const id = Schema.decodeSync(DiagnosticId)(f.diag)
      const propio = yield* miDiagnostico(id).pipe(como(f.autor))
      expect(propio).toMatchObject({ alias: 'portátil', captura: { sistema: 'Linux', distribucion: { nombre: 'Linux Mint', version: '22' }, ram_mb: 8192 } })
      expect(propio.matriz.find((m) => m.titulo === 'Juego')?.perfil?.evaluacion.verdict).toBe('no_cumple')
      expect(yield* Effect.flip(miDiagnostico(id).pipe(como(f.revisor)))).toMatchObject({ _tag: 'NoEncontrado' })
      expect(yield* misEquipos().pipe(comoInvitado)).toEqual([])
    })))
})
