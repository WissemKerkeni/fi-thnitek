# Deployment (free tiers): Render + Supabase + Vercel + Cloudflare

> Decision: ADR-228. Config in the repo: [`render.yaml`](../render.yaml), [`apps/admin/vercel.json`](../apps/admin/vercel.json), [`api.Dockerfile`](../infrastructure/docker/api.Dockerfile), [`infrastructure/cloudflare/keepalive`](../infrastructure/cloudflare/keepalive). Every piece is on a free plan; no payment method is needed.

```
Phones ──HTTPS──► Render free web service (Docker, Frankfurt) ──TLS──► Supabase Postgres + PostGIS (session pooler)
Admin (Vercel) ──HTTPS + CORS──┘          │                      └───► Supabase Storage (S3 API): driver documents
Cloudflare cron ── every 10 min ──► /v1/health (keeps the service and its sweeps awake)
```

Do the steps in this order: Supabase → Render → Vercel → Cloudflare.

## 1. Supabase (database + document storage)
1. **New project**, region **Central EU (Frankfurt)**, free plan. Generate a strong database password and keep it in the password manager. If the form offers **"Enable Data API"**, untick it.
2. **Turn the Data API off** if it is on (Project Settings → Data API). Supabase otherwise publishes `public` tables over REST with the project's public key. Migration `0015` also revokes those grants, but don't rely on that alone.
3. **Connection string:** *Connect* → **Session pooler** (port 5432, user `postgres.<ref>`). Render has no IPv6, and the direct connection is IPv6-only. Don't use the transaction pooler (port 6543). Copy the host as shown: it differs between projects (`aws-0-…`, `aws-1-…`).
4. **CA certificate:** Database Settings → SSL Configuration → **Download certificate**. Supabase signs its certificates with its own root CA, so the API needs this file to verify the connection.
5. **Documents bucket:** Storage → New bucket `fi-documents`, **private**. Storage → Settings → **S3 Connection**: enable it, note the endpoint (`https://<ref>.storage.supabase.co/storage/v1/s3`) and region, then create an S3 access key. That key bypasses Storage policies, so it belongs on the server only.

The tables, PostGIS, the audit trigger and the places are created by the API on its first start (§2).

## 2. API on Render
1. Use a **Render workspace of its own** (workspace menu → New Workspace → Hobby): the free instance hours are per workspace (§6). Render's GitHub app must have access to the repo (GitHub → Settings → Applications → Render → Configure). Then **New → Blueprint**, pick the repo on `main`. Render reads `render.yaml` and creates `fi-thnitek-api` (free, Frankfurt).
2. Fill in the values it asks for:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the session-pooler string from §1.3, with `?sslmode=verify-full&sslrootcert=/etc/secrets/supabase-ca.crt` appended. In the password, write `%` as `%25` (and `#`, `/`, `?`, `@` percent-encoded too), or the API fails at start with "URI malformed" |
   | `CORS_ORIGINS` | the admin URL from §3 (a placeholder for now; no trailing slash) |
   | `GOOGLE_CLIENT_IDS` | the OAuth Web client ID |
   | `ADMIN_EMAILS` | admin Google accounts, comma-separated |
   | `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from §1.5 (`S3_REGION` is preset to `eu-central-1`: change it if Supabase shows another) |
   | `FIREBASE_SERVICE_ACCOUNT_FILE` | empty, or see step 5 |
3. Service → *Environment → Secret Files*: add **`supabase-ca.crt`** with the certificate from §1.4, then *Manual Deploy*.
4. `JWT_SECRET`, `CIN_ENCRYPTION_KEY` and `CIN_HMAC_KEY` are generated once by Render. **Copy the two CIN keys into the password manager:** if they're lost, the encrypted CINs can't be read again. Never rotate them.
5. *(Optional)* **Pushes:** add the Secret File `firebase-service-account.json` and set `FIREBASE_SERVICE_ACCOUNT_FILE=/etc/secrets/firebase-service-account.json`.
6. Each start runs `start.sh` (`infrastructure/docker/api-start.sh`): the migrations, then the places import (idempotent, keeps admin edits), then the server. The free plan has no pre-deploy step, and `dockerCommand` must stay a single path: Render does not pass a quoted `sh -c "…"` through as one argument. Deploys wait for GitHub CI (`autoDeployTrigger: checksPass`). Check `https://<service>.onrender.com/v1/health` → `"database":"up"`.

If the database connection fails with a certificate error, check the Secret File name and path first. As a last resort, `sslmode=no-verify` still encrypts the connection but skips the server check.

## 3. Admin on Vercel (Hobby)
1. **Add New → Project**, import the repo, **Root Directory = `apps/admin`**. The commands and the React Router rewrite come from `apps/admin/vercel.json`.
2. Environment variables:
   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://<service>.onrender.com` |
   | `VITE_GOOGLE_CLIENT_ID` | the OAuth Web client ID |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1` (uses `pnpm@12.8.1` from `package.json`) |
3. Settings → Build & Deployment → Node.js Version **22.x**. Deploy.
4. Put the Vercel URL in the API's `CORS_ORIGINS` on Render, and in the OAuth client's *Authorized JavaScript origins* in Google Cloud. Sign in with an `ADMIN_EMAILS` account.

`VITE_*` values are baked in at build time, so redeploy the admin after changing one.

## 4. Keep-alive on Cloudflare (Workers free plan)
Render puts a free service to sleep after 15 minutes without requests. A sleeping API runs no sweeps: no gap detection, request expiry, break resume or cooldown ends. The Worker pings `/v1/health` every 10 minutes. That request also touches the database, which keeps Supabase from pausing an inactive free project.
```bash
cd infrastructure/cloudflare/keepalive
npx wrangler login
npx wrangler deploy
```
If Render gave the service another hostname, change `API_HEALTH_URL` in `wrangler.toml` first. On a new Cloudflare account the cron is refused ("You need a workers.dev subdomain") until **Workers & Pages** has been opened once in the dashboard; then run `npx wrangler deploy` again. Failed pings show as failed cron runs in the Worker's dashboard.

## 5. Mobile app
The `preview` profile in `apps/mobile/eas.json` sets `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (both public). EAS builds don't upload the git-ignored `apps/mobile/.env`, so the values must be in the profile:
```bash
cd apps/mobile && eas build --profile preview --platform android
```
For a dev build on your PC, set the same `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` and restart Metro.

## 6. Limits of the free setup
- **Render instance hours:** 750 per workspace per month, and one always-on service uses up to 744. **Keep `fi-thnitek-api` alone in its workspace** (`fi-thnitek`): when the hours run out, Render suspends every free service of the workspace until the next month.
- **Render bandwidth:** without a payment method, going over the workspace's included bandwidth suspends the service for the rest of the month. The live map polls every 5 s, so watch usage in the dashboard during field tests.
- **Small machine:** 512 MB, 0.1 CPU. Starts take tens of seconds, and Render may restart free services at any time. Sharing sessions survive a restart; a gap shorter than the `PING_GAP` rule is not a stop.
- **Supabase free:** 500 MB database, 1 GB storage, and projects paused after a week without activity (the keep-alive prevents it). No point-in-time recovery: take a `pg_dump` through the session pooler before risky changes.
- **Vercel Hobby** is for non-commercial use. Move the admin to a paid plan or to Cloudflare Pages before a commercial launch.
- **One instance only:** rate limits and sweeps live in the API process (operations §6).
- **Client IPs:** Express trusts only private proxy hops (`app.factory.ts`). After the first deploy, check that the per-address crash-report limit sees phone addresses, not a shared edge address.
