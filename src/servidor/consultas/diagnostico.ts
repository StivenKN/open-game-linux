import { Effect, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import type { Captura, EntradaDiagnostico } from '../../dominio/aportes.ts'
import { estadoDe } from '../../dominio/compatibilidad.ts'
import { capacidades, condiciones, evaluar, sugerirPerfil } from '../../dominio/evaluacion.ts'
import { NoEncontrado, type PayloadInvalido } from '../../dominio/fallos.ts'
import type { DiagnosticoId } from '../../dominio/ids.ts'
import { Resultado } from '../../dominio/literales.ts'
import { Diagnostico, Distribucion, Equipo, Juego, PerfilConfiguracion } from '../../dominio/tablas.ts'
import { exigirUsuario, Visitante } from '../auth.ts'
import { capturaDe } from '../diagnostico/payload.ts'
import { filas, type Infra } from '../filas.ts'
import { etiquetaCapa, etiquetaDistribucion } from './etiquetas.ts'

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
  capa: Schema.String,
  distribucion: Schema.String,
})

type EquipoEvaluado = Pick<Captura, 'sistema' | 'arquitectura' | 'ram_mb' | 'vram_mb' | 'soporte_vulkan' | 'version_vulkan'> & {
  readonly distribucion_id: typeof Distribucion.Type.id | null
}

const matriz = (equipo: EquipoEvaluado) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const juegos = yield* filas(JuegoFila, sql`SELECT id, titulo FROM juego ORDER BY titulo, id`)
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

export const evaluarSinGuardar = (
  entrada: EntradaDiagnostico,
): Effect.Effect<{ readonly captura: Captura; readonly matriz: ReadonlyArray<FilaMatriz> }, PayloadInvalido | Infra, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const captura = yield* capturaDe(entrada)
    const sql = yield* SqlClient.SqlClient
    const [distribucion] =
      captura.sistema === 'Linux'
        ? yield* filas(
            Schema.Struct({ id: Distribucion.fields.id }),
            sql`SELECT id FROM distribucion WHERE nombre = ${captura.distribucion.nombre} AND version = ${captura.distribucion.version}`,
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
    gpu_pci_id: d.gpu_pci_id,
  }
  if (d.sistema === 'Windows') return Effect.succeed({ ...comunes, sistema: 'Windows' })
  if (d.distribucion === null) return Effect.die(`diagnostico ${d.id}: Linux sin distribucion`)
  return Effect.succeed({ ...comunes, sistema: 'Linux', distribucion: d.distribucion })
}

export const miDiagnostico = (id: DiagnosticoId) =>
  Effect.gen(function* () {
    const usuario = yield* exigirUsuario
    const sql = yield* SqlClient.SqlClient
    const [d] = yield* filas(
      DiagnosticoGuardado,
      sql`
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
