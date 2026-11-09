-- Runs once, when the mysql-data volume is empty. DEV ONLY (see compose.yaml).
-- MYSQL_DATABASE already created `app` and granted the `app` user on it.
CREATE DATABASE IF NOT EXISTS app_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
-- The test suite creates and drops a throwaway database per run, which needs global rights.
-- Acceptable only because this container is a local, loopback-only development database.
GRANT ALL PRIVILEGES ON *.* TO 'app'@'%';
FLUSH PRIVILEGES;
