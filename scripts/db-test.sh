#!/usr/bin/env bash
#
# Runs the database behaviour tests against a throwaway local PostgreSQL.
#
#   npm run db:test
#
# Applies the Supabase shim, then every migration in supabase/migrations in
# filename order, then supabase/tests/*.test.sql. Any failed assertion aborts
# with a non-zero exit code, so this works unchanged in CI.
#
# Requires a local PostgreSQL 14+ (the `initdb`/`pg_ctl` binaries). It does not
# touch, and cannot reach, any Supabase project.

set -euo pipefail

PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
PGDATA_DIR="${PGDATA_DIR:-/tmp/amx-pgdata}"
SOCKET_DIR="${SOCKET_DIR:-/tmp/amx-pgrun}"
PG_PORT="${PG_PORT:-5433}"
DB_NAME="amx_test"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -x "$PG_BIN/initdb" ]]; then
  echo "PostgreSQL server binaries not found. Set PG_BIN to the directory containing initdb." >&2
  exit 1
fi

# initdb refuses to run as root; drop to a non-privileged account if we are.
RUN_AS=""
if [[ "$(id -u)" -eq 0 ]]; then
  RUN_AS="${PG_RUN_AS:-postgres}"
  if ! id "$RUN_AS" >/dev/null 2>&1; then
    echo "Running as root and no '$RUN_AS' user exists to run PostgreSQL as." >&2
    exit 1
  fi
fi

as_pg() {
  if [[ -n "$RUN_AS" ]]; then
    su "$RUN_AS" -c "$1"
  else
    bash -c "$1"
  fi
}

cleanup() {
  as_pg "$PG_BIN/pg_ctl -D $PGDATA_DIR stop -m immediate" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Starting a throwaway PostgreSQL on port $PG_PORT..."
rm -rf "$PGDATA_DIR" "$SOCKET_DIR"
mkdir -p "$PGDATA_DIR" "$SOCKET_DIR"
if [[ -n "$RUN_AS" ]]; then
  chown -R "$RUN_AS" "$PGDATA_DIR" "$SOCKET_DIR"
fi

as_pg "$PG_BIN/initdb -D $PGDATA_DIR -U postgres --auth=trust" >/dev/null
as_pg "$PG_BIN/pg_ctl -D $PGDATA_DIR -o '-k $SOCKET_DIR -p $PG_PORT -c listen_addresses=' -l $PGDATA_DIR/server.log start" >/dev/null

export PGHOST="$SOCKET_DIR" PGPORT="$PG_PORT" PGUSER=postgres

for _ in {1..30}; do
  if psql -d postgres -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 0.5
done

psql -q -d postgres -c "create database $DB_NAME" >/dev/null

echo "Applying the Supabase shim..."
psql -q -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/supabase-shim.sql"

echo "Applying migrations..."
for migration in "$ROOT"/supabase/migrations/*.sql; do
  printf '  %s\n' "$(basename "$migration")"
  psql -q -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$migration"
done

echo "Running tests..."
status=0
for suite in "$ROOT"/supabase/tests/*.test.sql; do
  printf '\n%s\n' "$(basename "$suite")"
  if ! psql -q -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$suite" 2>&1 | sed 's/^NOTICE:  //'; then
    status=1
  fi
done

exit "$status"
