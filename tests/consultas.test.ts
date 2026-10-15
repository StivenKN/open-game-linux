import { describe, expect, layer } from '@effect/vitest'
import { Effect, Exit, Option, Struct } from 'effect'
import { SqlClient } from 'effect/sql'
import { type ResumenCompatibilidad, resumir } from '../src/dominio/compatibilidad.ts'
import { GuiaId, JuegoId, LanzadorId, PerfilId, UsuarioId } from '../src/dominio/ids.ts'
import { gtaV } from '../src/dominio/muestras.ts'
import { Visitante } from '../src/servidor/auth.ts'
import { catalogo } from '../src/servidor/consultas/catalogo.ts'
import { fichaJuego } from '../src/servidor/consultas/ficha.ts'
import { guia, guias } from '../src/servidor/consultas/guias.ts'
import { perfil } from '../src/servidor/consultas/perfil.ts'
import { enRollback, idDe, PgTest } from './apoyo.ts'

type Valor = string | number | boolean | Date | null

const invitado = Visitante.of(Option.none())
const ana = Visitante.of(Option.some({ id: UsuarioId.make('ana'), alias: 'ana', rol: 'usuario' }))

const escenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertar = (tabla: string, fila: Record<string, Valor>) => idDe(sql`INSERT INTO ${sql(tabla)} ${sql.insert(fila)} RETURNING id`)
  const revisado = {
    creado_en: new Date('2026-10-03T00:00:00Z'),
    revisor_id: 'revisor',
    revisado_en: new Date('2026-10-04T00:00:00Z'),
    motivo_revision: 'probado',
  }
  const aprobado = { ...revisado, estado_revision: 'aprobado', evidencia_revision: 'captura de MangoHud' }

  for (const [id, correo] of [['autor', 'autor@demo.opengame.test'], ['revisor', 'revisor@opengame.test'], ['ana', 'ana@opengame.test']])
    yield* sql`INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo) VALUES (${id}, ${id}, ${correo}, false, ${id === 'revisor' ? 'revisor' : 'usuario'}, true)`

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

  const juego = (titulo: string) => insertar('juego', { titulo, descripcion: 'd' })
  const edicion = (juego_id: number, lanzador_id: number) => insertar('edicion_juego', { juego_id, lanzador_id })
  const gta = yield* juego('Grand Theft Auto V')
  const gtaSteam = yield* edicion(gta, steam)
  const gtaEpic = yield* edicion(gta, epic)
  const valorant = yield* juego('Valorant')
  const valorantSteam = yield* edicion(valorant, steam)
  const cs2 = yield* juego('Counter-Strike 2')
  const cs2Steam = yield* edicion(cs2, steam)
  const ets2 = yield* juego('Euro Truck Simulator 2')
  const ets2Steam = yield* edicion(ets2, steam)

  const equipo = (usuario_id: string) => insertar('equipo', { usuario_id, alias: `pc de ${usuario_id}` })
  const diagnostico = (equipo_id: number, distribucion_id: number, capturado_en: string, extra: Record<string, Valor> = {}) =>
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
  const pcAutor = yield* equipo('autor')
  const enMint = yield* diagnostico(pcAutor, mint, '2026-08-01T00:00:00Z')
  const enArch = yield* diagnostico(pcAutor, arch, '2026-08-02T00:00:00Z')
  const enFedora = yield* diagnostico(pcAutor, fedora, '2026-08-03T00:00:00Z')

  const condiciones = { arquitectura: 'x86_64', ram_min_mb: 8192, vram_min_mb: 2048, requiere_vulkan: true, version_vulkan_min: '1.1' }
  const perfilAprobado = yield* insertar('perfil_configuracion', {
    edicion_id: gtaSteam, distribucion_id: mint, version_capa_id: proton8, autor_id: 'autor', revision: 2, titulo: 'GTAV-BAJO', ...condiciones,
    creado_en: revisado.creado_en,
  })
  const perfilEnPrueba = yield* insertar('perfil_configuracion', {
    edicion_id: gtaSteam, distribucion_id: mint, version_capa_id: proton8, autor_id: 'autor', revision: 3, titulo: 'GTAV-BAJO', ...condiciones,
  })
  const perfilRetirado = yield* insertar('perfil_configuracion', {
    edicion_id: gtaSteam, distribucion_id: mint, version_capa_id: proton8, autor_id: 'autor', revision: 1, titulo: 'GTAV-BAJO',
    ...condiciones, ...revisado, estado_revision: 'retirado',
  })
  for (const [orden, titulo] of [[2, 'Elige Proton 8.0-5'], [1, 'Activa Steam Play']] as const)
    yield* sql`INSERT INTO paso_configuracion (perfil_id, orden, titulo, instruccion) VALUES (${perfilAprobado}, ${orden}, ${titulo}, 'i')`
  yield* sql`UPDATE perfil_configuracion SET ${sql.update(Struct.omit(aprobado, ['creado_en']))} WHERE id = ${perfilAprobado}`

  const sinFps = { fps_promedio: null, resolucion: null, calidad_grafica: null, metodo_medicion: null }
  const reporte = (fila: Record<string, Valor>, revision: Record<string, Valor> = aprobado) =>
    insertar('reporte', { observaciones: 'o', ...sinFps, ...fila, ...revision })
  yield* reporte({
    edicion_id: gtaSteam, diagnostico_id: enMint, version_capa_id: proton8, perfil_id: perfilAprobado, version_juego: '1.0.3179',
    resultado: 'funciona', fecha_prueba: new Date('2026-09-28T12:00:00Z'),
    fps_promedio: 54, resolucion: '1280x720', calidad_grafica: 'Bajo', metodo_medicion: 'MangoHud · misión Prólogo · 5 min',
  })
  yield* reporte({
    edicion_id: gtaSteam, diagnostico_id: enMint, version_capa_id: proton8, perfil_id: perfilAprobado, version_juego: '1.0.3179',
    resultado: 'funciona', fecha_prueba: new Date('2026-09-14T12:00:00Z'),
  })
  yield* reporte({
    edicion_id: gtaEpic, diagnostico_id: enArch, version_capa_id: ge94, version_juego: '1.0.3179',
    resultado: 'funciona_con_ajustes', fecha_prueba: new Date('2026-09-02T12:00:00Z'),
    fps_promedio: 60, resolucion: '1920x1080', calidad_grafica: 'Medio', metodo_medicion: 'MangoHud · conducción en ciudad · 10 min',
  })
  const gtaFedora = yield* reporte({
    edicion_id: gtaSteam, diagnostico_id: enFedora, version_capa_id: proton9, version_juego: '1.0.3258',
    resultado: 'falla_en_ejecucion', fecha_prueba: new Date('2026-10-02T12:00:00Z'),
  })
  yield* sql`INSERT INTO reporte_fallo (reporte_id, tipo_fallo_id, detalle) VALUES (${gtaFedora}, ${lanzadorFallo}, 'el lanzador no abre')`
  const solucion = (titulo: string, perfil_id: number | null, revision: Record<string, Valor>) =>
    insertar('solucion', { reporte_id: gtaFedora, tipo_fallo_id: lanzadorFallo, autor_id: 'ana', titulo, instrucciones: 'i', perfil_id, ...revision })
  yield* solucion('Volver a Proton 8.0-5', null, aprobado)
  yield* solucion('Usar el perfil retirado', perfilRetirado, aprobado)
  yield* solucion('Sin revisar', null, {})
  yield* reporte({ edicion_id: gtaSteam, diagnostico_id: enMint, version_capa_id: proton8, version_juego: '1.0.3179', resultado: 'no_inicia', fecha_prueba: new Date('2026-10-05T12:00:00Z') }, {})
  yield* reporte({ edicion_id: ets2Steam, diagnostico_id: enMint, version_capa_id: proton8, version_juego: '1.5', resultado: 'funciona', fecha_prueba: new Date('2026-10-05T12:00:00Z') }, {})

  const valorantFallo = yield* reporte({
    edicion_id: valorantSteam, diagnostico_id: enArch, version_capa_id: ge94, version_juego: '9.07', resultado: 'no_inicia', fecha_prueba: new Date('2026-08-03T12:00:00Z'),
  })
  yield* sql`INSERT INTO reporte_fallo (reporte_id, tipo_fallo_id, detalle) VALUES (${valorantFallo}, ${antiCheat}, 'Vanguard')`
  yield* reporte({ edicion_id: cs2Steam, diagnostico_id: enArch, version_capa_id: ge94, version_juego: '1.0', resultado: 'funciona', fecha_prueba: new Date('2026-09-01T12:00:00Z') })

  const pcAna = yield* equipo('ana')
  yield* diagnostico(pcAna, fedora, '2026-07-01T00:00:00Z')
  yield* diagnostico(pcAna, mint, '2026-09-01T00:00:00Z', { ram_mb: 16384, vram_mb: 4096, soporte_vulkan: 'si', version_vulkan: '1.3' })

  const guia = (titulo: string, estado: string) =>
    insertar('guia_adopcion', { autor_id: 'revisor', tipo: 'instalacion', titulo, contenido: 'Pasos', revision: 1, estado })
  const guiaPublicada = yield* guia('Instalar Linux Mint', 'publicada')
  const guiaBorrador = yield* guia('Borrador sin publicar', 'borrador')

  return {
    insertar,
    aprobado,
    gta: JuegoId.make(gta),
    gtaSteam,
    fedora,
    proton9,
    epic: LanzadorId.make(epic),
    perfilAprobado: PerfilId.make(perfilAprobado),
    perfilEnPrueba: PerfilId.make(perfilEnPrueba),
    perfilRetirado: PerfilId.make(perfilRetirado),
    guiaPublicada: GuiaId.make(guiaPublicada),
    guiaBorrador: GuiaId.make(guiaBorrador),
  }
})

const forma = (r: ResumenCompatibilidad) => ({
  estado: r.estado,
  pruebas: r.pruebas,
  ultima_prueba: r.ultima_prueba,
  fallos: r.fallos,
  entornos: r.entornos.map((e) => ({
    version_juego: e.version_juego,
    estado: e.estado,
    pruebas: e.pruebas,
    por_resultado: e.por_resultado,
    ultima_prueba: e.ultima_prueba,
    fallos: e.fallos,
    fps: e.fps,
  })),
})

const titulos = (c: { readonly juegos: ReadonlyArray<{ readonly titulo: string }> }) => c.juegos.map((j) => j.titulo)

layer(PgTest)('consultas', (it) => {
  describe('fichaJuego', () => {
    it.effect('resume GTA V igual que el fixture de muestras.ts, sin contar el pendiente', () =>
      enRollback(
        Effect.gen(function* () {
          const e = yield* escenario
          const ficha = yield* Effect.provideService(fichaJuego(e.gta), Visitante, invitado)
          expect(forma(ficha.resumen)).toEqual(forma(resumir(gtaV.pruebas)))
          expect(ficha.resumen.estado).toBe('resultados_variables')
          expect(ficha.resumen.entornos).toHaveLength(3)
          expect(ficha.pendientes).toBe(1)
          expect(ficha.ejemplo).toBe(true)
          expect(ficha.personal).toBeNull()
          expect(ficha.causas.map((c) => [c.codigo, c.descripcion, c.soluciones.map((x) => x.titulo)])).toEqual([
            ['lanzador', 'El lanzador no abre.', ['Volver a Proton 8.0-5']],
          ])
        }),
      ),
    )

    it.effect('compara con el diagnóstico más reciente del visitante y lista perfiles aprobados primero', () =>
      enRollback(
        Effect.gen(function* () {
          const e = yield* escenario
          const ficha = yield* Effect.provideService(fichaJuego(e.gta), Visitante, ana)
          expect(ficha.personal?.en_mi_distribucion?.nombre).toBe('Linux Mint 21.3')
          expect(ficha.personal?.en_mi_distribucion?.resumen.estado).toBe('funciona')
          expect(ficha.personal?.en_mi_distribucion?.resumen.pruebas).toBe(2)
          expect(ficha.personal?.perfil).toMatchObject({ id: e.perfilAprobado, evaluacion: { veredicto: 'cumple' } })
          expect(ficha.perfiles.map((p) => [p.id, p.estado_revision, p.evaluacion?.veredicto ?? null])).toEqual([
            [e.perfilAprobado, 'aprobado', 'cumple'],
            [e.perfilEnPrueba, 'pendiente', null],
          ])
        }),
      ),
    )

    it.effect('un diagnóstico de Windows con una Kepler proyecta Vulkan 1.2 y no cumple un mínimo de 1.3', () =>
      enRollback(
        Effect.gen(function* () {
          const e = yield* escenario
          const sql = yield* SqlClient.SqlClient
          const pc = yield* e.insertar('equipo', { usuario_id: 'ana', alias: 'pc con Windows' })
          // The Vulkan the Windows driver reported (1.4) must not count: it says nothing about Linux.
          yield* e.insertar('diagnostico', {
            equipo_id: pc, capturado_en: new Date('2026-10-10T00:00:00Z'), sistema: 'Windows', version_sistema: 'Windows 10 Home 22H2 (19045)',
            distribucion_id: null, arquitectura: 'x86_64', cpu_modelo: 'cpu', gpu_modelo: 'NVIDIA GeForce GT 710', gpu_pci_id: '10de:128b',
            ram_mb: 16384, vram_mb: 2048, soporte_vulkan: 'si', version_vulkan: '1.4',
          })
          const exigente = yield* e.insertar('perfil_configuracion', {
            edicion_id: e.gtaSteam, distribucion_id: e.fedora, version_capa_id: e.proton9, autor_id: 'autor', revision: 1, titulo: 'GTAV-VULKAN',
            arquitectura: 'x86_64', ram_min_mb: 8192, requiere_vulkan: true, version_vulkan_min: '1.3', creado_en: e.aprobado.creado_en,
          })
          yield* sql`UPDATE perfil_configuracion SET ${sql.update(Struct.omit(e.aprobado, ['creado_en']))} WHERE id = ${exigente}`
          const ficha = yield* Effect.provideService(fichaJuego(e.gta), Visitante, ana)
          expect(ficha.perfiles.find((p) => p.id === exigente)?.evaluacion).toEqual({
            veredicto: 'no_cumple',
            solo_orientativa: true,
            comprobaciones: [
              { requisito: 'ram', estado: 'cumple', exigido: '8192', detectado: { valor: '16384', origen: 'medido' } },
              { requisito: 'vulkan', estado: 'no_cumple', exigido: '1.3', detectado: { valor: '1.2', origen: 'proyectado' } },
            ],
          })
        }),
      ),
    )

    it.effect('un juego que no existe es NoEncontrado', () =>
      enRollback(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(Effect.provideService(fichaJuego(JuegoId.make(999999)), Visitante, invitado))
          expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag))).toEqual(Option.some('NoEncontrado'))
        }),
      ),
    )
  })

  describe('catalogo', () => {
    it.effect('filtra por estado calculado, anti-cheat y título, y cuenta solo lo aprobado', () =>
      enRollback(
        Effect.gen(function* () {
          const e = yield* escenario
          expect(titulos(yield* catalogo({ estado: 'funciona' }))).toEqual(['Counter-Strike 2'])
          expect(titulos(yield* catalogo({ estado: 'sin_evidencia' }))).toEqual(['Euro Truck Simulator 2'])
          expect(titulos(yield* catalogo({ sin_anti_cheat: true }))).not.toContain('Valorant')
          expect(titulos(yield* catalogo({ q: 'theft' }))).toEqual(['Grand Theft Auto V'])
          expect(titulos(yield* catalogo({ q: '%' }))).toEqual([])
          expect(titulos(yield* catalogo({ lanzador: e.epic }))).toEqual(['Grand Theft Auto V'])
          const todo = yield* catalogo({})
          expect(todo.juegos.find((j) => j.titulo === 'Euro Truck Simulator 2')).toMatchObject({ pendientes: 1, resumen: { pruebas: 0 } })
          expect(todo.contadores).toEqual({ juegos_verificados: 3, reportes_aprobados: 6, perfiles_aprobados: 1, distribuciones_probadas: 3 })
        }),
      ),
    )

    it.effect('cuenta cada estado sobre los demás filtros, sin aplicar el de estado', () =>
      enRollback(
        Effect.gen(function* () {
          yield* escenario
          const porEstado = { sin_evidencia: 1, funciona: 1, funciona_con_ajustes: 0, no_inicia: 1, falla_en_ejecucion: 0, resultados_variables: 1 }
          expect((yield* catalogo({})).por_estado).toEqual(porEstado)
          expect((yield* catalogo({ estado: 'funciona' })).por_estado).toEqual(porEstado)
          expect((yield* catalogo({ sin_anti_cheat: true })).por_estado).toEqual({ ...porEstado, no_inicia: 0 })
          expect((yield* catalogo({ q: 'theft' })).por_estado).toEqual({ ...porEstado, sin_evidencia: 0, funciona: 0, no_inicia: 0 })
        }),
      ),
    )
  })

  describe('perfil', () => {
    it.effect('muestra los pasos en orden y no evalúa un perfil en prueba', () =>
      enRollback(
        Effect.gen(function* () {
          const e = yield* escenario
          const aprobado = yield* Effect.provideService(perfil(e.perfilAprobado), Visitante, invitado)
          expect(aprobado.pasos.map((p) => p.titulo)).toEqual(['Activa Steam Play', 'Elige Proton 8.0-5'])
          expect(aprobado.evaluacion).toBe('sin_diagnostico')
          const enPrueba = yield* Effect.provideService(perfil(e.perfilEnPrueba), Visitante, ana)
          expect(enPrueba.evaluacion).toBe('perfil_en_prueba')
          const conDiagnostico = yield* Effect.provideService(perfil(e.perfilAprobado), Visitante, ana)
          expect(conDiagnostico.evaluacion).toMatchObject({ veredicto: 'cumple' })
        }),
      ),
    )

    it.effect('un perfil retirado no es público', () =>
      enRollback(
        Effect.gen(function* () {
          const e = yield* escenario
          const exit = yield* Effect.exit(Effect.provideService(perfil(e.perfilRetirado), Visitante, invitado))
          expect(Exit.findErrorOption(exit).pipe(Option.map((x) => x._tag))).toEqual(Option.some('NoEncontrado'))
        }),
      ),
    )
  })

  describe('guias', () => {
    it.effect('solo las publicadas son públicas', () =>
      enRollback(
        Effect.gen(function* () {
          const e = yield* escenario
          expect((yield* guias).map((g) => g.id)).toEqual([e.guiaPublicada])
          expect((yield* guia(e.guiaPublicada)).titulo).toBe('Instalar Linux Mint')
          const exit = yield* Effect.exit(guia(e.guiaBorrador))
          expect(Exit.findErrorOption(exit).pipe(Option.map((x) => x._tag))).toEqual(Option.some('NoEncontrado'))
        }),
      ),
    )
  })
})
