// Read model of the profile page, which replaces the 9.4 wizard: ordered manual steps, dependencies and
// known conditions. Nothing here is downloaded or executed (8.5); the page only shows text to copy.
import { Effect, Option, Schema, Struct } from 'effect'
import { SqlClient, SqlSchema } from 'effect/sql'
import { capacidades, condiciones, evaluar } from '../../dominio/evaluacion.ts'
import { NoEncontrado } from '../../dominio/fallos.ts'
import { PerfilId } from '../../dominio/ids.ts'
import { EstadoRevision, estadosVigentes } from '../../dominio/revision.ts'
import { Dependencia, Juego, PasoConfiguracion, PerfilConfiguracion, PerfilDependencia } from '../../dominio/tablas.ts'
import { esDemo, etiquetaCapa, etiquetaDistribucion } from './etiquetas.ts'
import { diagnosticoDelVisitante } from './ficha.ts'

const FilaPerfil = PerfilConfiguracion.mapFields(
  Struct.pick([
    'id',
    'titulo',
    'revision',
    'revisado_en',
    'arquitectura',
    'version_juego_objetivo',
    'ram_min_mb',
    'vram_min_mb',
    'requiere_vulkan',
    'version_vulkan_min',
    'condicion_cpu',
    'condicion_gpu',
    'parametros_lanzamiento',
  ]),
).mapFields(
  Struct.assign({
    estado_revision: EstadoRevision.pick(estadosVigentes),
    juego_id: Juego.fields.id,
    juego: Juego.fields.titulo,
    lanzador: Schema.String,
    distribucion: Schema.String,
    capa: Schema.String,
    autor: Schema.String,
    ejemplo: Schema.Boolean,
  }),
)

const FilaPaso = PasoConfiguracion.mapFields(Struct.pick(['orden', 'titulo', 'instruccion']))

const FilaDependencia = PerfilDependencia.mapFields(Struct.pick(['version_requerida', 'obligatoria', 'instruccion_instalacion'])).mapFields(
  Struct.assign(Struct.pick(Dependencia.fields, ['nombre', 'gestor', 'descripcion'])),
)

/**
 * Approved profiles, and pending ones marked "en prueba" (8.9 lets users test them to produce the
 * evidence their approval needs). Rejected and retired profiles are not public: NoEncontrado.
 * `evaluacion` compares the viewer's latest diagnosis with an approved profile only (8.10), or says why it cannot.
 */
export const perfil = (id: PerfilId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const fila = yield* SqlSchema.findOneOption({
      Request: PerfilId,
      Result: FilaPerfil,
      execute: (id) => sql`
        SELECT p.id, p.titulo, p.revision, p.revisado_en, p.arquitectura, p.version_juego_objetivo, p.ram_min_mb, p.vram_min_mb,
               p.requiere_vulkan, p.version_vulkan_min, p.condicion_cpu, p.condicion_gpu, p.parametros_lanzamiento, p.estado_revision,
               j.id AS juego_id, j.titulo AS juego, l.nombre AS lanzador,
               ${sql.literal(etiquetaDistribucion('dist'))} AS distribucion, ${sql.literal(etiquetaCapa('vc'))} AS capa,
               u.alias AS autor, ${sql.literal(esDemo('u'))} AS ejemplo
        FROM perfil_configuracion p
        JOIN edicion_juego e ON e.id = p.edicion_id
        JOIN juego j ON j.id = e.juego_id
        JOIN lanzador l ON l.id = e.lanzador_id
        JOIN distribucion dist ON dist.id = p.distribucion_id
        JOIN version_capa vc ON vc.id = p.version_capa_id
        JOIN usuario u ON u.id = p.autor_id
        WHERE p.id = ${id} AND p.estado_revision IN ${sql.in(estadosVigentes)}`,
    })(id)
    if (Option.isNone(fila)) return yield* new NoEncontrado()
    const p = fila.value

    const pasos = yield* SqlSchema.findAll({
      Request: PerfilId,
      Result: FilaPaso,
      execute: (id) => sql`SELECT orden, titulo, instruccion FROM paso_configuracion WHERE perfil_id = ${id} ORDER BY orden`,
    })(id)

    const dependencias = yield* SqlSchema.findAll({
      Request: PerfilId,
      Result: FilaDependencia,
      execute: (id) => sql`
        SELECT pd.version_requerida, pd.obligatoria, pd.instruccion_instalacion, d.nombre, d.gestor, d.descripcion
        FROM perfil_dependencia pd JOIN dependencia d ON d.id = pd.dependencia_id
        WHERE pd.perfil_id = ${id}
        ORDER BY pd.obligatoria DESC, d.nombre`,
    })(id)

    // The reason there is no evaluation is part of the answer, so it is a value, not a null.
    const evaluacion =
      p.estado_revision === 'pendiente'
        ? ('perfil_en_prueba' as const)
        : Option.match(yield* diagnosticoDelVisitante, {
            onNone: () => 'sin_diagnostico' as const,
            onSome: (d) => evaluar(capacidades(d), condiciones(p)),
          })

    return { perfil: p, pasos, dependencias, evaluacion }
  })
