#!/bin/bash
# Starts sqlservr, applies /init/*.sql once, then leaves the server in the foreground.
# The healthcheck waits for the marker, so `docker compose up --wait` returns only after the seed.
set -euo pipefail

if [ -x /opt/mssql-tools18/bin/sqlcmd ]; then
  SQLCMD=/opt/mssql-tools18/bin/sqlcmd
elif [ -x /opt/mssql-tools/bin/sqlcmd ]; then
  SQLCMD=/opt/mssql-tools/bin/sqlcmd
else
  echo "sqlcmd is not in the image" >&2
  exit 1
fi

MARKER=/var/opt/mssql/.seeded
/opt/mssql/bin/sqlservr &
pid=$!

cleanup() {
  kill "$pid" 2>/dev/null || true
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 90); do
  if "$SQLCMD" -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -l 2 -Q "SELECT 1" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "sqlservr exited before it accepted connections" >&2
    exit 1
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "sqlservr did not accept connections" >&2
  exit 1
fi

if [ ! -f "$MARKER" ]; then
  for file in /init/*.sql; do
    echo "seeding $file"
    # -I keeps QUOTED_IDENTIFIER on. Computed columns, filtered indexes, and indexed views reject OFF.
    "$SQLCMD" -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -I -b -i "$file"
  done
  touch "$MARKER"
fi

trap - EXIT
wait "$pid"
