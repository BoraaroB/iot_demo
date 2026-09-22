#!/bin/bash
# Runs once, on first init, via postgres image's docker-entrypoint-initdb.d hook.
# POSTGRES_DB (vehicle_db) is created automatically by the image; this adds alert_db.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
  CREATE DATABASE alert_db;
EOSQL
