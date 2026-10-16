import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import type { Capture, DiagnosticInput } from '../../domain/contributions.ts'
import { type EvaluatedLibrary, type SteamLibrary, STEAM_LAUNCHER } from '../../domain/library.ts'
import { statusOf } from '../../domain/compatibility.ts'
import { screenDistros, type EvaluatedDistro } from '../../domain/distros.ts'
import { requirements, evaluate, suggestProfile } from '../../domain/evaluation.ts'
import type { MachineOnLinux } from '../../domain/gpu.ts'
import { NotFound, type InvalidPayload } from '../../domain/errors.ts'
import type { DiagnosticId, GuideId, GameId } from '../../domain/ids.ts'
import { GraphicsApi, Outcome } from '../../domain/literals.ts'
import type { X86Level } from '../../domain/platform.ts'
import { gamePath } from '../../domain/graphics-path.ts'
import { Diagnostic, Distribution, Machine, AdoptionGuide, Game, Profile } from '../../domain/tables.ts'
import { exigirUsuario, Visitante } from '../auth.ts'
import { capturaDe } from '../diagnostics/payload.ts'
import { equipoEnLinux } from '../gpu/capability.ts'
import { filas, type Infra } from '../rows.ts'
import { etiquetaCapa, etiquetaDistribucion } from './labels.ts'

const JuegoFila = Schema.Struct({ id: Game.fields.id, titulo: Game.fields.titulo, nivel_x86_min: Game.fields.nivel_x86_min, apis: Schema.Array(GraphicsApi) })
const ResultadoAprobado = Schema.Struct({ juego_id: Game.fields.id, resultado: Outcome })

const PerfilAprobado = Schema.Struct({
  id: Profile.fields.id,
  juego_id: Game.fields.id,
  titulo: Profile.fields.titulo,
  revision: Profile.fields.revision,
  distribucion_id: Profile.fields.distribucion_id,
  arquitectura: Profile.fields.arquitectura,
  ram_min_mb: Profile.fields.ram_min_mb,
  vram_min_mb: Profile.fields.vram_min_mb,
  requiere_vulkan: Profile.fields.requiere_vulkan,
  version_vulkan_min: Profile.fields.version_vulkan_min,
  capa: Schema.String,
  distribucion: Schema.String,
})

/** The capture facts beyond the GPU that the verdicts read. */
type Entorno = { readonly distribucion_id: typeof Distribution.Type.id | null; readonly arquitectura: string; readonly nivel_x86: X86Level | null }

const matriz = (equipo: MachineOnLinux, entorno: Entorno, enBiblioteca: ReadonlySet<GameId>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const juegos = yield* filas(
      JuegoFila,
      sql`
        SELECT j.id, j.titulo, j.nivel_x86_min, COALESCE(array_agg(ja.api) FILTER (WHERE ja.api IS NOT NULL), '{}') AS apis
        FROM juego j LEFT JOIN juego_api ja ON ja.juego_id = j.id
        GROUP BY j.id
        ORDER BY j.titulo, j.id`,
    )
    const resultados = yield* filas(
      ResultadoAprobado,
      sql`
        SELECT ej.juego_id, r.resultado FROM reporte r JOIN edicion_juego ej ON ej.id = r.edicion_id
        WHERE r.estado_revision = 'aprobado'`,
    )
    const perfiles = yield* filas(
      PerfilAprobado,
      sql`
        SELECT p.id, ej.juego_id, p.titulo, p.revision, p.distribucion_id, p.arquitectura,
               p.ram_min_mb, p.vram_min_mb, p.requiere_vulkan, p.version_vulkan_min,
               ${sql.literal(etiquetaCapa('vc'))} AS capa, ${sql.literal(etiquetaDistribucion('d'))} AS distribucion
        FROM perfil_configuracion p
        JOIN edicion_juego ej ON ej.id = p.edicion_id
        JOIN version_capa vc ON vc.id = p.version_capa_id
        JOIN distribucion d ON d.id = p.distribucion_id
        WHERE p.estado_revision = 'aprobado'
        ORDER BY p.id`,
    )
    return juegos.map((juego) => {
      const aprobados = resultados.filter((r) => r.juego_id === juego.id).map((r) => r.resultado)
      const evaluados = perfiles.filter((p) => p.juego_id === juego.id).map((p) => ({ ...p, evaluacion: evaluate(equipo, requirements(p)) }))
      const perfil = suggestProfile(evaluados, entorno)
      return {
        juego_id: juego.id,
        titulo: juego.titulo,
        en_biblioteca: enBiblioteca.has(juego.id),
        estado: statusOf(aprobados),
        pruebas: aprobados.length,
        nivel_x86_min: juego.nivel_x86_min,
        ruta: gamePath(equipo, entorno.nivel_x86, juego),
        perfil:
          perfil === null
            ? null
            : { id: perfil.id, titulo: perfil.titulo, revision: perfil.revision, capa: perfil.capa, distribucion: perfil.distribucion, evaluacion: perfil.evaluacion },
      }
    })
  })

export type FilaMatriz = Effect.Success<ReturnType<typeof matriz>>[number]

const EdicionSteam = Schema.Struct({ app_id: Schema.String, juego_id: Game.fields.id })

const separarBiblioteca = (juegos: SteamLibrary) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const ediciones =
      juegos.length === 0
        ? []
        : yield* filas(
            EdicionSteam,
            sql`
              SELECT ej.identificador_externo AS app_id, ej.juego_id FROM edicion_juego ej JOIN lanzador l ON l.id = ej.lanzador_id
              WHERE l.nombre = ${STEAM_LAUNCHER} AND ej.identificador_externo IN ${sql.in(juegos.map((j) => String(j.app_id)))}`,
          )
    const conocidos = new Set(ediciones.map((e) => e.app_id))
    return {
      enCatalogo: new Set(ediciones.map((e) => e.juego_id)),
      biblioteca: { total: juegos.length, unknown: juegos.filter((j) => !conocidos.has(String(j.app_id))) },
    }
  })

const GuiaDistribucion = Schema.Struct({ id: AdoptionGuide.fields.id })

const evaluarEquipo = (equipo: MachineOnLinux, entorno: Entorno, juegos: SteamLibrary | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const separada = juegos === null ? null : yield* separarBiblioteca(juegos)
    const [guia] = yield* filas(
      GuiaDistribucion,
      sql`SELECT id FROM guia_adopcion WHERE tipo = 'eleccion_distribucion' AND estado = 'publicada' ORDER BY id LIMIT 1`,
    )
    return {
      matriz: yield* matriz(equipo, entorno, separada?.enCatalogo ?? new Set()),
      biblioteca: separada?.biblioteca ?? null,
      distribuciones: { guia: guia?.id ?? null, evaluadas: screenDistros(equipo, entorno.arquitectura) },
    }
  })

export const evaluarSinGuardar = (
  entrada: DiagnosticInput,
): Effect.Effect<
  {
    readonly captura: Capture
    readonly equipo: MachineOnLinux
    readonly matriz: ReadonlyArray<FilaMatriz>
    readonly biblioteca: EvaluatedLibrary | null
    readonly distribuciones: { readonly guia: GuideId | null; readonly evaluadas: ReadonlyArray<EvaluatedDistro> }
  },
  InvalidPayload | Infra,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const captura = yield* capturaDe(entrada)
    const sql = yield* SqlClient.SqlClient
    const [distribucion] =
      captura.sistema === 'Linux'
        ? yield* filas(
            Schema.Struct({ id: Distribution.fields.id }),
            sql`SELECT id FROM distribucion WHERE nombre = ${captura.distribucion.nombre} AND version = ${captura.distribucion.version}`,
          )
        : []
    const equipo = equipoEnLinux(captura)
    const entorno = { distribucion_id: distribucion?.id ?? null, arquitectura: captura.arquitectura, nivel_x86: captura.nivel_x86 }
    return { captura, equipo, ...(yield* evaluarEquipo(equipo, entorno, captura.biblioteca_steam)) }
  })

const DiagnosticoGuardado = Schema.Struct({
  ...Diagnostic.fields,
  alias: Machine.fields.alias,
  distribucion: Schema.NullOr(Schema.Struct({ nombre: Distribution.fields.nombre, version: Distribution.fields.version })),
})

const capturaGuardada = (d: typeof DiagnosticoGuardado.Type): Effect.Effect<Capture> => {
  const comunes = {
    capturado_en: d.capturado_en,
    version_sistema: d.version_sistema,
    arquitectura: d.arquitectura,
    cpu_modelo: d.cpu_modelo,
    gpu_modelo: d.gpu_modelo,
    ram_mb: d.ram_mb,
    vram_mb: d.vram_mb,
    nivel_x86: d.nivel_x86,
    arranque_seguro: d.arranque_seguro,
    tpm: d.tpm,
    zram_mb: d.zram_mb,
    swap_mb: d.swap_mb,
    gpu_pci_id: d.gpu_pci_id,
    biblioteca_steam: d.biblioteca_steam,
  }
  if (d.sistema === 'Windows') return Effect.succeed({ ...comunes, sistema: 'Windows' })
  if (d.distribucion === null) return Effect.die(`diagnostico ${d.id}: Linux sin distribucion`)
  return Effect.succeed({
    ...comunes,
    sistema: 'Linux',
    distribucion: d.distribucion,
    controlador: d.controlador,
    version_controlador: d.version_controlador,
    soporte_vulkan: d.soporte_vulkan,
    version_vulkan: d.version_vulkan,
  })
}

export const miDiagnostico = (id: DiagnosticId) =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient
    const [d] = yield* filas(
      DiagnosticoGuardado,
      sql`
        SELECT d.*, e.alias,
               CASE WHEN dist.id IS NULL THEN NULL ELSE json_build_object('nombre', dist.nombre, 'version', dist.version) END AS distribucion
        FROM diagnostico d
        JOIN equipo e ON e.id = d.equipo_id
        LEFT JOIN distribucion dist ON dist.id = d.distribucion_id
        WHERE d.id = ${id} AND e.usuario_id = ${usuario.id}`,
    )
    if (d === undefined) return yield* Effect.fail(new NotFound())
    const equipo = equipoEnLinux(d)
    return { id: d.id, alias: d.alias, captura: yield* capturaGuardada(d), equipo, ...(yield* evaluarEquipo(equipo, d, d.biblioteca_steam)) }
  })

const EquipoFila = Schema.Struct({ id: Machine.fields.id, alias: Machine.fields.alias })
const CapturaResumida = Schema.Struct({
  id: Diagnostic.fields.id,
  equipo_id: Diagnostic.fields.equipo_id,
  capturado_en: Diagnostic.fields.capturado_en,
  sistema: Diagnostic.fields.sistema,
  gpu_modelo: Diagnostic.fields.gpu_modelo,
  ram_mb: Diagnostic.fields.ram_mb,
  distribucion: Schema.NullOr(Schema.String),
})

export const misEquipos = () =>
  Effect.gen(function* () {
    const visitante = yield* Visitante
    if (Option.isNone(visitante)) return []
    const sql = yield* SqlClient.SqlClient
    const equipos = yield* filas(
      EquipoFila,
      sql`SELECT id, alias FROM equipo WHERE usuario_id = ${visitante.value.id} ORDER BY creado_en, id`,
    )
    const capturas = yield* filas(
      CapturaResumida,
      sql`
        SELECT d.id, d.equipo_id, d.capturado_en, d.sistema, d.gpu_modelo, d.ram_mb, ${sql.literal(etiquetaDistribucion('dist'))} AS distribucion
        FROM diagnostico d
        JOIN equipo e ON e.id = d.equipo_id
        LEFT JOIN distribucion dist ON dist.id = d.distribucion_id
        WHERE e.usuario_id = ${visitante.value.id}
        ORDER BY d.capturado_en DESC, d.id DESC`,
    )
    return equipos.map((e) => ({ ...e, diagnosticos: capturas.filter((c) => c.equipo_id === e.id) }))
  })
