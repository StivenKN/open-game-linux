// The whole section 8 schema as Effect migrations (PgMigrator + Migrator.fromRecord, spike Q5).
// Run by scripts/migrar.ts and by the test global setup. One SQL statement per sql.unsafe call
// (extended protocol rejects multi-statement strings, gotcha 7), so each area is a string array.
//
// Every 8.9 / 8.7 / 8.11 rule has exactly one home. This table is the index; MODULES.md repeats it.
//
// | rule                                                        | home                                      |
// |-------------------------------------------------------------|-------------------------------------------|
// | PK, FK, UQ, composite keys, no duplicate dependencia / fallo | DB keys                                   |
// | enumerated domains, magnitudes, ranges                       | DB CHECK (enum lists derived from Schema) |
// | blank required strings                                       | DB CHECK *_no_vacio (+ Texto on input)    |
// | review block shape per state, approval needs evidence        | DB CHECK *_bloque_revision                |
// | revisado_en >= creado_en                                     | DB CHECK *_revision_posterior             |
// | author != reviewer where autor_id is on the row              | DB CHECK *_sin_autoaprobacion             |
// | fps => resolucion, calidad, metodo                           | DB CHECK reporte_fps_con_contexto         |
// | Linux capture <=> distribucion_id; vulkan version only if si | DB CHECK                                  |
// | capture immutable; equipo owner fixed                        | DB trigger og_inmutable                   |
// | reviewed content never rewritten                             | DB trigger og_solo_revision               |
// | profile steps/deps frozen once reviewed or used              | DB trigger og_perfil_congelado            |
// | solucion -> reporte_fallo                                    | DB composite FK                           |
// | report comparability (edition, layer, distro, arch, version) | app: dominio/aportes.ts discrepancias     |
// |   (edition + layer also a composite FK backstop, same Regla) |                                           |
// | own equipo; Linux diagnosis; fecha_prueba >= capturado_en    | app: servidor/aportes/aportes.ts          |
// | solution's profile in the report's edition                   | app: servidor/aportes/aportes.ts          |
// | failing result has >= 1 fallo                                | app: dominio/aportes.ts NuevoReporte      |
// | reviewer role + activo                                       | app: servidor/auth.ts exigirRevisor       |
// | author != reviewer (reporte, author derived), transitions,   | app: servidor/aportes/revision.ts         |
// |   approval preconditions                                     |                                           |
// | only reviewers publish guides                                | no write path this delivery (seeded)      |
// | public view hides retired rows                               | app: servidor/consultas (WHERE aprobado)  |
import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'
import { Resultado } from '../../dominio/compatibilidad.ts'
import { FamiliaCapa } from '../../dominio/aportes.ts'
import { Sistema, SoporteVulkan } from '../../dominio/evaluacion.ts'
import { EstadoRevision, Rol } from '../../dominio/revision.ts'
import { EstadoGuia, TipoGuia } from '../../dominio/guias.ts'

const ejecutar = (sentencias: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    for (const s of sentencias) yield* sql.unsafe(s)
  })

// ------------------------------------------------------------------ helpers (one rule, written once)

/** CHECK (col IN (...)) from a Schema literal list: the domain list IS the DB list. */
const dominio = (t: string, c: string, valores: ReadonlyArray<string>) =>
  `ALTER TABLE ${t} ADD CONSTRAINT ${t}_${c}_dominio CHECK (${c} IN (${valores.map((v) => `'${v}'`).join(', ')}))`

/** Required or optional strings reject blank text after trimming. nullif form: a NULL CHECK result passes. */
const noVacio = (t: string, ...columnas: ReadonlyArray<string>) =>
  columnas.map((c) => `ALTER TABLE ${t} ADD CONSTRAINT ${t}_${c}_no_vacio CHECK (${c} IS NULL OR nullif(btrim(${c}), '') IS NOT NULL)`)

const check = (t: string, nombre: string, expr: string) => `ALTER TABLE ${t} ADD CONSTRAINT ${t}_${nombre} CHECK (${expr})`

/** The five 8.9 columns, identical on perfil_configuracion, reporte, solucion. */
const bloqueRevision = `
  estado_revision text NOT NULL DEFAULT 'pendiente',
  revisor_id text REFERENCES usuario(id) ON DELETE RESTRICT,
  revisado_en timestamptz,
  motivo_revision text,
  evidencia_revision text`

/**
 * Per-state shape, date order, no self-review where autor_id exists, content immutability.
 * Uses nullif(btrim(x),'') IS NOT NULL, never btrim(x) <> '': round 1's PG run caught
 * btrim(NULL) <> '' evaluating to NULL and letting an approval without evidence through.
 */
const reglasRevision = (t: string, conAutor: boolean) => [
  dominio(t, 'estado_revision', EstadoRevision.literals),
  `ALTER TABLE ${t} ADD CONSTRAINT ${t}_bloque_revision CHECK (
     (estado_revision = 'pendiente'
        AND revisor_id IS NULL AND revisado_en IS NULL AND motivo_revision IS NULL AND evidencia_revision IS NULL)
     OR (estado_revision IN ('rechazado', 'retirado')
        AND revisor_id IS NOT NULL AND revisado_en IS NOT NULL AND nullif(btrim(motivo_revision), '') IS NOT NULL)
     OR (estado_revision = 'aprobado'
        AND revisor_id IS NOT NULL AND revisado_en IS NOT NULL AND nullif(btrim(motivo_revision), '') IS NOT NULL
        AND nullif(btrim(evidencia_revision), '') IS NOT NULL))`,
  check(t, 'revision_posterior', 'revisado_en IS NULL OR revisado_en >= creado_en'),
  ...(conAutor ? [check(t, 'sin_autoaprobacion', 'revisor_id IS NULL OR revisor_id <> autor_id')] : []),
  `CREATE TRIGGER ${t}_solo_revision BEFORE UPDATE ON ${t} FOR EACH ROW EXECUTE FUNCTION og_solo_revision()`,
]

const id = 'id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY'

// ------------------------------------------------------------------ areas

const funciones = [
  `CREATE FUNCTION og_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     RAISE EXCEPTION '%: registro inmutable (id %)', TG_TABLE_NAME, OLD.id
       USING ERRCODE = 'check_violation', CONSTRAINT = 'og_inmutable';
   END $$`,
  `CREATE FUNCTION og_solo_revision() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE revision text[] := ARRAY['estado_revision','revisor_id','revisado_en','motivo_revision','evidencia_revision'];
   BEGIN
     IF (to_jsonb(NEW) - revision) IS DISTINCT FROM (to_jsonb(OLD) - revision) THEN
       RAISE EXCEPTION '%: el contenido no se reescribe; registre un aporte nuevo (id %)', TG_TABLE_NAME, OLD.id
         USING ERRCODE = 'check_violation', CONSTRAINT = 'og_solo_revision';
     END IF;
     RETURN NEW;
   END $$`,
  // 8.9: a profile stops accepting content changes once reviewed or used by a report.
  `CREATE FUNCTION og_perfil_congelado() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE pid integer := COALESCE(NEW.perfil_id, OLD.perfil_id);
   BEGIN
     IF EXISTS (SELECT 1 FROM perfil_configuracion p WHERE p.id = pid AND p.estado_revision <> 'pendiente')
        OR EXISTS (SELECT 1 FROM reporte r WHERE r.perfil_id = pid) THEN
       RAISE EXCEPTION 'perfil %: revisión congelada; cree una revisión nueva', pid
         USING ERRCODE = 'check_violation', CONSTRAINT = 'og_perfil_congelado';
     END IF;
     RETURN COALESCE(NEW, OLD);
   END $$`,
]

/**
 * usuario/session/account/verification are created by 0001_auth, which is better-auth's own
 * compileMigrations() output pasted verbatim in U1 (config in servidor/auth.ts maps
 * name->alias, email->correo, createdAt->creado_en, additionalFields rol + activo).
 * tests/esquema.test.ts asserts getMigrations(auth.options) has nothing left to create, so the
 * pasted SQL and the auth config cannot drift. Here we only add the doc's rules on top.
 * Doc deviation, recorded with COMMENT ON: id is text, and contrasena_hash lives in account.password.
 */
const usuario = [
  dominio('usuario', 'rol', Rol.literals),
  check('usuario', 'correo_normalizado', 'correo = lower(btrim(correo))'),
  check('usuario', 'alias_largo', 'char_length(alias) <= 60'),
  ...noVacio('usuario', 'alias'),
  `COMMENT ON TABLE usuario IS 'Doc 8.3 usuario. Tabla de better-auth; contrasena_hash vive en account.password (providerId = credential)'`,
]

const catalogo = [
  `CREATE TABLE juego (${id}, titulo varchar(180) NOT NULL, descripcion text NOT NULL, actualizado_en timestamptz NOT NULL DEFAULT now())`,
  ...noVacio('juego', 'titulo', 'descripcion'),
  `CREATE TABLE lanzador (${id}, nombre varchar(80) NOT NULL UNIQUE, url_oficial varchar(500))`,
  ...noVacio('lanzador', 'nombre', 'url_oficial'),
  `CREATE TABLE edicion_juego (${id},
     juego_id integer NOT NULL REFERENCES juego(id) ON DELETE RESTRICT,
     lanzador_id integer NOT NULL REFERENCES lanzador(id) ON DELETE RESTRICT,
     identificador_externo varchar(120),
     actualizado_en timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT edicion_juego_juego_lanzador_uq UNIQUE (juego_id, lanzador_id),
     CONSTRAINT edicion_juego_externo_uq UNIQUE (lanzador_id, identificador_externo))`, // NULLs distinct: "cuando exista"
  ...noVacio('edicion_juego', 'identificador_externo'),
  `CREATE TABLE distribucion (${id}, nombre varchar(80) NOT NULL, version varchar(40) NOT NULL, url_oficial varchar(500),
     CONSTRAINT distribucion_nombre_version_uq UNIQUE (nombre, version))`,
  ...noVacio('distribucion', 'nombre', 'version', 'url_oficial'),
  `CREATE TABLE version_capa (${id}, familia varchar(10) NOT NULL, variante varchar(60) NOT NULL, version varchar(60) NOT NULL,
     CONSTRAINT version_capa_uq UNIQUE (familia, variante, version))`,
  dominio('version_capa', 'familia', FamiliaCapa.literals),
  ...noVacio('version_capa', 'variante', 'version'),
  check('version_capa', 'version_exacta', "lower(version) NOT IN ('latest', 'ultima', 'última')"),
]

const diagnosticos = [
  `CREATE TABLE equipo (${id},
     usuario_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     alias varchar(80) NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX equipo_usuario_idx ON equipo (usuario_id)`,
  ...noVacio('equipo', 'alias'),
  `CREATE TRIGGER equipo_propietario_fijo BEFORE UPDATE OF usuario_id ON equipo FOR EACH ROW
     WHEN (OLD.usuario_id IS DISTINCT FROM NEW.usuario_id) EXECUTE FUNCTION og_inmutable()`,
  `CREATE TABLE diagnostico (${id},
     equipo_id integer NOT NULL REFERENCES equipo(id) ON DELETE RESTRICT,
     capturado_en timestamptz NOT NULL,
     sistema varchar(20) NOT NULL,
     version_sistema varchar(80) NOT NULL,
     distribucion_id integer REFERENCES distribucion(id) ON DELETE RESTRICT,
     arquitectura varchar(20) NOT NULL,
     cpu_modelo varchar(160) NOT NULL,
     gpu_modelo varchar(160) NOT NULL,
     ram_mb integer NOT NULL,
     vram_mb integer,
     controlador varchar(120),
     version_controlador varchar(80),
     soporte_vulkan varchar(15) NOT NULL,
     version_vulkan varchar(30),
     CONSTRAINT diagnostico_captura_uq UNIQUE (equipo_id, capturado_en))`, // round 1 graft: double submit converges; also serves 8.11's index
  dominio('diagnostico', 'sistema', Sistema.literals),
  dominio('diagnostico', 'soporte_vulkan', SoporteVulkan.literals),
  ...noVacio('diagnostico', 'version_sistema', 'arquitectura', 'cpu_modelo', 'gpu_modelo', 'controlador', 'version_controlador', 'version_vulkan'),
  check('diagnostico', 'ram_positiva', 'ram_mb > 0'),
  check('diagnostico', 'vram_no_negativa', 'vram_mb IS NULL OR vram_mb >= 0'),
  check('diagnostico', 'linux_con_distribucion', "(sistema = 'Linux') = (distribucion_id IS NOT NULL)"),
  check('diagnostico', 'version_vulkan_solo_con_soporte', "soporte_vulkan = 'si' OR version_vulkan IS NULL"),
  `CREATE TRIGGER diagnostico_inmutable BEFORE UPDATE ON diagnostico FOR EACH ROW EXECUTE FUNCTION og_inmutable()`,
]

const configuraciones = [
  `CREATE TABLE perfil_configuracion (${id},
     edicion_id integer NOT NULL REFERENCES edicion_juego(id) ON DELETE RESTRICT,
     distribucion_id integer NOT NULL REFERENCES distribucion(id) ON DELETE RESTRICT,
     version_capa_id integer NOT NULL REFERENCES version_capa(id) ON DELETE RESTRICT,
     autor_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     arquitectura varchar(20) NOT NULL,
     revision integer NOT NULL,
     titulo varchar(180) NOT NULL,
     version_juego_objetivo varchar(80),
     ram_min_mb integer,
     vram_min_mb integer,
     requiere_vulkan boolean,
     version_vulkan_min varchar(30),
     condicion_cpu text,
     condicion_gpu text,
     parametros_lanzamiento text,
     creado_en timestamptz NOT NULL DEFAULT now(),
     ${bloqueRevision},
     CONSTRAINT perfil_configuracion_revision_uq UNIQUE (edicion_id, distribucion_id, version_capa_id, arquitectura, revision),
     CONSTRAINT perfil_configuracion_ref_reporte_uq UNIQUE (id, edicion_id, version_capa_id))`, // target of reporte_perfil_fk
  `CREATE INDEX perfil_configuracion_busqueda_idx ON perfil_configuracion (edicion_id, distribucion_id, estado_revision)`,
  ...reglasRevision('perfil_configuracion', true),
  ...noVacio('perfil_configuracion', 'arquitectura', 'titulo', 'version_juego_objetivo', 'version_vulkan_min', 'condicion_cpu', 'condicion_gpu', 'parametros_lanzamiento'),
  check('perfil_configuracion', 'revision_positiva', 'revision > 0'),
  check('perfil_configuracion', 'ram_min_positiva', 'ram_min_mb IS NULL OR ram_min_mb > 0'),
  check('perfil_configuracion', 'vram_min_no_negativa', 'vram_min_mb IS NULL OR vram_min_mb >= 0'),
  check('perfil_configuracion', 'vulkan_min_requiere_vulkan', 'version_vulkan_min IS NULL OR requiere_vulkan IS TRUE'),
  `CREATE TABLE paso_configuracion (
     perfil_id integer NOT NULL REFERENCES perfil_configuracion(id) ON DELETE CASCADE,
     orden integer NOT NULL,
     titulo varchar(160) NOT NULL,
     instruccion text NOT NULL,
     PRIMARY KEY (perfil_id, orden))`,
  check('paso_configuracion', 'orden_positivo', 'orden > 0'),
  ...noVacio('paso_configuracion', 'titulo', 'instruccion'),
  `CREATE TABLE dependencia (${id}, nombre varchar(120) NOT NULL, gestor varchar(60) NOT NULL, descripcion text NOT NULL,
     CONSTRAINT dependencia_nombre_gestor_uq UNIQUE (nombre, gestor))`,
  ...noVacio('dependencia', 'nombre', 'gestor', 'descripcion'),
  `CREATE TABLE perfil_dependencia (
     perfil_id integer NOT NULL REFERENCES perfil_configuracion(id) ON DELETE CASCADE,
     dependencia_id integer NOT NULL REFERENCES dependencia(id) ON DELETE RESTRICT,
     version_requerida varchar(80),
     obligatoria boolean NOT NULL,
     instruccion_instalacion text NOT NULL,
     PRIMARY KEY (perfil_id, dependencia_id))`,
  `CREATE INDEX perfil_dependencia_dependencia_idx ON perfil_dependencia (dependencia_id)`, // 8.11: both directions
  ...noVacio('perfil_dependencia', 'version_requerida', 'instruccion_instalacion'),
  ...['paso_configuracion', 'perfil_dependencia'].map(
    (h) => `CREATE TRIGGER ${h}_congelado BEFORE INSERT OR UPDATE OR DELETE ON ${h} FOR EACH ROW EXECUTE FUNCTION og_perfil_congelado()`,
  ),
]

const resultados = [
  `CREATE TABLE tipo_fallo (${id}, codigo varchar(40) NOT NULL UNIQUE, descripcion text NOT NULL)`, // codes are seeded data
  check('tipo_fallo', 'codigo_formato', "codigo ~ '^[a-z][a-z0-9_]*$'"),
  ...noVacio('tipo_fallo', 'descripcion'),
  `CREATE TABLE reporte (${id},
     edicion_id integer NOT NULL REFERENCES edicion_juego(id) ON DELETE RESTRICT,
     diagnostico_id integer NOT NULL REFERENCES diagnostico(id) ON DELETE RESTRICT,
     version_capa_id integer NOT NULL REFERENCES version_capa(id) ON DELETE RESTRICT,
     perfil_id integer,
     version_juego varchar(80) NOT NULL,
     version_lanzador varchar(80),
     fecha_prueba timestamptz NOT NULL,
     resultado varchar(35) NOT NULL,
     fps_promedio numeric(7,2),
     resolucion varchar(30),
     calidad_grafica varchar(80),
     metodo_medicion text,
     observaciones text NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now(),
     ${bloqueRevision},
     -- MATCH SIMPLE skips the check when perfil_id IS NULL: tests without a profile stay legal.
     CONSTRAINT reporte_perfil_fk FOREIGN KEY (perfil_id, edicion_id, version_capa_id)
       REFERENCES perfil_configuracion (id, edicion_id, version_capa_id) ON DELETE RESTRICT)`,
  `CREATE INDEX reporte_perfil_idx ON reporte (perfil_id)`,
  `CREATE INDEX reporte_diagnostico_idx ON reporte (diagnostico_id)`,
  `CREATE INDEX reporte_edicion_estado_fecha_idx ON reporte (edicion_id, estado_revision, fecha_prueba)`,
  `CREATE INDEX reporte_aprobados_por_edicion ON reporte (edicion_id, fecha_prueba DESC) WHERE estado_revision = 'aprobado'`,
  ...reglasRevision('reporte', false), // author is derived (diagnostico -> equipo -> usuario): checked in revision.ts
  dominio('reporte', 'resultado', Resultado.literals),
  ...noVacio('reporte', 'version_juego', 'version_lanzador', 'resolucion', 'calidad_grafica', 'metodo_medicion', 'observaciones'),
  check('reporte', 'fps_no_negativo', 'fps_promedio IS NULL OR fps_promedio >= 0'),
  check('reporte', 'fps_con_contexto', 'fps_promedio IS NULL OR (resolucion IS NOT NULL AND calidad_grafica IS NOT NULL AND metodo_medicion IS NOT NULL)'),
  `CREATE TABLE reporte_fallo (
     reporte_id integer NOT NULL REFERENCES reporte(id) ON DELETE RESTRICT,
     tipo_fallo_id integer NOT NULL REFERENCES tipo_fallo(id) ON DELETE RESTRICT,
     detalle text NOT NULL,
     CONSTRAINT reporte_fallo_pkey PRIMARY KEY (reporte_id, tipo_fallo_id))`,
  `CREATE INDEX reporte_fallo_tipo_idx ON reporte_fallo (tipo_fallo_id)`,
  ...noVacio('reporte_fallo', 'detalle'),
  `CREATE TABLE solucion (${id},
     reporte_id integer NOT NULL,
     tipo_fallo_id integer NOT NULL,
     autor_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     perfil_id integer REFERENCES perfil_configuracion(id) ON DELETE RESTRICT,
     titulo varchar(180) NOT NULL,
     instrucciones text NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now(),
     ${bloqueRevision},
     CONSTRAINT solucion_fallo_fk FOREIGN KEY (reporte_id, tipo_fallo_id)
       REFERENCES reporte_fallo (reporte_id, tipo_fallo_id) ON DELETE RESTRICT)`,
  `CREATE INDEX solucion_fallo_idx ON solucion (reporte_id, tipo_fallo_id)`,
  `CREATE INDEX solucion_tipo_idx ON solucion (tipo_fallo_id)`,
  ...reglasRevision('solucion', true),
  ...noVacio('solucion', 'titulo', 'instrucciones'),
]

const guias = [
  `CREATE TABLE guia_adopcion (${id},
     autor_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     distribucion_id integer REFERENCES distribucion(id) ON DELETE RESTRICT,
     tipo varchar(25) NOT NULL,
     titulo varchar(180) NOT NULL,
     contenido text NOT NULL,
     revision integer NOT NULL,
     estado varchar(15) NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now(),
     actualizado_en timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX guia_adopcion_tipo_estado_idx ON guia_adopcion (tipo, estado)`,
  dominio('guia_adopcion', 'tipo', TipoGuia.literals),
  dominio('guia_adopcion', 'estado', EstadoGuia.literals),
  ...noVacio('guia_adopcion', 'titulo', 'contenido'),
  check('guia_adopcion', 'revision_positiva', 'revision > 0'),
  check('guia_adopcion', 'fechas_ordenadas', 'actualizado_en >= creado_en'),
]

/** better-auth's compileMigrations() output, pasted in U1. Kept as a placeholder here. */
const auth: ReadonlyArray<string> = [
  /* U1: paste CREATE TABLE usuario / session / account / verification from scripts/auth-sql.ts */
]

/**
 * Migrator.fromRecord keys are `<id>_<name>`. A shipped migration is never edited; a new rule is a
 * new key. Tradeoff accepted: `dominio(...)` reads today's literal list when an old migration runs
 * on a fresh DB, so adding a literal later means a new migration that drops and re-adds that CHECK.
 */
export const migraciones = {
  '1_auth': ejecutar(auth),
  '2_opengame': ejecutar([...funciones, ...usuario, ...catalogo, ...diagnosticos, ...configuraciones, ...resultados, ...guias]),
}
