import { Effect } from 'effect'
import { SqlClient } from 'effect/sql'

// Migrator.fromRecord loader: id_name -> Effect requiring SqlClient.
export const migrations = {
  '1_reporte': Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    // The extended query protocol rejects multi-statement strings, so one statement per call.
    for (const stmt of statements) yield* sql.unsafe(stmt)
  }),
}

const statements = [
  `CREATE TABLE reporte (
        id bigserial PRIMARY KEY,
        titulo text NOT NULL,
        estado_revision text NOT NULL DEFAULT 'pendiente',
        evidencia_revision text,
        CONSTRAINT reporte_estado_revision_check CHECK (estado_revision IN ('pendiente','aprobado','rechazado')),
        CONSTRAINT reporte_bloque_revision CHECK (
          estado_revision <> 'aprobado' OR nullif(btrim(evidencia_revision), '') IS NOT NULL
        )
      )`,
  `CREATE FUNCTION og_solo_revision() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE revision text[] := ARRAY['estado_revision','evidencia_revision'];
      BEGIN
        IF OLD.estado_revision = 'aprobado'
           AND (to_jsonb(NEW) - revision) IS DISTINCT FROM (to_jsonb(OLD) - revision) THEN
          RAISE EXCEPTION '%: el contenido no se reescribe; registre un aporte nuevo (id %)', TG_TABLE_NAME, OLD.id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'og_solo_revision';
        END IF;
        RETURN NEW;
      END $$`,
  `CREATE TRIGGER reporte_solo_revision BEFORE UPDATE ON reporte
        FOR EACH ROW EXECUTE FUNCTION og_solo_revision()`,
  `INSERT INTO reporte (titulo, estado_revision, evidencia_revision) VALUES
        ('Elden Ring en Proton 10', 'aprobado', 'capturas + log'),
        ('Hades II nativo', 'pendiente', NULL)`,
]
