// One SQL statement per sql.unsafe call
// (the extended protocol rejects multi-statement strings), so each area is a string array.
import { Effect, Schema } from 'effect'
import { Migrator, SqlClient } from 'effect/sql'
import { PgMigrator } from '@effect/sql-pg'
import { Sistema, SoporteVulkan } from '../../dominio/evaluacion.ts'
import { EstadoGuia, TipoGuia } from '../../dominio/guias.ts'
import { ApiGrafica, FamiliaCapa, Resultado, VarianteProton } from '../../dominio/literales.ts'
import { ArranqueSeguro, NivelX86, Tpm } from '../../dominio/plataforma.ts'
import { type EstadoRevision, Rol } from '../../dominio/revision.ts'
import { largo as L } from '../../dominio/largo.ts'
import { BloqueRevision } from '../../dominio/tablas.ts'
import { unaFila } from '../filas.ts'

const ejecutar = (sentencias: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    for (const s of sentencias) yield* sql.unsafe(s)
  })

const dominio = (t: string, c: string, valores: ReadonlyArray<string>) =>
  `ALTER TABLE ${t} ADD CONSTRAINT ${t}_${c}_dominio CHECK (${c} IN (${valores.map((v) => `'${v}'`).join(', ')}))`

/** A NULL CHECK result passes, so `btrim(NULL) <> ''` would let NULL through; the nullif form does not. */
const conTexto = (c: string) => `nullif(btrim(${c}), '') IS NOT NULL`

const noVacio = (t: string, ...columnas: ReadonlyArray<string>) =>
  columnas.map((c) => `ALTER TABLE ${t} ADD CONSTRAINT ${t}_${c}_no_vacio CHECK (${c} IS NULL OR ${conTexto(c)})`)

const check = (t: string, nombre: string, expr: string) => `ALTER TABLE ${t} ADD CONSTRAINT ${t}_${nombre} CHECK (${expr})`

const inicial: EstadoRevision = 'pendiente'

const bloqueRevision = `
  estado_revision varchar(${L.bloque_revision.estado_revision}) NOT NULL DEFAULT '${inicial}',
  revisor_id text REFERENCES usuario(id) ON DELETE RESTRICT,
  revisado_en timestamptz,
  motivo_revision text,
  evidencia_revision text`

const revisado = `revisor_id IS NOT NULL AND revisado_en IS NOT NULL AND ${conTexto('motivo_revision')}`

const formaPorEstado = {
  pendiente: 'revisor_id IS NULL AND revisado_en IS NULL AND motivo_revision IS NULL AND evidencia_revision IS NULL',
  aprobado: `${revisado} AND ${conTexto('evidencia_revision')}`,
  rechazado: revisado,
  retirado: revisado,
} satisfies Record<EstadoRevision, string>

const reglasRevision = (t: string, congelar: 'og_solo_revision' | 'og_perfil_contenido') => [
  check(t, 'bloque_revision', Object.entries(formaPorEstado).map(([estado, forma]) => `(estado_revision = '${estado}' AND ${forma})`).join(' OR ')),
  check(t, 'revision_posterior', 'revisado_en IS NULL OR revisado_en >= creado_en'),
  ...noVacio(t, 'evidencia_revision'),
  `CREATE TRIGGER ${t}_contenido_congelado BEFORE UPDATE ON ${t} FOR EACH ROW EXECUTE FUNCTION ${congelar}()`,
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

const funciones = [
  `CREATE FUNCTION og_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     RAISE EXCEPTION '%: registro inmutable (id %)', TG_TABLE_NAME, OLD.id
       USING ERRCODE = 'check_violation', CONSTRAINT = 'og_inmutable';
   END $$`,
  `CREATE FUNCTION og_contenido(fila jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE
   AS $$ SELECT fila - ARRAY[${Object.keys(BloqueRevision.fields).map((c) => `'${c}'`).join(', ')}] $$`,
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
     RETURN EXISTS (SELECT 1 FROM perfil_configuracion p WHERE p.id = pid AND p.estado_revision <> '${inicial}')
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

const usuario = [
  dominio('usuario', 'rol', Rol.literals),
  check('usuario', 'correo_normalizado', 'correo = lower(btrim(correo))'),
  check('usuario', 'alias_largo', `char_length(alias) <= ${L.usuario.alias}`),
  check('usuario', 'correo_largo', `char_length(correo) <= ${L.usuario.correo}`),
  ...noVacio('usuario', 'alias', 'correo'),
]

const catalogo = [
  `CREATE TABLE juego (${id}, titulo varchar(${L.juego.titulo}) NOT NULL, descripcion text NOT NULL, actualizado_en timestamptz NOT NULL DEFAULT now())`,
  ...noVacio('juego', 'titulo', 'descripcion'),
  `CREATE TABLE lanzador (${id}, nombre varchar(${L.lanzador.nombre}) NOT NULL UNIQUE, url_oficial varchar(${L.lanzador.url_oficial}))`,
  ...noVacio('lanzador', 'nombre', 'url_oficial'),
  `CREATE TABLE edicion_juego (${id},
     juego_id integer NOT NULL REFERENCES juego(id) ON DELETE RESTRICT,
     lanzador_id integer NOT NULL REFERENCES lanzador(id) ON DELETE RESTRICT,
     identificador_externo varchar(${L.edicion_juego.identificador_externo}),
     actualizado_en timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT edicion_juego_juego_lanzador_uq UNIQUE (juego_id, lanzador_id),
     CONSTRAINT edicion_juego_externo_uq UNIQUE (lanzador_id, identificador_externo))`, // NULLs distinct: "cuando exista"
  ...noVacio('edicion_juego', 'identificador_externo'),
  `CREATE TABLE distribucion (${id}, nombre varchar(${L.distribucion.nombre}) NOT NULL, version varchar(${L.distribucion.version}) NOT NULL,
     url_oficial varchar(${L.distribucion.url_oficial}),
     CONSTRAINT distribucion_nombre_version_uq UNIQUE (nombre, version))`,
  ...noVacio('distribucion', 'nombre', 'version', 'url_oficial'),
  `CREATE TABLE version_capa (${id}, familia varchar(${L.version_capa.familia}) NOT NULL,
     variante varchar(${L.version_capa.variante}) NOT NULL, version varchar(${L.version_capa.version}) NOT NULL,
     CONSTRAINT version_capa_uq UNIQUE (familia, variante, version))`,
  dominio('version_capa', 'familia', FamiliaCapa.literals),
  ...noVacio('version_capa', 'variante', 'version'),
  check('version_capa', 'version_exacta', "lower(btrim(version)) NOT IN ('latest', 'ultima', 'última')"),
]

const diagnosticos = [
  `CREATE TABLE equipo (${id},
     usuario_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     alias varchar(${L.equipo.alias}) NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX equipo_usuario_idx ON equipo (usuario_id)`,
  ...noVacio('equipo', 'alias'),
  `CREATE TRIGGER equipo_propietario_fijo BEFORE UPDATE OF usuario_id ON equipo FOR EACH ROW
     WHEN (OLD.usuario_id IS DISTINCT FROM NEW.usuario_id) EXECUTE FUNCTION og_propietario_fijo()`,
  `CREATE TABLE diagnostico (${id},
     equipo_id integer NOT NULL REFERENCES equipo(id) ON DELETE RESTRICT,
     capturado_en timestamptz NOT NULL,
     sistema varchar(${L.diagnostico.sistema}) NOT NULL,
     version_sistema varchar(${L.diagnostico.version_sistema}) NOT NULL,
     distribucion_id integer REFERENCES distribucion(id) ON DELETE RESTRICT,
     arquitectura varchar(${L.diagnostico.arquitectura}) NOT NULL,
     cpu_modelo varchar(${L.diagnostico.cpu_modelo}) NOT NULL,
     gpu_modelo varchar(${L.diagnostico.gpu_modelo}) NOT NULL,
     ram_mb integer NOT NULL,
     vram_mb integer,
     controlador varchar(${L.diagnostico.controlador}),
     version_controlador varchar(${L.diagnostico.version_controlador}),
     soporte_vulkan varchar(${L.diagnostico.soporte_vulkan}) NOT NULL,
     version_vulkan varchar(${L.diagnostico.version_vulkan}),
     CONSTRAINT diagnostico_captura_uq UNIQUE (equipo_id, capturado_en))`,
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
     arquitectura varchar(${L.perfil_configuracion.arquitectura}) NOT NULL,
     revision integer NOT NULL,
     titulo varchar(${L.perfil_configuracion.titulo}) NOT NULL,
     version_juego_objetivo varchar(${L.perfil_configuracion.version_juego_objetivo}),
     ram_min_mb integer,
     vram_min_mb integer,
     requiere_vulkan boolean,
     version_vulkan_min varchar(${L.perfil_configuracion.version_vulkan_min}),
     condicion_cpu text,
     condicion_gpu text,
     parametros_lanzamiento text,
     creado_en timestamptz NOT NULL DEFAULT now(),
     ${bloqueRevision},
     CONSTRAINT perfil_configuracion_revision_uq UNIQUE (edicion_id, distribucion_id, version_capa_id, arquitectura, revision),
     CONSTRAINT perfil_configuracion_ref_reporte_uq UNIQUE (id, edicion_id, version_capa_id))`, // target of reporte_perfil_fk
  `CREATE INDEX perfil_configuracion_busqueda_idx ON perfil_configuracion (edicion_id, distribucion_id, estado_revision)`,
  ...reglasRevision('perfil_configuracion', 'og_perfil_contenido'),
  ...noVacio('perfil_configuracion', 'arquitectura', 'titulo', 'version_juego_objetivo', 'version_vulkan_min', 'condicion_cpu', 'condicion_gpu', 'parametros_lanzamiento'),
  check('perfil_configuracion', 'revision_positiva', 'revision > 0'),
  check('perfil_configuracion', 'ram_min_positiva', 'ram_min_mb IS NULL OR ram_min_mb > 0'),
  check('perfil_configuracion', 'vram_min_no_negativa', 'vram_min_mb IS NULL OR vram_min_mb >= 0'),
  check('perfil_configuracion', 'vulkan_min_requiere_vulkan', 'version_vulkan_min IS NULL OR requiere_vulkan IS TRUE'),
  `CREATE TABLE paso_configuracion (
     perfil_id integer NOT NULL REFERENCES perfil_configuracion(id) ON DELETE CASCADE,
     orden integer NOT NULL,
     titulo varchar(${L.paso_configuracion.titulo}) NOT NULL,
     instruccion text NOT NULL,
     PRIMARY KEY (perfil_id, orden))`,
  check('paso_configuracion', 'orden_positivo', 'orden > 0'),
  ...noVacio('paso_configuracion', 'titulo', 'instruccion'),
  `CREATE TABLE dependencia (${id}, nombre varchar(${L.dependencia.nombre}) NOT NULL, gestor varchar(${L.dependencia.gestor}) NOT NULL,
     descripcion text NOT NULL,
     CONSTRAINT dependencia_nombre_gestor_uq UNIQUE (nombre, gestor))`,
  ...noVacio('dependencia', 'nombre', 'gestor', 'descripcion'),
  `CREATE TABLE perfil_dependencia (
     perfil_id integer NOT NULL REFERENCES perfil_configuracion(id) ON DELETE CASCADE,
     dependencia_id integer NOT NULL REFERENCES dependencia(id) ON DELETE RESTRICT,
     version_requerida varchar(${L.perfil_dependencia.version_requerida}),
     obligatoria boolean NOT NULL,
     instruccion_instalacion text NOT NULL,
     PRIMARY KEY (perfil_id, dependencia_id))`,
  `CREATE INDEX perfil_dependencia_dependencia_idx ON perfil_dependencia (dependencia_id)`,
  ...noVacio('perfil_dependencia', 'version_requerida', 'instruccion_instalacion'),
  ...['paso_configuracion', 'perfil_dependencia'].map(
    (h) => `CREATE TRIGGER ${h}_congelado BEFORE INSERT OR UPDATE OR DELETE ON ${h} FOR EACH ROW EXECUTE FUNCTION og_perfil_congelado()`,
  ),
]

const resultados = [
  `CREATE TABLE tipo_fallo (${id}, codigo varchar(${L.tipo_fallo.codigo}) NOT NULL UNIQUE, descripcion text NOT NULL)`,
  check('tipo_fallo', 'codigo_formato', "codigo ~ '^[a-z][a-z0-9_]*$'"),
  ...noVacio('tipo_fallo', 'descripcion'),
  `CREATE TABLE reporte (${id},
     edicion_id integer NOT NULL REFERENCES edicion_juego(id) ON DELETE RESTRICT,
     diagnostico_id integer NOT NULL REFERENCES diagnostico(id) ON DELETE RESTRICT,
     version_capa_id integer NOT NULL REFERENCES version_capa(id) ON DELETE RESTRICT,
     perfil_id integer,
     version_juego varchar(${L.reporte.version_juego}) NOT NULL,
     version_lanzador varchar(${L.reporte.version_lanzador}),
     fecha_prueba timestamptz NOT NULL,
     resultado varchar(${L.reporte.resultado}) NOT NULL,
     fps_promedio numeric(7,2),
     resolucion varchar(${L.reporte.resolucion}),
     calidad_grafica varchar(${L.reporte.calidad_grafica}),
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
  ...reglasRevision('reporte', 'og_solo_revision'),
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
     titulo varchar(${L.solucion.titulo}) NOT NULL,
     instrucciones text NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now(),
     ${bloqueRevision},
     CONSTRAINT solucion_fallo_fk FOREIGN KEY (reporte_id, tipo_fallo_id)
       REFERENCES reporte_fallo (reporte_id, tipo_fallo_id) ON DELETE RESTRICT)`,
  `CREATE INDEX solucion_fallo_idx ON solucion (reporte_id, tipo_fallo_id)`,
  `CREATE INDEX solucion_tipo_idx ON solucion (tipo_fallo_id)`,
  ...reglasRevision('solucion', 'og_solo_revision'),
  ...noVacio('solucion', 'titulo', 'instrucciones'),
]

const guias = [
  `CREATE TABLE guia_adopcion (${id},
     autor_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
     distribucion_id integer REFERENCES distribucion(id) ON DELETE RESTRICT,
     tipo varchar(${L.guia_adopcion.tipo}) NOT NULL,
     titulo varchar(${L.guia_adopcion.titulo}) NOT NULL,
     contenido text NOT NULL,
     revision integer NOT NULL,
     estado varchar(${L.guia_adopcion.estado}) NOT NULL,
     creado_en timestamptz NOT NULL DEFAULT now(),
     actualizado_en timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX guia_adopcion_tipo_estado_idx ON guia_adopcion (tipo, estado)`,
  dominio('guia_adopcion', 'tipo', TipoGuia.literals),
  dominio('guia_adopcion', 'estado', EstadoGuia.literals),
  ...noVacio('guia_adopcion', 'titulo', 'contenido'),
  check('guia_adopcion', 'revision_positiva', 'revision > 0'),
  check('guia_adopcion', 'fechas_ordenadas', 'actualizado_en >= creado_en'),
]

const gpuBiblioteca = [
  `ALTER TABLE diagnostico ADD COLUMN gpu_pci_id varchar(${L.diagnostico.gpu_pci_id})`,
  check('diagnostico', 'gpu_pci_id_formato', "gpu_pci_id IS NULL OR gpu_pci_id ~ '^[0-9a-f]{4}:[0-9a-f]{4}$'"),
  `ALTER TABLE diagnostico ADD COLUMN biblioteca_steam jsonb`,
  check(
    'diagnostico',
    'biblioteca_steam_forma',
    "biblioteca_steam IS NULL OR CASE WHEN jsonb_typeof(biblioteca_steam) = 'array' THEN jsonb_array_length(biblioteca_steam) <= 1000 ELSE false END",
  ),
]

// Adding columns fires no UPDATE trigger, so the immutable diagnostico rows keep NULL: not captured.
const hechosSistema = [
  `ALTER TABLE diagnostico
     ADD COLUMN nivel_x86 varchar(${L.diagnostico.nivel_x86}),
     ADD COLUMN arranque_seguro varchar(${L.diagnostico.arranque_seguro}),
     ADD COLUMN tpm varchar(${L.diagnostico.tpm}),
     ADD COLUMN zram_mb integer,
     ADD COLUMN swap_mb integer`,
  dominio('diagnostico', 'nivel_x86', NivelX86.literals),
  dominio('diagnostico', 'arranque_seguro', ArranqueSeguro.literals),
  dominio('diagnostico', 'tpm', Tpm.literals),
  check('diagnostico', 'zram_no_negativa', 'zram_mb IS NULL OR zram_mb >= 0'),
  check('diagnostico', 'swap_no_negativa', 'swap_mb IS NULL OR swap_mb >= 0'),
  `ALTER TABLE juego ADD COLUMN nivel_x86_min varchar(${L.juego.nivel_x86_min})`,
  dominio('juego', 'nivel_x86_min', NivelX86.literals),
  // A set by construction; a game with no rows has unknown APIs.
  `CREATE TABLE juego_api (
     juego_id integer NOT NULL REFERENCES juego(id) ON DELETE RESTRICT,
     api varchar(${L.juego_api.api}) NOT NULL,
     PRIMARY KEY (juego_id, api))`,
  dominio('juego_api', 'api', ApiGrafica.literals),
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
     capa_variante varchar(${L.protondb_resumen.capa_variante}),
     capa_version varchar(${L.protondb_resumen.capa_version}),
     capa_reportes integer NOT NULL)`,
  dominio('protondb_resumen', 'capa_variante', VarianteProton.literals),
  ...noVacio('protondb_resumen', 'capa_version'),
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

export const migraciones = {
  '1_auth': ejecutar(auth),
  '2_opengame': ejecutar([...funciones, ...usuario, ...catalogo, ...diagnosticos, ...configuraciones, ...resultados, ...guias]),
  '3_gpu_biblioteca': ejecutar(gpuBiblioteca),
  '4_hechos_sistema': ejecutar(hechosSistema),
  '5_protondb': ejecutar(protondb),
}

export const migrar = PgMigrator.run({ loader: Migrator.fromRecord(migraciones) })

/** Drops every table, and only when `base` names the database the client is connected to. */
export const vaciarEsquema = (base: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const { nombre } = yield* unaFila(Schema.Struct({ nombre: Schema.String }), sql`SELECT current_database() AS nombre`)
    if (nombre !== base) return yield* Effect.die(`vaciarEsquema: la conexión llega a «${nombre}», no a «${base}»; no se borró nada`)
    yield* ejecutar(['DROP SCHEMA public CASCADE', 'CREATE SCHEMA public'])
  })
