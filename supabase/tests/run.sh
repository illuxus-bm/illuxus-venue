#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# supabase/tests/run.sh [DB_NAME]
#
# (Re)creates DB_NAME (default: illuxus_migrations_test) on a plain Postgres,
# applies the Supabase stub (00), the inferred base schema (01), every
# supabase/migrations/*.sql in order, then each supabase/tests/test_*.sql.
# Stops with a non-zero exit on the first failure.
#
# Connection: PGHOST / PGPORT / PGUSER (defaults below; PGPASSWORD honoured).
# -----------------------------------------------------------------------------
set -euo pipefail

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
# Hide the "does not exist, skipping" NOTICEs from idempotent DDL.
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"

DB="${1:-illuxus_migrations_test}"
if [[ ! "$DB" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "run.sh: invalid database name: $DB" >&2
  exit 2
fi

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(cd "$TESTS_DIR/../migrations" && pwd)"
REPO_ROOT="$(cd "$TESTS_DIR/../.." && pwd)"

PSQL=(psql -X -v ON_ERROR_STOP=1 -q --no-psqlrc)

apply() {
  local file="$1"
  echo "==> ${file#"$REPO_ROOT/"}"
  if ! "${PSQL[@]}" -d "$DB" -f "$file"; then
    echo "FAILED: $file" >&2
    exit 1
  fi
}

echo "==> recreating database $DB on ${PGHOST}:${PGPORT}"
"${PSQL[@]}" -d postgres -c "SET client_min_messages = warning" -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE \"$DB\""

apply "$TESTS_DIR/00_supabase_stub.sql"
apply "$TESTS_DIR/01_base_schema_stub.sql"

shopt -s nullglob
migrations=("$MIGRATIONS_DIR"/*.sql)
if (( ${#migrations[@]} == 0 )); then
  echo "run.sh: no migrations found in $MIGRATIONS_DIR" >&2
  exit 1
fi
# Glob order is locale-sorted; force byte order so 100_ < 101_ < ... always.
mapfile -t migrations < <(printf '%s\n' "${migrations[@]}" | LC_ALL=C sort)
for f in "${migrations[@]}"; do
  apply "$f"
done

tests=("$TESTS_DIR"/test_*.sql)
if (( ${#tests[@]} == 0 )); then
  echo "==> no test_*.sql files; migrations applied cleanly"
  exit 0
fi
mapfile -t tests < <(printf '%s\n' "${tests[@]}" | LC_ALL=C sort)
for t in "${tests[@]}"; do
  apply "$t"
done

echo "==> all ${#migrations[@]} migrations and ${#tests[@]} test file(s) passed"
