// The single writer of user contributions: diagnostico (+ equipo, distribucion upsert), reporte
// (+ reporte_fallo, version_capa upsert), solucion, and reviewer-created juego. Every app-side
// 8.7/8.9 write rule the DB cannot express lives here or in revision.ts, nowhere else.
//
// Each program runs inside the one transaction servidor/ejecutar.ts `accion` opens, so a rule
// failure after a partial insert rolls back. Failures are ReglaIncumplida (data for the form).
import { Effect, Option, Schema } from 'effect'
import { SqlClient, SqlError, SqlSchema } from 'effect/sql'
import { discrepancias, type Captura, type EntradaDiagnostico, type NuevaSolucion, type NuevoReporte } from '../../dominio/aportes.ts'
import { NoAutenticado, PayloadInvalido, ReglaIncumplida, SinPermiso } from '../../dominio/fallos.ts'
import { DiagnosticoId, DistribucionId, EdicionId, JuegoId, PerfilId, ReporteId, SolucionId, UsuarioId, VersionCapaId } from '../../dominio/ids.ts'
import { exigirRevisor, exigirUsuario, Visitante } from '../auth.ts'
import { parsearPayload } from '../diagnostico/payload.ts'
import { conReglasDeBd } from '../esquema/restricciones.ts'

type Infra = SqlError.SqlError | Schema.SchemaError
type Escritura<A, E> = Effect.Effect<A, E | NoAutenticado | Infra, SqlClient.SqlClient | Visitante>

const falla = (regla: ReglaIncumplida['regla']) => Effect.fail(new ReglaIncumplida({ regla }))

/** The report's diagnostico with what 8.7/8.9 need: owner, system, distro, arch, capture time. */
const DiagnosticoDeReporte = Schema.Struct({
  usuario_id: UsuarioId,
  sistema: Schema.Literals(['Linux', 'Windows']),
  distribucion_id: Schema.NullOr(DistribucionId),
  arquitectura: Schema.String,
  capturado_en: Schema.Date,
})

const PerfilDeReporte = Schema.Struct({
  edicion_id: EdicionId,
  version_capa_id: VersionCapaId,
  distribucion_id: DistribucionId,
  arquitectura: Schema.String,
  version_juego_objetivo: Schema.NullOr(Schema.String),
})

/**
 * RF-08. Rules, in order (the first failure is returned):
 *   diagnostico exists and belongs to the viewer           -> equipo_ajeno (also when missing: no existence leak)
 *   diagnostico is Linux                                   -> diagnostico_no_linux
 *   fecha_prueba >= capturado_en                           -> fecha_antes_del_diagnostico
 *   version_capa resolved (upsert for `nueva`)             -> version_capa_no_exacta (DB CHECK, mapped)
 *   with perfil_id: discrepancias(...) empty               -> perfil_otra_*
 *   insert reporte (estado_revision defaults pendiente) + reporte_fallo rows -> fallo_duplicado (DB PK, mapped)
 * The failing-result rule already held when `n` decoded (NuevoReporte's filter).
 */
export const registrarReporte = (n: NuevoReporte): Escritura<{ readonly id: ReporteId }, ReglaIncumplida> =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient

    const diag = yield* SqlSchema.findOneOption({
      Request: DiagnosticoId,
      Result: DiagnosticoDeReporte,
      execute: (id) => sql`
        SELECT e.usuario_id, d.sistema, d.distribucion_id, d.arquitectura, d.capturado_en
        FROM diagnostico d JOIN equipo e ON e.id = d.equipo_id WHERE d.id = ${id}`,
    })(n.diagnostico_id)
    if (Option.isNone(diag) || diag.value.usuario_id !== usuario.id) return yield* falla('equipo_ajeno')
    const d = diag.value
    if (d.sistema !== 'Linux' || d.distribucion_id === null) return yield* falla('diagnostico_no_linux')
    if (n.fecha_prueba < d.capturado_en) return yield* falla('fecha_antes_del_diagnostico')

    const version_capa_id = yield* resolverVersionCapa(n.version_capa)

    if (n.perfil_id !== null) {
      const perfil = yield* SqlSchema.findOneOption({
        Request: PerfilId,
        Result: PerfilDeReporte,
        execute: (id) => sql`
          SELECT edicion_id, version_capa_id, distribucion_id, arquitectura, version_juego_objetivo
          FROM perfil_configuracion WHERE id = ${id} AND estado_revision IN ('pendiente', 'aprobado')`,
      })(n.perfil_id)
      if (Option.isNone(perfil)) return yield* falla('perfil_otra_edicion')
      const [primera] = discrepancias(
        { edicion_id: n.edicion_id, version_capa_id, distribucion_id: d.distribucion_id, arquitectura: d.arquitectura, version_juego: n.version_juego },
        perfil.value,
      )
      if (primera !== undefined) return yield* falla(primera)
    }

    // TODO(U5): INSERT reporte (... fps columns from n.medicion ...) RETURNING id; INSERT each n.fallos row.
    return yield* conReglasDeBd(insertarReporte(n, version_capa_id))
  })

const resolverVersionCapa = (ref: NuevoReporte['version_capa']): Effect.Effect<VersionCapaId, ReglaIncumplida | Infra, SqlClient.SqlClient> => {
  // existente -> ref.id; nueva -> INSERT ... ON CONFLICT (familia, variante, version) DO UPDATE SET familia = EXCLUDED.familia RETURNING id
  void ref
  return Effect.die('not implemented')
}

const insertarReporte = (n: NuevoReporte, version_capa_id: VersionCapaId): Effect.Effect<{ readonly id: ReporteId }, Infra, SqlClient.SqlClient> => {
  void n
  void version_capa_id
  return Effect.die('not implemented')
}

/**
 * RF-04. Parses the entry (detector text through the one parser, or the manual Captura), creates the
 * equipo for `nuevo`, upserts distribucion on (nombre, version), and inserts the immutable capture.
 * Idempotent: ON CONFLICT (equipo_id, capturado_en) DO NOTHING, then SELECT; a double submit or a
 * re-import of the same payload converges on one row. A new capture time is a new snapshot (8).
 */
export const registrarDiagnostico = (input: {
  readonly equipo: { readonly _tag: 'existente'; readonly id: number } | { readonly _tag: 'nuevo'; readonly alias: string }
  readonly entrada: EntradaDiagnostico
}): Escritura<{ readonly id: DiagnosticoId }, ReglaIncumplida | PayloadInvalido> => {
  void input
  // const usuario = yield* exigirUsuario
  // const captura = yield* capturaDe(input.entrada)
  // existente: SELECT ... WHERE id AND usuario_id = usuario.id, else falla('equipo_ajeno')
  return Effect.die('not implemented')
}

/** Shared by the guest evaluation (stores nothing) and registrarDiagnostico. */
export const capturaDe = (entrada: EntradaDiagnostico): Effect.Effect<Captura, PayloadInvalido> =>
  entrada._tag === 'manual' ? Effect.succeed(entrada.captura) : Effect.fromResult(parsearPayload(entrada.texto))

/**
 * RF-08 solution. Rules: the (reporte, tipo_fallo) pair exists (composite FK, DB home);
 * a recommended perfil belongs to the source report's edition -> solucion_perfil_otra_edicion.
 * The author may differ from the report's author (8.8).
 */
export const registrarSolucion = (s: NuevaSolucion): Escritura<{ readonly id: SolucionId }, ReglaIncumplida> => {
  void s
  return Effect.die('not implemented')
}

/** RF-03, reviewers only: juego + its editions in one transaction. */
export const crearJuego = (j: {
  readonly titulo: string
  readonly descripcion: string
  readonly ediciones: ReadonlyArray<{ readonly lanzador_id: number; readonly identificador_externo: string | null }>
}): Escritura<{ readonly id: JuegoId }, ReglaIncumplida | SinPermiso> =>
  Effect.gen(function* () {
    yield* exigirRevisor
    void j
    return yield* Effect.die('not implemented')
  })
