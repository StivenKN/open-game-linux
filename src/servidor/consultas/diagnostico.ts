// Read models for diagnosis (wireframe 9.2): the evaluation matrix for one set of capacities, the
// user's equipos with their capture history, and one saved capture. No FPS estimate exists anywhere.
import { Effect, Option, Schema } from 'effect'
import { SqlClient, type SqlError } from 'effect/sql'
import type { Captura, EntradaDiagnostico } from '../../dominio/aportes.ts'
import { estadoDe } from '../../dominio/compatibilidad.ts'
import { capacidades, condiciones, evaluar, sugerirPerfil } from '../../dominio/evaluacion.ts'
import { NoEncontrado, type PayloadInvalido } from '../../dominio/fallos.ts'
import type { DiagnosticoId } from '../../dominio/ids.ts'
import { Resultado } from '../../dominio/literales.ts'
import { Diagnostico, Distribucion, Equipo, Juego, PerfilConfiguracion } from '../../dominio/tablas.ts'
import { exigirUsuario, Visitante } from '../auth.ts'
import { capturaDe } from '../diagnostico/payload.ts'

type Infra = SqlError.SqlError | Schema.SchemaError

const JuegoFila = Schema.Struct({ id: Juego.fields.id, titulo: Juego.fields.titulo })
const ResultadoAprobado = Schema.Struct({ juego_id: Juego.fields.id, resultado: Resultado })

const PerfilAprobado = Schema.Struct({
  id: PerfilConfiguracion.fields.id,
  juego_id: Juego.fields.id,
  titulo: PerfilConfiguracion.fields.titulo,
  revision: PerfilConfiguracion.fields.revision,
  distribucion_id: PerfilConfiguracion.fields.distribucion_id,
  arquitectura: PerfilConfiguracion.fields.arquitectura,
  ram_min_mb: PerfilConfiguracion.fields.ram_min_mb,
  vram_min_mb: PerfilConfiguracion.fields.vram_min_mb,
  requiere_vulkan: PerfilConfiguracion.fields.requiere_vulkan,
  version_vulkan_min: PerfilConfiguracion.fields.version_vulkan_min,
  capa: Schema.String, // "Proton GE 9-4"
  distribucion: Schema.String, // "Linux Mint 21.3"
})

/** What the matrix compares: a capture's columns, plus where it runs for "perfil sugerido". */
type EquipoEvaluado = Pick<Captura, 'sistema' | 'arquitectura' | 'ram_mb' | 'vram_mb' | 'soporte_vulkan' | 'version_vulkan'> & {
  readonly distribucion_id: typeof Distribucion.Type.id | null
}

/**
 * One row per game: its compatibility from approved reports (estadoDe), and the hardware evaluation
 * against the approved profile sugerirPerfil picks for this equipo. Pending profiles and reports never count.
 */
const matriz = (equipo: EquipoEvaluado) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const juegos = yield* Schema.decodeUnknownEffect(Schema.Array(JuegoFila))(yield* sql`SELECT id, titulo FROM juego ORDER BY titulo, id`)
    const resultados = yield* Schema.decodeUnknownEffect(Schema.Array(ResultadoAprobado))(
      yield* sql`
        SELECT ej.juego_id, r.resultado FROM reporte r JOIN edicion_juego ej ON ej.id = r.edicion_id
        WHERE r.estado_revision = 'aprobado'`,
    )
    const perfiles = yield* Schema.decodeUnknownEffect(Schema.Array(PerfilAprobado))(
      yield* sql`
        SELECT p.id, ej.juego_id, p.titulo, p.revision, p.distribucion_id, p.arquitectura,
               p.ram_min_mb, p.vram_min_mb, p.requiere_vulkan, p.version_vulkan_min,
               vc.familia || ' ' || vc.variante || ' ' || vc.version AS capa, d.nombre || ' ' || d.version AS distribucion
        FROM perfil_configuracion p
        JOIN edicion_juego ej ON ej.id = p.edicion_id
        JOIN version_capa vc ON vc.id = p.version_capa_id
        JOIN distribucion d ON d.id = p.distribucion_id
        WHERE p.estado_revision = 'aprobado'
        ORDER BY p.id`,
    )
    const suyas = capacidades(equipo)
    return juegos.map((juego) => {
      const aprobados = resultados.filter((r) => r.juego_id === juego.id).map((r) => r.resultado)
      const evaluados = perfiles.filter((p) => p.juego_id === juego.id).map((p) => ({ ...p, evaluacion: evaluar(suyas, condiciones(p)) }))
      const perfil = sugerirPerfil(evaluados, equipo)
      return {
        juego_id: juego.id,
        titulo: juego.titulo,
        estado: estadoDe(aprobados),
        pruebas: aprobados.length,
        perfil:
          perfil === null
            ? null
            : { id: perfil.id, titulo: perfil.titulo, revision: perfil.revision, capa: perfil.capa, distribucion: perfil.distribucion, evaluacion: perfil.evaluacion },
      }
    })
  })

export type FilaMatriz = Effect.Success<ReturnType<typeof matriz>>[number]

/**
 * Guests and users alike: parse on the server, evaluate, return. Stores nothing, not even an unknown
 * distribution (it just matches no profile). Saving goes through registrarDiagnostico.
 */
export const evaluarSinGuardar = (
  entrada: EntradaDiagnostico,
): Effect.Effect<{ readonly captura: Captura; readonly matriz: ReadonlyArray<FilaMatriz> }, PayloadInvalido | Infra, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const captura = yield* capturaDe(entrada)
    const sql = yield* SqlClient.SqlClient
    const [distribucion] =
      captura.sistema === 'Linux'
        ? yield* Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ id: Distribucion.fields.id })))(
            yield* sql`SELECT id FROM distribucion WHERE nombre = ${captura.distribucion.nombre} AND version = ${captura.distribucion.version}`,
          )
        : []
    return { captura, matriz: yield* matriz({ ...captura, distribucion_id: distribucion?.id ?? null }) }
  })

const DiagnosticoGuardado = Schema.Struct({
  ...Diagnostico.fields,
  equipo: Equipo.fields.alias,
  distribucion: Schema.NullOr(Schema.Struct({ nombre: Distribucion.fields.nombre, version: Distribucion.fields.version })),
})

const capturaGuardada = (d: typeof DiagnosticoGuardado.Type): Effect.Effect<Captura> => {
  const comunes = {
    capturado_en: d.capturado_en,
    version_sistema: d.version_sistema,
    arquitectura: d.arquitectura,
    cpu_modelo: d.cpu_modelo,
    gpu_modelo: d.gpu_modelo,
    ram_mb: d.ram_mb,
    vram_mb: d.vram_mb,
    controlador: d.controlador,
    version_controlador: d.version_controlador,
    soporte_vulkan: d.soporte_vulkan,
    version_vulkan: d.version_vulkan,
  }
  if (d.sistema === 'Windows') return Effect.succeed({ ...comunes, sistema: 'Windows' })
  // CHECK diagnostico_linux_con_distribucion makes this unreachable; reaching it is schema drift.
  if (d.distribucion === null) return Effect.die(`diagnostico ${d.id}: Linux sin distribucion`)
  return Effect.succeed({ ...comunes, sistema: 'Linux', distribucion: d.distribucion })
}

/** /diagnosticos/$id: the owner only (8.9 "el diagnóstico detallado es privado"). Anyone else gets NoEncontrado. */
export const miDiagnostico = (id: DiagnosticoId) =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient
    const [d] = yield* Schema.decodeUnknownEffect(Schema.Array(DiagnosticoGuardado))(
      yield* sql`
        SELECT d.*, e.alias AS equipo,
               CASE WHEN dist.id IS NULL THEN NULL ELSE json_build_object('nombre', dist.nombre, 'version', dist.version) END AS distribucion
        FROM diagnostico d
        JOIN equipo e ON e.id = d.equipo_id
        LEFT JOIN distribucion dist ON dist.id = d.distribucion_id
        WHERE d.id = ${id} AND e.usuario_id = ${usuario.id}`,
    )
    if (d === undefined) return yield* Effect.fail(new NoEncontrado())
    return { id: d.id, equipo: d.equipo, captura: yield* capturaGuardada(d), matriz: yield* matriz(d) }
  })

const EquipoFila = Schema.Struct({ id: Equipo.fields.id, alias: Equipo.fields.alias })
const CapturaResumida = Schema.Struct({
  id: Diagnostico.fields.id,
  equipo_id: Diagnostico.fields.equipo_id,
  capturado_en: Diagnostico.fields.capturado_en,
  sistema: Diagnostico.fields.sistema,
  gpu_modelo: Diagnostico.fields.gpu_modelo,
  ram_mb: Diagnostico.fields.ram_mb,
  distribucion: Schema.NullOr(Schema.String), // "Ubuntu 24.04"; null for Windows
})

/**
 * The visitor's equipos, oldest first, each with its captures newest first (8.11 "varios diagnósticos
 * históricos"). A guest has none.
 */
export const misEquipos = () =>
  Effect.gen(function* () {
    const visitante = yield* Visitante
    if (Option.isNone(visitante)) return []
    const sql = yield* SqlClient.SqlClient
    const equipos = yield* Schema.decodeUnknownEffect(Schema.Array(EquipoFila))(
      yield* sql`SELECT id, alias FROM equipo WHERE usuario_id = ${visitante.value.id} ORDER BY creado_en, id`,
    )
    const capturas = yield* Schema.decodeUnknownEffect(Schema.Array(CapturaResumida))(
      yield* sql`
        SELECT d.id, d.equipo_id, d.capturado_en, d.sistema, d.gpu_modelo, d.ram_mb, dist.nombre || ' ' || dist.version AS distribucion
        FROM diagnostico d
        JOIN equipo e ON e.id = d.equipo_id
        LEFT JOIN distribucion dist ON dist.id = d.distribucion_id
        WHERE e.usuario_id = ${visitante.value.id}
        ORDER BY d.capturado_en DESC, d.id DESC`,
    )
    return equipos.map((e) => ({ ...e, diagnosticos: capturas.filter((c) => c.equipo_id === e.id) }))
  })
