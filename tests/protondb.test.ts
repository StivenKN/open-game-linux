import { describe, expect, layer } from '@effect/vitest'
import { Effect, Option } from 'effect'
import { SqlClient } from 'effect/sql'
import { EditionId, GameId } from '../src/domain/ids.ts'
import { ProtonDbSummary } from '../src/domain/tables.ts'
import { Visitante } from '../src/server/auth.ts'
import { catalogo } from '../src/server/queries/catalog.ts'
import { fichaJuego } from '../src/server/queries/game.ts'
import { importarProtonDb } from '../src/server/external/protondb.ts'
import { filas } from '../src/server/rows.ts'
import { elDia, enRollback, idDe, PgTest } from './support.ts'

async function* trozos(texto: string) {
  for (let i = 0; i < texto.length; i += 7) yield texto.slice(i, i + 7)
}

type Registro = { appId: string | number; fecha: string; funciona: boolean; ram?: string; variant?: string; version?: string }

const registro = ({ appId, fecha, funciona, ram = '16 GB', variant = 'official', version }: Registro) =>
  JSON.stringify({
    app: { steam: { appId }, title: 'Juego inventado' },
    timestamp: Date.parse(fecha) / 1000,
    systemInfo: { gpu: 'NVIDIA GeForce GTX 1060', ram },
    responses: { verdict: funciona ? 'yes' : 'no', variant, ...(version === undefined ? {} : { customProtonVersion: version }) },
  })

const exportacion = (...elementos: ReadonlyArray<string>) => `[\n${elementos.join(',\n')}\n]`

const ge = { variant: 'ge', version: 'GE-Proton10-34' }
const repetido = registro({ appId: '1000', fecha: '2026-09-01T00:00:00Z', funciona: true, ...ge })
const octubre = exportacion(
  repetido,
  repetido,
  registro({ appId: '1000', fecha: '2026-08-01T00:00:00Z', funciona: true, ram: '8 GB', ...ge }),
  registro({ appId: '1000', fecha: '2026-07-01T00:00:00Z', funciona: false, ram: '8 GB' }),
  registro({ appId: '1000', fecha: '2024-05-01T00:00:00Z', funciona: true }),
  registro({ appId: 2000, fecha: '2026-10-01T00:00:00Z', funciona: true }),
  registro({ appId: '3000', fecha: '2026-09-15T00:00:00Z', funciona: true }),
  registro({ appId: '1000', fecha: '2027-01-01T00:00:00Z', funciona: true }),
  '{"timestamp":"ayer"}',
)

const escenario = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const insertar = (tabla: string, fila: Record<string, string | number | null>) =>
    idDe(sql`INSERT INTO ${sql(tabla)} ${sql.insert(fila)} RETURNING id`)
  const steam = yield* insertar('lanzador', { nombre: 'Steam' })
  const epic = yield* insertar('lanzador', { nombre: 'Epic Games Store' })
  const uno = yield* insertar('juego', { titulo: 'Juego Uno', descripcion: 'd' })
  const dos = yield* insertar('juego', { titulo: 'Juego Dos', descripcion: 'd' })
  const tres = yield* insertar('juego', { titulo: 'Juego Tres', descripcion: 'd' })
  const unoSteam = yield* insertar('edicion_juego', { juego_id: uno, lanzador_id: steam, identificador_externo: '1000' })
  yield* insertar('edicion_juego', { juego_id: uno, lanzador_id: epic, identificador_externo: '2000' })
  const dosSteam = yield* insertar('edicion_juego', { juego_id: dos, lanzador_id: steam, identificador_externo: '2000' })
  yield* insertar('edicion_juego', { juego_id: tres, lanzador_id: steam, identificador_externo: null })
  return { uno: GameId.make(uno), tres: GameId.make(tres), unoSteam: EditionId.make(unoSteam), dosSteam: EditionId.make(dosSteam) }
})

const guardados = Effect.flatMap(SqlClient.SqlClient, (sql) => filas(ProtonDbSummary, sql`SELECT * FROM protondb_resumen ORDER BY edicion_id`))

const importar = (texto: string) => importarProtonDb(trozos(texto))
const motivoDe = (texto: string) => Effect.map(Effect.flip(importar(texto)), (e) => ('motivo' in e ? e.motivo : e._tag))

const hoy = new Date('2026-10-15T00:00:00Z')
const exportadoEn = new Date('2026-10-01T00:00:00Z')

layer(PgTest)('importarProtonDb', (it) => {
  describe('un export de octubre', () => {
    it.effect('guarda un resumen por edición de Steam del catálogo, sin duplicados ni reportes futuros', () =>
      enRollback(
        Effect.gen(function* () {
          const e = yield* escenario
          expect(yield* importar(octubre)).toEqual({ leidos: 9, descartados: 2, coincidentes: 6, guardados: 2, exportado_en: exportadoEn })
          expect(yield* guardados).toEqual([
            {
              edicion_id: e.unoSteam,
              exportado_en: exportadoEn,
              reportes_total: 4,
              recientes: 3,
              recientes_funcionan: 2,
              modestos_recientes: 2,
              modestos_funcionan: 1,
              ultimo_reporte: new Date('2026-09-01T00:00:00Z'),
              capa_variante: 'ge',
              capa_version: 'GE-Proton10-34',
              capa_reportes: 2,
            },
            {
              edicion_id: e.dosSteam,
              exportado_en: exportadoEn,
              reportes_total: 1,
              recientes: 1,
              recientes_funcionan: 1,
              modestos_recientes: 0,
              modestos_funcionan: 0,
              ultimo_reporte: exportadoEn,
              capa_variante: 'official',
              capa_version: null,
              capa_reportes: 1,
            },
          ])
        }),
      ).pipe(elDia(hoy)),
    )

    it.effect('importar el mismo export otra vez deja las mismas filas', () =>
      enRollback(
        Effect.gen(function* () {
          yield* escenario
          yield* importar(octubre)
          const primera = yield* guardados
          yield* importar(octubre)
          expect(yield* guardados).toEqual(primera)
        }),
      ).pipe(elDia(hoy)),
    )
  })

  describe('después de importar octubre', () => {
    it.effect('un export más nuevo reemplaza todo y quita la edición que ya no aparece', () =>
      enRollback(
        Effect.gen(function* () {
          const e = yield* escenario
          yield* importar(octubre)
          const noviembre = exportacion(registro({ appId: '2000', fecha: '2026-11-01T00:00:00Z', funciona: false }))
          yield* importar(noviembre).pipe(elDia(new Date('2026-11-15T00:00:00Z')))
          expect((yield* guardados).map((r) => [r.edicion_id, r.reportes_total, r.recientes_funcionan, r.capa_variante])).toEqual([[e.dosSteam, 1, 0, null]])
        }),
      ).pipe(elDia(hoy)),
    )

    it.effect('una entrada vacía, truncada o sin reportes válidos falla y conserva lo importado', () =>
      enRollback(
        Effect.gen(function* () {
          yield* escenario
          yield* importar(octubre)
          const antes = yield* guardados
          expect(yield* motivoDe('')).toBe('la entrada está vacía')
          expect(yield* motivoDe(octubre.slice(0, octubre.length - 40))).toBe('el archivo está truncado')
          expect(yield* motivoDe('[{"app":{}}]')).toBe('ningún reporte válido')
          expect(yield* guardados).toEqual(antes)
        }),
      ).pipe(elDia(hoy)),
    )

    it.effect('un export más antiguo que el importado se rechaza', () =>
      enRollback(
        Effect.gen(function* () {
          yield* escenario
          yield* importar(octubre)
          const antes = yield* guardados
          const septiembre = exportacion(registro({ appId: '1000', fecha: '2026-09-01T00:00:00Z', funciona: false }))
          expect(yield* motivoDe(septiembre)).toBe('exportación más antigua que la importada')
          expect(yield* guardados).toEqual(antes)
        }),
      ).pipe(elDia(hoy)),
    )
  })

  describe('lectura', () => {
    const invitado = Visitante.of(Option.none())

    it.effect('la ficha y el catálogo muestran el resumen sin tocar el estado calculado ni los contadores', () =>
      enRollback(
        Effect.gen(function* () {
          const e = yield* escenario
          const antes = yield* catalogo({})
          yield* importar(octubre)
          const despues = yield* catalogo({})
          expect(despues.contadores).toEqual(antes.contadores)
          expect(despues.juegos.map((j) => [j.titulo, j.resumen.estado, j.protondb])).toEqual([
            ['Juego Dos', 'sin_evidencia', { recientes: 1, recientes_funcionan: 1, reportes_total: 1 }],
            ['Juego Tres', 'sin_evidencia', null],
            ['Juego Uno', 'sin_evidencia', { recientes: 3, recientes_funcionan: 2, reportes_total: 4 }],
          ])
          const uno = yield* Effect.provideService(fichaJuego(e.uno), Visitante, invitado)
          expect(uno.resumen.status).toBe('sin_evidencia')
          expect(uno.protondb).toEqual({
            juego_id: e.uno,
            app_id: '1000',
            edicion_id: e.unoSteam,
            exportado_en: exportadoEn,
            reportes_total: 4,
            recientes: 3,
            recientes_funcionan: 2,
            modestos_recientes: 2,
            modestos_funcionan: 1,
            ultimo_reporte: new Date('2026-09-01T00:00:00Z'),
            capa_variante: 'ge',
            capa_version: 'GE-Proton10-34',
            capa_reportes: 2,
          })
          expect((yield* Effect.provideService(fichaJuego(e.tres), Visitante, invitado)).protondb).toBeNull()
        }),
      ).pipe(elDia(hoy)),
    )
  })
})
