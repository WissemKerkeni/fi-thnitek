#!/usr/bin/env bash
# Nightly encrypted backup (docs/security.md §6, ADR-223).
#
# Dumps PostgreSQL from its container (no Postgres tools needed on the host), encrypts the dump with
# AES-256 (OpenSSL, PBKDF2) before it touches the disk, writes a checksum, copies both off-site with
# rclone when RCLONE_REMOTE is set, mirrors the documents bucket, and prunes old local copies.
#
#   BACKUP_PASSPHRASE_FILE=/etc/fi-thnitek/backup.pass ./backup.sh
#
# Settings (environment):
#   BACKUP_PASSPHRASE_FILE  required; the passphrase, readable by root only. Keep a copy OFF the server.
#   BACKUP_DIR              local folder (default /var/backups/fi-thnitek)
#   PG_CONTAINER            database container (default fi-thnitek-db-1)
#   PGUSER / PGDATABASE     default app / fi_thnitek
#   KEEP_DAYS               local copies to keep (default 14)
#   RCLONE_REMOTE           off-site destination, e.g. "offsite:fi-thnitek" (an rclone crypt remote)
#   RCLONE_DOCS_SOURCE      documents bucket as an rclone path, e.g. "garage:fi-thnitek-documents"
#   DOCKER                  docker binary (default docker)
set -euo pipefail

: "${BACKUP_PASSPHRASE_FILE:?set BACKUP_PASSPHRASE_FILE}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/fi-thnitek}"
PG_CONTAINER="${PG_CONTAINER:-fi-thnitek-db-1}"
PGUSER="${PGUSER:-app}"
PGDATABASE="${PGDATABASE:-fi_thnitek}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DOCKER="${DOCKER:-docker}"

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/db-$stamp.dump.enc"

# Custom format: compressed, restorable table by table. Written to .part and renamed when complete.
"$DOCKER" exec -i "$PG_CONTAINER" pg_dump -U "$PGUSER" -d "$PGDATABASE" -Fc --no-owner --no-privileges \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$BACKUP_PASSPHRASE_FILE" -out "$out.part"
mv "$out.part" "$out"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256")

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$out" "$RCLONE_REMOTE/db/"
  rclone copy "$out.sha256" "$RCLONE_REMOTE/db/"
  if [ -n "${RCLONE_DOCS_SOURCE:-}" ]; then
    # Verification photos are already private; the crypt remote encrypts them again off-site.
    rclone sync "$RCLONE_DOCS_SOURCE" "$RCLONE_REMOTE/documents/"
  fi
fi

find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump.enc*' -mtime +"$KEEP_DAYS" -delete
echo "backup ok: $out ($(wc -c < "$out") bytes)"
