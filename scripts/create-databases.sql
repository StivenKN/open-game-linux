-- Runs once, when the container's data volume is empty. POSTGRES_DB already created opengame;
-- the guard keeps this file correct on its own. psql's \gexec runs the generated statement.
SELECT 'CREATE DATABASE opengame' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'opengame')\gexec
SELECT 'CREATE DATABASE opengame_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'opengame_test')\gexec
