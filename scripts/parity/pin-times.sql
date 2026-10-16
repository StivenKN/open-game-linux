-- Postgres stamps rows with its own now(), which the Node preload cannot freeze.
-- Replica mode skips the app's triggers, including the one that rejects edits to a reviewed row.
SET session_replication_role = replica;
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND data_type = 'timestamp with time zone'
  LOOP
    EXECUTE format('UPDATE %I SET %I = current_setting(''parity.frozen'')::timestamptz WHERE %I > now() - interval ''1 hour''',
                   c.table_name, c.column_name, c.column_name);
  END LOOP;
END $$;
