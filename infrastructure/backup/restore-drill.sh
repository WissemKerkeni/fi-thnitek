#!/usr/bin/env bash
# Monthly restore drill (docs/security.md §6, ADR-223): proves a backup can actually be restored.
#
# Verifies the checksum, decrypts the newest backup (or the one given) into a throwaway PostGIS
# container, restores it, runs sanity checks, prints a report and removes the container. Exits
# non-zero if anything fails. Nothing touches the live database.
#
#   BACKUP_PASSPHRASE_FILE=/etc/fi-thnitek/backup.pass ./restore-drill.sh [backup-file]
#
# Settings: BACKUP_PASSPHRASE_FILE (required), BACKUP_DIR, POSTGIS_IMAGE (default postgis/postgis:16-3.5),
# EXPECTED_MIGRATIONS (default: the number of .sql files in apps/api/drizzle when run from the repo),
# DOCKER (default docker).
set -euo pipefail

: "${BACKUP_PASSPHRASE_FILE:?set BACKUP_PASSPHRASE_FILE}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/fi-thnitek}"
POSTGIS_IMAGE="${POSTGIS_IMAGE:-postgis/postgis:16-3.5}"
DOCKER="${DOCKER:-docker}"
here="$(cd "$(dirname "$0")" && pwd)"
migrations_dir="$here/../../apps/api/drizzle"
if [ -z "${EXPECTED_MIGRATIONS:-}" ] && [ -d "$migrations_dir" ]; then
  EXPECTED_MIGRATIONS="$(find "$migrations_dir" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
fi

file="${1:-$(ls -1t "$BACKUP_DIR"/db-*.dump.enc 2>/dev/null | head -1 || true)}"
[ -n "$file" ] && [ -f "$file" ] || { echo "no backup found in $BACKUP_DIR" >&2; exit 1; }
(cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256" >/dev/null)
echo "checksum ok: $file"

name="fi-restore-drill-$$"
"$DOCKER" run -d --rm --name "$name" -e POSTGRES_USER=app -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill \
  "$POSTGIS_IMAGE" >/dev/null
trap '"$DOCKER" rm -f "$name" >/dev/null 2>&1 || true' EXIT
# 127.0.0.1 answers only once the image's init scripts are done (they use the socket).
for _ in $(seq 1 120); do
  "$DOCKER" exec "$name" pg_isready -h 127.0.0.1 -U app -d drill >/dev/null 2>&1 && break
  sleep 2
done

# A clean database from template0: the image pre-creates its extensions in the default one.
"$DOCKER" exec "$name" createdb -U app -T template0 restored
started=$(date +%s)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$BACKUP_PASSPHRASE_FILE" -in "$file" \
  | "$DOCKER" exec -i "$name" pg_restore -U app -d restored --no-owner --no-privileges --exit-on-error
echo "restored in $(( $(date +%s) - started )) s"

q() { "$DOCKER" exec "$name" psql -U app -d restored -tAc "$1"; }
fail=0
check() { # label, actual, test
  if eval "$3"; then echo "  ok    $1: $2"; else echo "  FAIL  $1: $2"; fail=1; fi
}

migrations="$(q 'SELECT count(*) FROM drizzle.__drizzle_migrations')"
check "migrations" "$migrations" "[ -z \"\${EXPECTED_MIGRATIONS:-}\" ] || [ \"$migrations\" = \"\$EXPECTED_MIGRATIONS\" ]"
postgis="$(q "SELECT ST_DWithin('SRID=4326;POINT(10.18 36.80)'::geography, 'SRID=4326;POINT(10.1801 36.80)'::geography, 50)")"
check "postgis" "$postgis" "[ \"$postgis\" = t ]"
trigger="$(q "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relname = 'audit_logs' AND NOT t.tgisinternal")"
check "audit insert-only trigger" "$trigger" "[ \"$trigger\" -ge 1 ]"
for table in users driver_profiles places passenger_requests sharing_sessions reports sanctions audit.audit_logs; do
  rows="$(q "SELECT count(*) FROM $table")"
  check "rows in $table" "$rows" "[ \"$rows\" -ge 0 ]"
done
live="$(q 'SELECT count(*) FROM driver_live_locations')"
echo "  info  live locations in the dump: $live (sessions in progress at backup time)"

if [ "$fail" -ne 0 ]; then echo "restore drill FAILED" >&2; exit 1; fi
echo "restore drill ok: $(basename "$file")"
