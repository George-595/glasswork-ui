-- Runs once, when the postgres-data volume is empty. DEV ONLY (see compose.yaml).
-- POSTGRES_DB already created `app`; the user `app` is the superuser, so the tests can
-- CREATE DATABASE a throwaway database per run.
CREATE DATABASE app_test;
ALTER DATABASE app SET timezone TO 'UTC';
ALTER DATABASE app_test SET timezone TO 'UTC';
