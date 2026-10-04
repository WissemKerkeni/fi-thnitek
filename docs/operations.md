# Operations runbook (v0.x)

> Day-to-day running of the single-VPS setup (architecture §1, ADR-007). Decisions: ADR-223.

## 1. Backups (docs/security.md §6)
- **What:** PostgreSQL (everything except the photos) and the private documents bucket (Garage).
- **How:** `infrastructure/backup/backup.sh` dumps the database from its container (`pg_dump -Fc`), encrypts it with AES-256 (OpenSSL, PBKDF2, 200 000 iterations) before it touches the disk, writes a SHA-256, copies both off-site with **rclone** to a **crypt** remote, and mirrors the documents bucket to the same remote. Local copies are kept 14 days.
- **Schedule (root crontab on the VPS):**
  ```cron
  15 2 * * *  BACKUP_PASSPHRASE_FILE=/etc/fi-thnitek/backup.pass RCLONE_REMOTE=offsite:fi-thnitek RCLONE_DOCS_SOURCE=garage:fi-thnitek-documents /opt/fi-thnitek/infrastructure/backup/backup.sh >> /var/log/fi-thnitek-backup.log 2>&1
  30 3 1 * *  BACKUP_PASSPHRASE_FILE=/etc/fi-thnitek/backup.pass /opt/fi-thnitek/infrastructure/backup/restore-drill.sh >> /var/log/fi-thnitek-restore-drill.log 2>&1
  ```
- **Secrets:** the passphrase file (`chmod 400`, root) and the rclone config. **Keep a copy of both outside the server** (password manager of two people): without the passphrase, the backups cannot be read by anyone, us included.
- **Off-site location:** pending the INPDP advice on transfers (research-tunisia §4); a Tunisian provider avoids the question.

## 2. Restore drill (monthly) and real restore
- `restore-drill.sh` verifies the checksum, restores the newest backup into a **throwaway** PostGIS container (never the live database) and checks: migrations count = the repo's, PostGIS answers, the audit insert-only trigger exists, the main tables have rows. Any failure exits non-zero (the cron log shows `FAILED`).
- First drill: 2026-10-04 on the dev database — 13 migrations, restore in 2 s, all checks ok.
- **Real restore** (disaster): stop the API, create an empty database, then
  `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:… -in db-….dump.enc | docker exec -i <db> pg_restore -U app -d fi_thnitek --no-owner --exit-on-error`,
  run the migrations (`pnpm db:migrate`, applies only newer ones), restore the documents with `rclone sync offsite:fi-thnitek/documents garage:fi-thnitek-documents`, start the API. Live positions are not worth restoring: sharing sessions open at backup time end by themselves (`PING_GAP`).

## 3. Retention (domain-model §4)
Runs daily at 03:30 Tunis (`RetentionService`), idempotent:
| Data | Rule |
|---|---|
| Closed requests | after 30 days, anchor and destination become the centre of a ~1 km cell; the latest point is dropped |
| Sharing sessions + events | deleted 12 months after they ended |
| Pick-up records | deleted after 90 days, unless an open report points at the request |
| Crash reports | deleted after 90 days |
| Audit logs | kept (insert-only by design); the 24-month purge needs a separate maintenance role — Phase 10 |
| Verification photos | purge rule waiting for legal confirmation (domain-model §4) |
Each run writes a `retention.run` audit entry with the counts.

## 4. Crash monitoring
- Phones send crashes to `POST /v1/client-errors` (no account, no position): scrubbed on the phone and again on the server (coordinates, e-mails, phone numbers, tokens). Rate-limited per install (10/h) and per address (60/h).
- **Admin → Erreurs** groups them by fingerprint (name + message without numbers + first stack frame), with counts, devices and app versions. Look after every release and after field tests.
- Server errors stay in the API logs (pino, no PII by rule 8).

## 5. Threshold tuning
- **Admin → Mesures terrain** for a period: delay before visible, anchor accuracy, wait before leaving, close reasons, session ends, pick-up distances, reports — each next to its threshold. Aggregates only.
- Change a value only in `packages/domain/src/config/thresholds.ts` (+ `docs/domain-model.md` §3 and the thresholds test), with an ADR line saying which measurement justified it. Procedure for a field day: [field-test.md](field-test.md).

## 6. Rate limits (in memory, one API process)
Pings 1 per 3 s per user; live map 5 per 10 s per user (bursts while panning); crash reports as above. A 429 loses nothing: the phone keeps its buffer or its last map.

## 7. Load check
`pnpm --filter @fi-thnitek/api test:load` seeds pilot density (500 sharing drivers, 300 waiting passengers) in a throwaway database and polls a 20 km view from 40 viewers, 25 at a time; it fails if p95 ≥ 300 ms (NFR-02). Run it before a release that touches the map. Last result (2026-10-04, dev PC): p95 180 ms at 176 polls/s.
