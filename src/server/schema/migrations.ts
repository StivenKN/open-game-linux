// One SQL statement per sql.unsafe call
// (the extended protocol rejects multi-statement strings), so each area is a string array.
import { Effect, Schema } from 'effect'
import { Migrator, SqlClient } from 'effect/sql'
import { PgMigrator } from '@effect/sql-pg'
import { OperatingSystem, VulkanSupport } from '../../domain/evaluation.ts'
import { GuideStatus, GuideType } from '../../domain/guides.ts'
import { GraphicsApi, LayerFamily, Outcome, ProtonVariant } from '../../domain/literals.ts'
import { SecureBoot, X86Level, Tpm } from '../../domain/platform.ts'
import { type ReviewStatus, Role } from '../../domain/review.ts'
import { maxLengths as L } from '../../domain/max-lengths.ts'
import { oneRow } from '../rows.ts'

const runStatements = (statements: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    for (const s of statements) yield* sql.unsafe(s)
  })

const domainCheck = (t: string, c: string, values: ReadonlyArray<string>) =>
  `ALTER TABLE ${t} ADD CONSTRAINT ${t}_${c}_dominio CHECK (${c} IN (${values.map((v) => `'${v}'`).join(', ')}))`

/** A NULL CHECK result passes, so `btrim(NULL) <> ''` would let NULL through; the nullif form does not. */
const hasText = (c: string) => `nullif(btrim(${c}), '') IS NOT NULL`

const notBlank = (t: string, ...columns: ReadonlyArray<string>) =>
  columns.map((c) => `ALTER TABLE ${t} ADD CONSTRAINT ${t}_${c}_no_vacio CHECK (${c} IS NULL OR ${hasText(c)})`)

const check = (t: string, name: string, expr: string) => `ALTER TABLE ${t} ADD CONSTRAINT ${t}_${name} CHECK (${expr})`

const initialStatus: ReviewStatus = 'pendiente'

const reviewColumns = `
  estado_revision varchar(${L.bloque_revision.review_status}) NOT NULL DEFAULT '${initialStatus}',
  revisor_id text REFERENCES usuario(id) ON DELETE RESTRICT,
  revisado_en timestamptz,
  motivo_revision text,
  evidencia_revision text`

const reviewed = `revisor_id IS NOT NULL AND revisado_en IS NOT NULL AND ${hasText('motivo_revision')}`

const shapeByStatus = {
  pendiente: 'revisor_id IS NULL AND revisado_en IS NULL AND motivo_revision IS NULL AND evidencia_revision IS NULL',
  aprobado: `${reviewed} AND ${hasText('evidencia_revision')}`,
  rechazado: reviewed,
  retirado: reviewed,
} satisfies Record<ReviewStatus, string>

const reviewRules = (t: string, freezeFunction: 'og_solo_revision' | 'og_perfil_contenido') => [
  check(t, 'bloque_revision', Object.entries(shapeByStatus).map(([status, shape]) => `(estado_revision = '${status}' AND ${shape})`).join(' OR ')),
  check(t, 'revision_posterior', 'revisado_en IS NULL OR revisado_en >= creado_en'),
  ...notBlank(t, 'evidencia_revision'),
  `CREATE TRIGGER ${t}_contenido_congelado BEFORE UPDATE ON ${t} FOR EACH ROW EXECUTE FUNCTION ${freezeFunction}()`,
]

const id = 'id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY'

const auth = [
  `create table "usuario" ("id" text not null primary key, "alias" text not null, "correo" text not null unique, "correo_verificado" boolean not null, "image" text, "creado_en" timestamptz default CURRENT_TIMESTAMP not null, "actualizado_en" timestamptz default CURRENT_TIMESTAMP not null, "rol" text not null, "activo" boolean not null)`,
  `create table "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "usuario" ("id") on delete cascade)`,
  `create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "usuario" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null)`,
  `create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null)`,
  `create index "session_userId_idx" on "session" ("userId")`,
  `create index "account_userId_idx" on "account" ("userId")`,
  `create index "verification_identifier_idx" on "verification" ("identifier")`,
  `COMMENT ON COLUMN usuario.id IS 'Desviación de 8.3 (Entero): id de texto generado por better-auth'`,
  `COMMENT ON TABLE usuario IS 'Doc 8.3 usuario. Tabla de better-auth. Desviación: contrasena_hash vive en account.password (providerId = credential)'`,
]

const functions = [
  `CREATE FUNCTION og_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     RAISE EXCEPTION '%: registro inmutable (id %)', TG_TABLE_NAME, OLD.id
       USING ERRCODE = 'check_violation', CONSTRAINT = 'og_inmutable';
   END $$`,
  `CREATE FUNCTION og_contenido(fila jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE
   AS $$ SELECT fila - ARRAY['estado_revision', 'revisor_id', 'revisado_en', 'motivo_revision', 'evidencia_revision'] $$`,
  `CREATE FUNCTION og_solo_revision() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF og_contenido(to_jsonb(NEW)) IS DISTINCT FROM og_contenido(to_jsonb(OLD)) THEN
       RAISE EXCEPTION '%: el contenido no se reescribe; registre un aporte nuevo (id %)', TG_TABLE_NAME, OLD.id
         USING ERRCODE = 'check_violation', CONSTRAINT = 'og_solo_revision';
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE FUNCTION og_perfil_fijo(pid integer) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
   BEGIN
     RETURN EXISTS (SELECT 1 FROM perfil_configuracion p WHERE p.id = pid AND p.estado_revision <> '${initialStatus}')
         OR EXISTS (SELECT 1 FROM reporte r WHERE r.perfil_id = pid);
   END $$`,
  `CREATE FUNCTION og_perfil_contenido() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF og_contenido(to_jsonb(NEW)) IS DISTINCT FROM og_contenido(to_jsonb(OLD)) AND og_perfil_fijo(OLD.id) THEN
       RAISE EXCEPTION 'perfil %: revisión congelada; cree una revisión nueva', OLD.id
         USING ERRCODE = 'check_violation', CONSTRAINT = 'og_perfil_congelado';
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE FUNCTION og_perfil_congelado() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF og_perfil_fijo(OLD.perfil_id) OR og_perfil_fijo(NEW.perfil_id) THEN
       RAISE EXCEPTION 'perfil %: revisión congelada; cree una revisión nueva', COALESCE(OLD.perfil_id, NEW.perfil_id)
         USING ERRCODE = 'check_violation', CONSTRAINT = 'og_perfil_congelado';
     END IF;
     RETURN COALESCE(NEW, OLD);
   END $$`,
  `CREATE FUNCTION og_propietario_fijo() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF EXISTS (SELECT 1 FROM diagnostico d WHERE d.equipo_id = OLD.id) THEN
       RAISE EXCEPTION 'equipo %: ya tiene diagnósticos; el propietario no cambia', OLD.id
         USING ERRCODE = 'check_violation', CONSTRAINT = 'og_propietario_fijo';
     END IF;
     RETURN NEW;
   END $$`,
]

const userTable = [
  domainCheck('usuario', 'rol', Role.literals),
  check('usuario', 'correo_normalizado', 'correo = lower(btrim(correo))'),
  check('usuario', 'alias_largo', `char_length(alias) <= ${L.app_user.alias}`),
  check('usuario', 'correo_largo', `char_length(correo) <= ${L.app_user.email}`),
  ...notBlank('usuario', 'alias', 'correo'),
]

const catalog = [
  `CREATE TABLE juego (${id}, titulo varchar(${L.game.title}) NOT NULL, descripcion text NOT NULL, actualizado_en timestamptz NOT NULL DEFAULT now())`,
  ...notBlank('juego', 'titulo', 'descripcion'),
  `CREATE TABLE lanzador (${id}, nombre varchar(${L.launcher.name}) NOT NULL UNIQUE, url_oficial varchar(${L.launcher.official_url}))`,
  ...notBlank('lanzador', 'nombre', 'url_oficial'),
  `CREATE TABLE edicion_juego (${id},
     juego_id integer NOT NULL REFERENCES juego(id) ON DELETE RESTRICT,
     lanzador_id integer NOT NULL REFERENCES lanzador(id) ON DELETE RESTRICT,
     identificador_externo varchar(${L.game_edition.external_id}),
     actualizado_en timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT edicion_juego_juego_lanzador_uq UNIQUE (juego_id, lanzador_id),
     CONSTRAINT edicion_juego_externo_uq UNIQUE (lanzador_id, identificador_externo))`, // NULLs distinct: "cuando exista"
  ...notBlank('edicion_juego', 'identificador_externo'),
  `CREATE TABLE distribucion (${id}, nombre varchar(${L.distribution.name}) NOT NULL, version varchar(${L.distribution.version}) NOT NULL,
     url_oficial varchar(${L.distribution.official_url}),
     CONSTRAINT distribucion_nombre_version_uq UNIQUE (nombre, version))`,
  ...notBlank('distribucion', 'nombre', 'version', 'url_oficial'),
  `CREATE TABLE version_capa (${id}, familia varchar(${L.layer_version.family}) NOT NULL,
     variante varchar(${L.layer_version.variant}) NOT NULL, version varchar(${L.layer_version.version}) NOT NULL,
     CONSTRAINT version_capa_uq UNIQUE (familia, variante, version))`,
  domainCheck('version_capa', 'familia', LayerFamily.literals),
  ...notBlank('version_capa', 'variante', 'version'),
  check('version_capa', 'version_exacta', "lower(btrim(version)) NOT IN ('latest', 'ultima', 'última')"),
]

const diagnostics = [
  `CREATE TABLE equipo (${id},
     usuario_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     alias varchar(${L.machine.alias}) NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX equipo_usuario_idx ON equipo (usuario_id)`,
  ...notBlank('equipo', 'alias'),
  `CREATE TRIGGER equipo_propietario_fijo BEFORE UPDATE OF usuario_id ON equipo FOR EACH ROW
     WHEN (OLD.usuario_id IS DISTINCT FROM NEW.usuario_id) EXECUTE FUNCTION og_propietario_fijo()`,
  `CREATE TABLE diagnostico (${id},
     equipo_id integer NOT NULL REFERENCES equipo(id) ON DELETE RESTRICT,
     capturado_en timestamptz NOT NULL,
     sistema varchar(${L.diagnostic.operating_system}) NOT NULL,
     version_sistema varchar(${L.diagnostic.os_version}) NOT NULL,
     distribucion_id integer REFERENCES distribucion(id) ON DELETE RESTRICT,
     arquitectura varchar(${L.diagnostic.architecture}) NOT NULL,
     cpu_modelo varchar(${L.diagnostic.cpu_model}) NOT NULL,
     gpu_modelo varchar(${L.diagnostic.gpu_model}) NOT NULL,
     ram_mb integer NOT NULL,
     vram_mb integer,
     controlador varchar(${L.diagnostic.driver}),
     version_controlador varchar(${L.diagnostic.driver_version}),
     soporte_vulkan varchar(${L.diagnostic.vulkan_support}) NOT NULL,
     version_vulkan varchar(${L.diagnostic.vulkan_version}),
     CONSTRAINT diagnostico_captura_uq UNIQUE (equipo_id, capturado_en))`,
  domainCheck('diagnostico', 'sistema', OperatingSystem.literals),
  domainCheck('diagnostico', 'soporte_vulkan', VulkanSupport.literals),
  ...notBlank('diagnostico', 'version_sistema', 'arquitectura', 'cpu_modelo', 'gpu_modelo', 'controlador', 'version_controlador', 'version_vulkan'),
  check('diagnostico', 'ram_positiva', 'ram_mb > 0'),
  check('diagnostico', 'vram_no_negativa', 'vram_mb IS NULL OR vram_mb >= 0'),
  check('diagnostico', 'linux_con_distribucion', "(sistema = 'Linux') = (distribucion_id IS NOT NULL)"),
  check('diagnostico', 'version_vulkan_solo_con_soporte', "soporte_vulkan = 'si' OR version_vulkan IS NULL"),
  `CREATE TRIGGER diagnostico_inmutable BEFORE UPDATE ON diagnostico FOR EACH ROW EXECUTE FUNCTION og_inmutable()`,
]

const profiles = [
  `CREATE TABLE perfil_configuracion (${id},
     edicion_id integer NOT NULL REFERENCES edicion_juego(id) ON DELETE RESTRICT,
     distribucion_id integer NOT NULL REFERENCES distribucion(id) ON DELETE RESTRICT,
     version_capa_id integer NOT NULL REFERENCES version_capa(id) ON DELETE RESTRICT,
     autor_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     arquitectura varchar(${L.profile.architecture}) NOT NULL,
     revision integer NOT NULL,
     titulo varchar(${L.profile.title}) NOT NULL,
     version_juego_objetivo varchar(${L.profile.target_game_version}),
     ram_min_mb integer,
     vram_min_mb integer,
     requiere_vulkan boolean,
     version_vulkan_min varchar(${L.profile.vulkan_version_min}),
     condicion_cpu text,
     condicion_gpu text,
     parametros_lanzamiento text,
     creado_en timestamptz NOT NULL DEFAULT now(),
     ${reviewColumns},
     CONSTRAINT perfil_configuracion_revision_uq UNIQUE (edicion_id, distribucion_id, version_capa_id, arquitectura, revision),
     CONSTRAINT perfil_configuracion_ref_reporte_uq UNIQUE (id, edicion_id, version_capa_id))`, // target of reporte_perfil_fk
  `CREATE INDEX perfil_configuracion_busqueda_idx ON perfil_configuracion (edicion_id, distribucion_id, estado_revision)`,
  ...reviewRules('perfil_configuracion', 'og_perfil_contenido'),
  ...notBlank('perfil_configuracion', 'arquitectura', 'titulo', 'version_juego_objetivo', 'version_vulkan_min', 'condicion_cpu', 'condicion_gpu', 'parametros_lanzamiento'),
  check('perfil_configuracion', 'revision_positiva', 'revision > 0'),
  check('perfil_configuracion', 'ram_min_positiva', 'ram_min_mb IS NULL OR ram_min_mb > 0'),
  check('perfil_configuracion', 'vram_min_no_negativa', 'vram_min_mb IS NULL OR vram_min_mb >= 0'),
  check('perfil_configuracion', 'vulkan_min_requiere_vulkan', 'version_vulkan_min IS NULL OR requiere_vulkan IS TRUE'),
  `CREATE TABLE paso_configuracion (
     perfil_id integer NOT NULL REFERENCES perfil_configuracion(id) ON DELETE CASCADE,
     orden integer NOT NULL,
     titulo varchar(${L.profile_step.title}) NOT NULL,
     instruccion text NOT NULL,
     PRIMARY KEY (perfil_id, orden))`,
  check('paso_configuracion', 'orden_positivo', 'orden > 0'),
  ...notBlank('paso_configuracion', 'titulo', 'instruccion'),
  `CREATE TABLE dependencia (${id}, nombre varchar(${L.dependency.name}) NOT NULL, gestor varchar(${L.dependency.package_manager}) NOT NULL,
     descripcion text NOT NULL,
     CONSTRAINT dependencia_nombre_gestor_uq UNIQUE (nombre, gestor))`,
  ...notBlank('dependencia', 'nombre', 'gestor', 'descripcion'),
  `CREATE TABLE perfil_dependencia (
     perfil_id integer NOT NULL REFERENCES perfil_configuracion(id) ON DELETE CASCADE,
     dependencia_id integer NOT NULL REFERENCES dependencia(id) ON DELETE RESTRICT,
     version_requerida varchar(${L.profile_dependency.required_version}),
     obligatoria boolean NOT NULL,
     instruccion_instalacion text NOT NULL,
     PRIMARY KEY (perfil_id, dependencia_id))`,
  `CREATE INDEX perfil_dependencia_dependencia_idx ON perfil_dependencia (dependencia_id)`,
  ...notBlank('perfil_dependencia', 'version_requerida', 'instruccion_instalacion'),
  ...['paso_configuracion', 'perfil_dependencia'].map(
    (h) => `CREATE TRIGGER ${h}_congelado BEFORE INSERT OR UPDATE OR DELETE ON ${h} FOR EACH ROW EXECUTE FUNCTION og_perfil_congelado()`,
  ),
]

const results = [
  `CREATE TABLE tipo_fallo (${id}, codigo varchar(${L.failure_type.code}) NOT NULL UNIQUE, descripcion text NOT NULL)`,
  check('tipo_fallo', 'codigo_formato', "codigo ~ '^[a-z][a-z0-9_]*$'"),
  ...notBlank('tipo_fallo', 'descripcion'),
  `CREATE TABLE reporte (${id},
     edicion_id integer NOT NULL REFERENCES edicion_juego(id) ON DELETE RESTRICT,
     diagnostico_id integer NOT NULL REFERENCES diagnostico(id) ON DELETE RESTRICT,
     version_capa_id integer NOT NULL REFERENCES version_capa(id) ON DELETE RESTRICT,
     perfil_id integer,
     version_juego varchar(${L.report.game_version}) NOT NULL,
     version_lanzador varchar(${L.report.launcher_version}),
     fecha_prueba timestamptz NOT NULL,
     resultado varchar(${L.report.outcome}) NOT NULL,
     fps_promedio numeric(7,2),
     resolucion varchar(${L.report.resolution}),
     calidad_grafica varchar(${L.report.graphics_quality}),
     metodo_medicion text,
     observaciones text NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now(),
     ${reviewColumns},
     -- MATCH SIMPLE skips the check when perfil_id IS NULL: tests without a profile stay legal.
     CONSTRAINT reporte_perfil_fk FOREIGN KEY (perfil_id, edicion_id, version_capa_id)
       REFERENCES perfil_configuracion (id, edicion_id, version_capa_id) ON DELETE RESTRICT)`,
  `CREATE INDEX reporte_perfil_idx ON reporte (perfil_id)`,
  `CREATE INDEX reporte_diagnostico_idx ON reporte (diagnostico_id)`,
  `CREATE INDEX reporte_edicion_estado_fecha_idx ON reporte (edicion_id, estado_revision, fecha_prueba)`,
  ...reviewRules('reporte', 'og_solo_revision'),
  domainCheck('reporte', 'resultado', Outcome.literals),
  ...notBlank('reporte', 'version_juego', 'version_lanzador', 'resolucion', 'calidad_grafica', 'metodo_medicion', 'observaciones'),
  check('reporte', 'fps_no_negativo', 'fps_promedio IS NULL OR fps_promedio >= 0'),
  check('reporte', 'fps_con_contexto', 'fps_promedio IS NULL OR (resolucion IS NOT NULL AND calidad_grafica IS NOT NULL AND metodo_medicion IS NOT NULL)'),
  `CREATE TABLE reporte_fallo (
     reporte_id integer NOT NULL REFERENCES reporte(id) ON DELETE RESTRICT,
     tipo_fallo_id integer NOT NULL REFERENCES tipo_fallo(id) ON DELETE RESTRICT,
     detalle text NOT NULL,
     CONSTRAINT reporte_fallo_pkey PRIMARY KEY (reporte_id, tipo_fallo_id))`,
  `CREATE INDEX reporte_fallo_tipo_idx ON reporte_fallo (tipo_fallo_id)`,
  ...notBlank('reporte_fallo', 'detalle'),
  `CREATE TABLE solucion (${id},
     reporte_id integer NOT NULL,
     tipo_fallo_id integer NOT NULL,
     autor_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     perfil_id integer REFERENCES perfil_configuracion(id) ON DELETE RESTRICT,
     titulo varchar(${L.solution.title}) NOT NULL,
     instrucciones text NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now(),
     ${reviewColumns},
     CONSTRAINT solucion_fallo_fk FOREIGN KEY (reporte_id, tipo_fallo_id)
       REFERENCES reporte_fallo (reporte_id, tipo_fallo_id) ON DELETE RESTRICT)`,
  `CREATE INDEX solucion_fallo_idx ON solucion (reporte_id, tipo_fallo_id)`,
  `CREATE INDEX solucion_tipo_idx ON solucion (tipo_fallo_id)`,
  ...reviewRules('solucion', 'og_solo_revision'),
  ...notBlank('solucion', 'titulo', 'instrucciones'),
]

const guides = [
  `CREATE TABLE guia_adopcion (${id},
     autor_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     distribucion_id integer REFERENCES distribucion(id) ON DELETE RESTRICT,
     tipo varchar(${L.adoption_guide.type}) NOT NULL,
     titulo varchar(${L.adoption_guide.title}) NOT NULL,
     contenido text NOT NULL,
     revision integer NOT NULL,
     estado varchar(${L.adoption_guide.status}) NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now(),
     actualizado_en timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX guia_adopcion_tipo_estado_idx ON guia_adopcion (tipo, estado)`,
  domainCheck('guia_adopcion', 'tipo', GuideType.literals),
  domainCheck('guia_adopcion', 'estado', GuideStatus.literals),
  ...notBlank('guia_adopcion', 'titulo', 'contenido'),
  check('guia_adopcion', 'revision_positiva', 'revision > 0'),
  check('guia_adopcion', 'fechas_ordenadas', 'actualizado_en >= creado_en'),
]

const gpuLibrary = [
  `ALTER TABLE diagnostico ADD COLUMN gpu_pci_id varchar(${L.diagnostic.gpu_pci_id})`,
  check('diagnostico', 'gpu_pci_id_formato', "gpu_pci_id IS NULL OR gpu_pci_id ~ '^[0-9a-f]{4}:[0-9a-f]{4}$'"),
  `ALTER TABLE diagnostico ADD COLUMN biblioteca_steam jsonb`,
  check(
    'diagnostico',
    'biblioteca_steam_forma',
    "biblioteca_steam IS NULL OR CASE WHEN jsonb_typeof(biblioteca_steam) = 'array' THEN jsonb_array_length(biblioteca_steam) <= 1000 ELSE false END",
  ),
]

// Adding columns fires no UPDATE trigger, so the immutable diagnostico rows keep NULL: not captured.
const systemFacts = [
  `ALTER TABLE diagnostico
     ADD COLUMN nivel_x86 varchar(${L.diagnostic.x86_level}),
     ADD COLUMN arranque_seguro varchar(${L.diagnostic.secure_boot}),
     ADD COLUMN tpm varchar(${L.diagnostic.tpm}),
     ADD COLUMN zram_mb integer,
     ADD COLUMN swap_mb integer`,
  domainCheck('diagnostico', 'nivel_x86', X86Level.literals),
  domainCheck('diagnostico', 'arranque_seguro', SecureBoot.literals),
  domainCheck('diagnostico', 'tpm', Tpm.literals),
  check('diagnostico', 'zram_no_negativa', 'zram_mb IS NULL OR zram_mb >= 0'),
  check('diagnostico', 'swap_no_negativa', 'swap_mb IS NULL OR swap_mb >= 0'),
  `ALTER TABLE juego ADD COLUMN nivel_x86_min varchar(${L.game.x86_level_min})`,
  domainCheck('juego', 'nivel_x86_min', X86Level.literals),
  // A set by construction; a game with no rows has unknown APIs.
  `CREATE TABLE juego_api (
     juego_id integer NOT NULL REFERENCES juego(id) ON DELETE RESTRICT,
     api varchar(${L.game_api.api}) NOT NULL,
     PRIMARY KEY (juego_id, api))`,
  domainCheck('juego_api', 'api', GraphicsApi.literals),
]

const protondb = [
  `CREATE TABLE protondb_resumen (
     edicion_id integer PRIMARY KEY REFERENCES edicion_juego(id) ON DELETE RESTRICT,
     exportado_en timestamptz NOT NULL,
     reportes_total integer NOT NULL,
     recientes integer NOT NULL,
     recientes_funcionan integer NOT NULL,
     modestos_recientes integer NOT NULL,
     modestos_funcionan integer NOT NULL,
     ultimo_reporte timestamptz NOT NULL,
     capa_variante varchar(${L.protondb_summary.layer_variant}),
     capa_version varchar(${L.protondb_summary.layer_version}),
     capa_reportes integer NOT NULL)`,
  domainCheck('protondb_resumen', 'capa_variante', ProtonVariant.literals),
  ...notBlank('protondb_resumen', 'capa_version'),
  check(
    'protondb_resumen',
    'conteos_anidados',
    `0 <= modestos_funcionan AND modestos_funcionan <= modestos_recientes AND modestos_recientes <= recientes
     AND modestos_funcionan <= recientes_funcionan AND recientes_funcionan <= recientes AND recientes <= reportes_total
     AND 0 <= capa_reportes AND capa_reportes <= recientes_funcionan AND reportes_total > 0`,
  ),
  check('protondb_resumen', 'capa_con_reportes', '(capa_variante IS NULL) = (capa_reportes = 0)'),
  check('protondb_resumen', 'version_con_variante', 'capa_version IS NULL OR capa_variante IS NOT NULL'),
  check('protondb_resumen', 'fechas_ordenadas', 'ultimo_reporte <= exportado_en'),
  `COMMENT ON TABLE protondb_resumen IS 'Agregados por edición de Steam del export mensual de ProtonDB (ODbL 1.0), nunca reportes individuales (8.9). No alimenta el estado calculado. Escritor único: servidor/externo/protondb.ts'`,
]

// Only merged PRs are recorded, so the table has no status to sync. og_inmutable blocks UPDATE; DELETE stays for Anular.
const upstream = [
  `CREATE TABLE arreglo_upstream (${id},
     pr integer NOT NULL,
     perfil_id integer NOT NULL REFERENCES perfil_configuracion(id) ON DELETE RESTRICT,
     registrado_por text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     registrado_en timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT arreglo_upstream_pr_uq UNIQUE (pr))`,
  check('arreglo_upstream', 'pr_positivo', 'pr > 0'),
  `CREATE INDEX arreglo_upstream_perfil_idx ON arreglo_upstream (perfil_id)`,
  `CREATE TRIGGER arreglo_upstream_inmutable BEFORE UPDATE ON arreglo_upstream FOR EACH ROW EXECUTE FUNCTION og_inmutable()`,
]

// Postgres renames a table or column in place but leaves the names of its constraints, indexes, sequences
// and triggers alone, so those are renamed one by one below.
const renamedTables = {
  usuario: 'app_user',
  juego: 'game',
  lanzador: 'launcher',
  edicion_juego: 'game_edition',
  distribucion: 'distribution',
  version_capa: 'layer_version',
  equipo: 'machine',
  diagnostico: 'diagnostic',
  perfil_configuracion: 'profile',
  paso_configuracion: 'profile_step',
  dependencia: 'dependency',
  perfil_dependencia: 'profile_dependency',
  tipo_fallo: 'failure_type',
  reporte: 'report',
  reporte_fallo: 'report_failure',
  solucion: 'solution',
  guia_adopcion: 'adoption_guide',
  juego_api: 'game_api',
  protondb_resumen: 'protondb_summary',
  arreglo_upstream: 'upstream_fix',
}

const reviewColumnRenames = {
  estado_revision: 'review_status',
  revisor_id: 'reviewer_id',
  revisado_en: 'reviewed_at',
  motivo_revision: 'review_reason',
  evidencia_revision: 'review_evidence',
}

type RenamedTable = (typeof renamedTables)[keyof typeof renamedTables]

const renamedColumns = {
  app_user: {
    correo: 'email',
    correo_verificado: 'email_verified',
    creado_en: 'created_at',
    actualizado_en: 'updated_at',
    rol: 'role',
    activo: 'active',
  },
  game: { titulo: 'title', descripcion: 'description', actualizado_en: 'updated_at', nivel_x86_min: 'x86_level_min' },
  launcher: { nombre: 'name', url_oficial: 'official_url' },
  game_edition: { juego_id: 'game_id', lanzador_id: 'launcher_id', identificador_externo: 'external_id', actualizado_en: 'updated_at' },
  distribution: { nombre: 'name', url_oficial: 'official_url' },
  layer_version: { familia: 'family', variante: 'variant' },
  machine: { usuario_id: 'user_id', creado_en: 'created_at' },
  diagnostic: {
    equipo_id: 'machine_id',
    capturado_en: 'captured_at',
    sistema: 'operating_system',
    version_sistema: 'os_version',
    distribucion_id: 'distribution_id',
    arquitectura: 'architecture',
    cpu_modelo: 'cpu_model',
    gpu_modelo: 'gpu_model',
    controlador: 'driver',
    version_controlador: 'driver_version',
    soporte_vulkan: 'vulkan_support',
    version_vulkan: 'vulkan_version',
    biblioteca_steam: 'steam_library',
    nivel_x86: 'x86_level',
    arranque_seguro: 'secure_boot',
  },
  profile: {
    edicion_id: 'edition_id',
    distribucion_id: 'distribution_id',
    version_capa_id: 'layer_version_id',
    autor_id: 'author_id',
    arquitectura: 'architecture',
    titulo: 'title',
    version_juego_objetivo: 'target_game_version',
    requiere_vulkan: 'requires_vulkan',
    version_vulkan_min: 'vulkan_version_min',
    condicion_cpu: 'cpu_requirement',
    condicion_gpu: 'gpu_requirement',
    parametros_lanzamiento: 'launch_options',
    creado_en: 'created_at',
    ...reviewColumnRenames,
  },
  profile_step: { perfil_id: 'profile_id', orden: 'position', titulo: 'title', instruccion: 'instruction' },
  dependency: { nombre: 'name', gestor: 'package_manager', descripcion: 'description' },
  profile_dependency: {
    perfil_id: 'profile_id',
    dependencia_id: 'dependency_id',
    version_requerida: 'required_version',
    obligatoria: 'required',
    instruccion_instalacion: 'install_instruction',
  },
  failure_type: { codigo: 'code', descripcion: 'description' },
  report: {
    edicion_id: 'edition_id',
    diagnostico_id: 'diagnostic_id',
    version_capa_id: 'layer_version_id',
    perfil_id: 'profile_id',
    version_juego: 'game_version',
    version_lanzador: 'launcher_version',
    fecha_prueba: 'tested_at',
    resultado: 'outcome',
    fps_promedio: 'avg_fps',
    resolucion: 'resolution',
    calidad_grafica: 'graphics_quality',
    metodo_medicion: 'measurement_method',
    observaciones: 'observations',
    creado_en: 'created_at',
    ...reviewColumnRenames,
  },
  report_failure: { reporte_id: 'report_id', tipo_fallo_id: 'failure_type_id', detalle: 'detail' },
  solution: {
    reporte_id: 'report_id',
    tipo_fallo_id: 'failure_type_id',
    autor_id: 'author_id',
    perfil_id: 'profile_id',
    titulo: 'title',
    instrucciones: 'instructions',
    creado_en: 'created_at',
    ...reviewColumnRenames,
  },
  adoption_guide: {
    autor_id: 'author_id',
    distribucion_id: 'distribution_id',
    tipo: 'type',
    titulo: 'title',
    contenido: 'content',
    estado: 'status',
    creado_en: 'created_at',
    actualizado_en: 'updated_at',
  },
  game_api: { juego_id: 'game_id' },
  protondb_summary: {
    edicion_id: 'edition_id',
    exportado_en: 'exported_at',
    reportes_total: 'total_reports',
    recientes: 'recent',
    recientes_funcionan: 'recent_working',
    modestos_recientes: 'modest_recent',
    modestos_funcionan: 'modest_working',
    ultimo_reporte: 'latest_report',
    capa_variante: 'layer_variant',
    capa_version: 'layer_version',
    capa_reportes: 'layer_reports',
  },
  upstream_fix: { perfil_id: 'profile_id', registrado_por: 'noted_by', registrado_en: 'noted_at' },
} satisfies Partial<Record<RenamedTable, Record<string, string>>>

const renamedConstraints = {
  app_user: {
    usuario_rol_dominio: 'app_user_role_domain',
    usuario_correo_normalizado: 'app_user_email_normalized',
    usuario_alias_largo: 'app_user_alias_length',
    usuario_correo_largo: 'app_user_email_length',
    usuario_alias_no_vacio: 'app_user_alias_not_blank',
    usuario_correo_no_vacio: 'app_user_email_not_blank',
  },
  game: {
    juego_titulo_no_vacio: 'game_title_not_blank',
    juego_descripcion_no_vacio: 'game_description_not_blank',
    juego_nivel_x86_min_dominio: 'game_x86_level_min_domain',
  },
  launcher: { lanzador_nombre_no_vacio: 'launcher_name_not_blank', lanzador_url_oficial_no_vacio: 'launcher_official_url_not_blank' },
  game_edition: {
    edicion_juego_juego_lanzador_uq: 'game_edition_game_launcher_uq',
    edicion_juego_externo_uq: 'game_edition_external_uq',
    edicion_juego_identificador_externo_no_vacio: 'game_edition_external_id_not_blank',
  },
  distribution: {
    distribucion_nombre_version_uq: 'distribution_name_version_uq',
    distribucion_nombre_no_vacio: 'distribution_name_not_blank',
    distribucion_version_no_vacio: 'distribution_version_not_blank',
    distribucion_url_oficial_no_vacio: 'distribution_official_url_not_blank',
  },
  layer_version: {
    version_capa_uq: 'layer_version_uq',
    version_capa_familia_dominio: 'layer_version_family_domain',
    version_capa_variante_no_vacio: 'layer_version_variant_not_blank',
    version_capa_version_no_vacio: 'layer_version_version_not_blank',
    version_capa_version_exacta: 'layer_version_exact_version',
  },
  machine: { equipo_alias_no_vacio: 'machine_alias_not_blank' },
  diagnostic: {
    diagnostico_captura_uq: 'diagnostic_capture_uq',
    diagnostico_sistema_dominio: 'diagnostic_operating_system_domain',
    diagnostico_soporte_vulkan_dominio: 'diagnostic_vulkan_support_domain',
    diagnostico_version_sistema_no_vacio: 'diagnostic_os_version_not_blank',
    diagnostico_arquitectura_no_vacio: 'diagnostic_architecture_not_blank',
    diagnostico_cpu_modelo_no_vacio: 'diagnostic_cpu_model_not_blank',
    diagnostico_gpu_modelo_no_vacio: 'diagnostic_gpu_model_not_blank',
    diagnostico_controlador_no_vacio: 'diagnostic_driver_not_blank',
    diagnostico_version_controlador_no_vacio: 'diagnostic_driver_version_not_blank',
    diagnostico_version_vulkan_no_vacio: 'diagnostic_vulkan_version_not_blank',
    diagnostico_ram_positiva: 'diagnostic_ram_positive',
    diagnostico_vram_no_negativa: 'diagnostic_vram_non_negative',
    diagnostico_linux_con_distribucion: 'diagnostic_linux_has_distribution',
    diagnostico_version_vulkan_solo_con_soporte: 'diagnostic_vulkan_version_needs_support',
    diagnostico_gpu_pci_id_formato: 'diagnostic_gpu_pci_id_format',
    diagnostico_biblioteca_steam_forma: 'diagnostic_steam_library_shape',
    diagnostico_nivel_x86_dominio: 'diagnostic_x86_level_domain',
    diagnostico_arranque_seguro_dominio: 'diagnostic_secure_boot_domain',
    diagnostico_tpm_dominio: 'diagnostic_tpm_domain',
    diagnostico_zram_no_negativa: 'diagnostic_zram_non_negative',
    diagnostico_swap_no_negativa: 'diagnostic_swap_non_negative',
  },
  profile: {
    perfil_configuracion_revision_uq: 'profile_revision_uq',
    perfil_configuracion_ref_reporte_uq: 'profile_report_ref_uq',
    perfil_configuracion_bloque_revision: 'profile_review_block',
    perfil_configuracion_revision_posterior: 'profile_reviewed_after_created',
    perfil_configuracion_evidencia_revision_no_vacio: 'profile_review_evidence_not_blank',
    perfil_configuracion_arquitectura_no_vacio: 'profile_architecture_not_blank',
    perfil_configuracion_titulo_no_vacio: 'profile_title_not_blank',
    perfil_configuracion_version_juego_objetivo_no_vacio: 'profile_target_game_version_not_blank',
    perfil_configuracion_version_vulkan_min_no_vacio: 'profile_vulkan_version_min_not_blank',
    perfil_configuracion_condicion_cpu_no_vacio: 'profile_cpu_requirement_not_blank',
    perfil_configuracion_condicion_gpu_no_vacio: 'profile_gpu_requirement_not_blank',
    perfil_configuracion_parametros_lanzamiento_no_vacio: 'profile_launch_options_not_blank',
    perfil_configuracion_revision_positiva: 'profile_revision_positive',
    perfil_configuracion_ram_min_positiva: 'profile_ram_min_positive',
    perfil_configuracion_vram_min_no_negativa: 'profile_vram_min_non_negative',
    perfil_configuracion_vulkan_min_requiere_vulkan: 'profile_vulkan_min_requires_vulkan',
  },
  profile_step: {
    paso_configuracion_orden_positivo: 'profile_step_position_positive',
    paso_configuracion_titulo_no_vacio: 'profile_step_title_not_blank',
    paso_configuracion_instruccion_no_vacio: 'profile_step_instruction_not_blank',
  },
  dependency: {
    dependencia_nombre_gestor_uq: 'dependency_name_package_manager_uq',
    dependencia_nombre_no_vacio: 'dependency_name_not_blank',
    dependencia_gestor_no_vacio: 'dependency_package_manager_not_blank',
    dependencia_descripcion_no_vacio: 'dependency_description_not_blank',
  },
  profile_dependency: {
    perfil_dependencia_version_requerida_no_vacio: 'profile_dependency_required_version_not_blank',
    perfil_dependencia_instruccion_instalacion_no_vacio: 'profile_dependency_install_instruction_not_blank',
  },
  failure_type: { tipo_fallo_codigo_formato: 'failure_type_code_format', tipo_fallo_descripcion_no_vacio: 'failure_type_description_not_blank' },
  report: {
    reporte_perfil_fk: 'report_profile_fk',
    reporte_bloque_revision: 'report_review_block',
    reporte_revision_posterior: 'report_reviewed_after_created',
    reporte_evidencia_revision_no_vacio: 'report_review_evidence_not_blank',
    reporte_resultado_dominio: 'report_outcome_domain',
    reporte_version_juego_no_vacio: 'report_game_version_not_blank',
    reporte_version_lanzador_no_vacio: 'report_launcher_version_not_blank',
    reporte_resolucion_no_vacio: 'report_resolution_not_blank',
    reporte_calidad_grafica_no_vacio: 'report_graphics_quality_not_blank',
    reporte_metodo_medicion_no_vacio: 'report_measurement_method_not_blank',
    reporte_observaciones_no_vacio: 'report_observations_not_blank',
    reporte_fps_no_negativo: 'report_fps_non_negative',
    reporte_fps_con_contexto: 'report_fps_with_context',
  },
  report_failure: { reporte_fallo_detalle_no_vacio: 'report_failure_detail_not_blank' },
  solution: {
    solucion_fallo_fk: 'solution_failure_fk',
    solucion_bloque_revision: 'solution_review_block',
    solucion_revision_posterior: 'solution_reviewed_after_created',
    solucion_evidencia_revision_no_vacio: 'solution_review_evidence_not_blank',
    solucion_titulo_no_vacio: 'solution_title_not_blank',
    solucion_instrucciones_no_vacio: 'solution_instructions_not_blank',
  },
  adoption_guide: {
    guia_adopcion_tipo_dominio: 'adoption_guide_type_domain',
    guia_adopcion_estado_dominio: 'adoption_guide_status_domain',
    guia_adopcion_titulo_no_vacio: 'adoption_guide_title_not_blank',
    guia_adopcion_contenido_no_vacio: 'adoption_guide_content_not_blank',
    guia_adopcion_revision_positiva: 'adoption_guide_revision_positive',
    guia_adopcion_fechas_ordenadas: 'adoption_guide_dates_ordered',
  },
  game_api: { juego_api_api_dominio: 'game_api_api_domain' },
  protondb_summary: {
    protondb_resumen_capa_variante_dominio: 'protondb_summary_layer_variant_domain',
    protondb_resumen_capa_version_no_vacio: 'protondb_summary_layer_version_not_blank',
    protondb_resumen_conteos_anidados: 'protondb_summary_nested_counts',
    protondb_resumen_capa_con_reportes: 'protondb_summary_layer_with_reports',
    protondb_resumen_version_con_variante: 'protondb_summary_version_with_variant',
    protondb_resumen_fechas_ordenadas: 'protondb_summary_dates_ordered',
  },
  upstream_fix: { arreglo_upstream_pr_uq: 'upstream_fix_pr_uq', arreglo_upstream_pr_positivo: 'upstream_fix_pr_positive' },
} satisfies Partial<Record<RenamedTable, Record<string, string>>>

// Postgres named the primary keys, foreign keys, single-column UNIQUEs and (from 18 on) NOT NULLs after the
// table and columns.
const renameDefaultConstraintNames = `DO $$
  DECLARE c record; suffix text; wanted text;
  BEGIN
    FOR c IN
      SELECT con.conname, con.contype, rel.relname, string_agg(att.attname, '_' ORDER BY k.ord) AS columns
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      WHERE con.connamespace = 'public'::regnamespace AND con.contype IN ('p', 'f', 'u', 'n')
      GROUP BY con.oid, con.conname, con.contype, rel.relname
    LOOP
      suffix := CASE c.contype WHEN 'p' THEN '_pkey' WHEN 'f' THEN '_fkey' WHEN 'u' THEN '_key' WHEN 'n' THEN '_not_null' END;
      wanted := CASE c.contype WHEN 'p' THEN c.relname || suffix ELSE c.relname || '_' || c.columns || suffix END;
      IF c.conname <> wanted AND right(c.conname, length(suffix)) = suffix THEN
        EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', c.relname, c.conname, wanted);
      END IF;
    END LOOP;
  END $$`

const renamedIndexes = {
  equipo_usuario_idx: 'machine_user_idx',
  perfil_configuracion_busqueda_idx: 'profile_search_idx',
  perfil_dependencia_dependencia_idx: 'profile_dependency_dependency_idx',
  reporte_perfil_idx: 'report_profile_idx',
  reporte_diagnostico_idx: 'report_diagnostic_idx',
  reporte_edicion_estado_fecha_idx: 'report_edition_status_date_idx',
  reporte_fallo_tipo_idx: 'report_failure_type_idx',
  solucion_fallo_idx: 'solution_failure_idx',
  solucion_tipo_idx: 'solution_type_idx',
  guia_adopcion_tipo_estado_idx: 'adoption_guide_type_status_idx',
  arreglo_upstream_perfil_idx: 'upstream_fix_profile_idx',
}

const renamedSequences = {
  juego_id_seq: 'game_id_seq',
  lanzador_id_seq: 'launcher_id_seq',
  edicion_juego_id_seq: 'game_edition_id_seq',
  distribucion_id_seq: 'distribution_id_seq',
  version_capa_id_seq: 'layer_version_id_seq',
  equipo_id_seq: 'machine_id_seq',
  diagnostico_id_seq: 'diagnostic_id_seq',
  perfil_configuracion_id_seq: 'profile_id_seq',
  dependencia_id_seq: 'dependency_id_seq',
  tipo_fallo_id_seq: 'failure_type_id_seq',
  reporte_id_seq: 'report_id_seq',
  solucion_id_seq: 'solution_id_seq',
  guia_adopcion_id_seq: 'adoption_guide_id_seq',
  arreglo_upstream_id_seq: 'upstream_fix_id_seq',
}

const oldTriggers = [
  'DROP TRIGGER equipo_propietario_fijo ON machine',
  'DROP TRIGGER diagnostico_inmutable ON diagnostic',
  'DROP TRIGGER perfil_configuracion_contenido_congelado ON profile',
  'DROP TRIGGER paso_configuracion_congelado ON profile_step',
  'DROP TRIGGER perfil_dependencia_congelado ON profile_dependency',
  'DROP TRIGGER reporte_contenido_congelado ON report',
  'DROP TRIGGER solucion_contenido_congelado ON solution',
  'DROP TRIGGER arreglo_upstream_inmutable ON upstream_fix',
  'DROP FUNCTION og_inmutable(), og_contenido(jsonb), og_solo_revision(), og_perfil_fijo(integer), og_perfil_contenido(), og_perfil_congelado(), og_propietario_fijo()',
]

const englishFunctions = [
  `CREATE FUNCTION og_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     RAISE EXCEPTION '%: immutable record (id %)', TG_TABLE_NAME, OLD.id
       USING ERRCODE = 'check_violation', CONSTRAINT = 'og_immutable';
   END $$`,
  `CREATE FUNCTION og_content(data jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE
   AS $$ SELECT data - ARRAY['review_status', 'reviewer_id', 'reviewed_at', 'review_reason', 'review_evidence'] $$`,
  `CREATE FUNCTION og_review_only() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF og_content(to_jsonb(NEW)) IS DISTINCT FROM og_content(to_jsonb(OLD)) THEN
       RAISE EXCEPTION '%: content is never rewritten; submit a new contribution (id %)', TG_TABLE_NAME, OLD.id
         USING ERRCODE = 'check_violation', CONSTRAINT = 'og_review_only';
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE FUNCTION og_profile_fixed(pid integer) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
   BEGIN
     RETURN EXISTS (SELECT 1 FROM profile p WHERE p.id = pid AND p.review_status <> '${initialStatus}')
         OR EXISTS (SELECT 1 FROM report r WHERE r.profile_id = pid);
   END $$`,
  `CREATE FUNCTION og_profile_content() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF og_content(to_jsonb(NEW)) IS DISTINCT FROM og_content(to_jsonb(OLD)) AND og_profile_fixed(OLD.id) THEN
       RAISE EXCEPTION 'profile %: revision frozen; create a new revision', OLD.id
         USING ERRCODE = 'check_violation', CONSTRAINT = 'og_profile_frozen';
     END IF;
     RETURN NEW;
   END $$`,
  `CREATE FUNCTION og_profile_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF og_profile_fixed(OLD.profile_id) OR og_profile_fixed(NEW.profile_id) THEN
       RAISE EXCEPTION 'profile %: revision frozen; create a new revision', COALESCE(OLD.profile_id, NEW.profile_id)
         USING ERRCODE = 'check_violation', CONSTRAINT = 'og_profile_frozen';
     END IF;
     RETURN COALESCE(NEW, OLD);
   END $$`,
  `CREATE FUNCTION og_owner_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF EXISTS (SELECT 1 FROM diagnostic d WHERE d.machine_id = OLD.id) THEN
       RAISE EXCEPTION 'machine %: already has diagnostics; the owner does not change', OLD.id
         USING ERRCODE = 'check_violation', CONSTRAINT = 'og_owner_fixed';
     END IF;
     RETURN NEW;
   END $$`,
]

const englishTriggers = [
  `CREATE TRIGGER machine_owner_fixed BEFORE UPDATE OF user_id ON machine FOR EACH ROW
     WHEN (OLD.user_id IS DISTINCT FROM NEW.user_id) EXECUTE FUNCTION og_owner_fixed()`,
  'CREATE TRIGGER diagnostic_immutable BEFORE UPDATE ON diagnostic FOR EACH ROW EXECUTE FUNCTION og_immutable()',
  'CREATE TRIGGER profile_content_frozen BEFORE UPDATE ON profile FOR EACH ROW EXECUTE FUNCTION og_profile_content()',
  'CREATE TRIGGER profile_step_frozen BEFORE INSERT OR UPDATE OR DELETE ON profile_step FOR EACH ROW EXECUTE FUNCTION og_profile_frozen()',
  'CREATE TRIGGER profile_dependency_frozen BEFORE INSERT OR UPDATE OR DELETE ON profile_dependency FOR EACH ROW EXECUTE FUNCTION og_profile_frozen()',
  'CREATE TRIGGER report_content_frozen BEFORE UPDATE ON report FOR EACH ROW EXECUTE FUNCTION og_review_only()',
  'CREATE TRIGGER solution_content_frozen BEFORE UPDATE ON solution FOR EACH ROW EXECUTE FUNCTION og_review_only()',
  'CREATE TRIGGER upstream_fix_immutable BEFORE UPDATE ON upstream_fix FOR EACH ROW EXECUTE FUNCTION og_immutable()',
]

const englishComments = [
  `COMMENT ON TABLE app_user IS 'Doc 8.3 usuario. A better-auth table. Deviation: contrasena_hash lives in account.password (providerId = credential)'`,
  `COMMENT ON COLUMN app_user.id IS 'Deviation from 8.3 (integer): a text id generated by better-auth'`,
  `COMMENT ON TABLE protondb_summary IS 'Per Steam edition aggregates of the monthly ProtonDB export (ODbL 1.0), never individual reports (8.9). Does not feed the computed status. Single writer: server/external/protondb.ts'`,
]

const renames = (statement: (from: string, to: string) => string) => (names: Record<string, string>) =>
  Object.entries(names).map(([from, to]) => statement(from, to))

const perTable = (statement: (table: string, from: string, to: string) => string) => (byTable: Record<string, Record<string, string>>) =>
  Object.entries(byTable).flatMap(([table, names]) => renames((from, to) => statement(table, from, to))(names))

export const englishNames = [
  ...renames((from, to) => `ALTER TABLE ${from} RENAME TO ${to}`)(renamedTables),
  ...perTable((table, from, to) => `ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`)(renamedColumns),
  ...perTable((table, from, to) => `ALTER TABLE ${table} RENAME CONSTRAINT ${from} TO ${to}`)(renamedConstraints),
  renameDefaultConstraintNames,
  ...renames((from, to) => `ALTER INDEX ${from} RENAME TO ${to}`)(renamedIndexes),
  ...renames((from, to) => `ALTER SEQUENCE ${from} RENAME TO ${to}`)(renamedSequences),
  ...oldTriggers,
  ...englishFunctions,
  ...englishTriggers,
  ...englishComments,
]

export const migrations = {
  '1_auth': runStatements(auth),
  '2_opengame': runStatements([...functions, ...userTable, ...catalog, ...diagnostics, ...profiles, ...results, ...guides]),
  '3_gpu_biblioteca': runStatements(gpuLibrary),
  '4_hechos_sistema': runStatements(systemFacts),
  '5_protondb': runStatements(protondb),
  '6_upstream': runStatements(upstream),
  '7_english_names': runStatements(englishNames),
}

export const migrate = PgMigrator.run({ loader: Migrator.fromRecord(migrations) })

export const dropSchema = (expectedDatabase: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const { name } = yield* oneRow(Schema.Struct({ name: Schema.String }), sql`SELECT current_database() AS name`)
    if (name !== expectedDatabase) return yield* Effect.die(`dropSchema: connected to «${name}», not «${expectedDatabase}»; nothing was dropped`)
    yield* runStatements(['DROP SCHEMA public CASCADE', 'CREATE SCHEMA public'])
  })
