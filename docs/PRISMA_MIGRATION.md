# Supabase → Prisma migration (branch `master`)

On `main`, the web and native apps talk to Supabase directly (PostgREST,
RLS, Storage, Realtime, an edge function). On `master`, they talk to the
**Illuxus Venues API** (`server/`, Fastify + Prisma 7). Only the API talks
to the database. That database can stay on **Supabase Postgres** or move to
**AWS (RDS / Aurora Postgres)**; nothing in the code changes, only
configuration.

```
 Web (Vercel) ─┐                        ┌─ Postgres: Supabase or AWS RDS/Aurora
 Android ──────┼─► /api  (Fastify + Prisma) ┼─ Storage: Supabase Storage (S3 API) or AWS S3
 iOS ──────────┘        authz · validation  ├─ Email:   any SMTP (AWS SES, Postmark…)
                                             └─ Auth:    Supabase Auth JWTs or built-in (argon2 + JWT)
```

## What changed, and what replaced it

| Supabase feature (main) | On master |
| --- | --- |
| PostgREST queries from the browser | REST endpoints in `server/src/routes` (contract: `docs/API.md`) |
| Row Level Security | Every `/api/me/*` route is scoped to the caller's vendor; writes accept whitelisted fields only (zod `.strict()`), the equivalent of RLS + migration 111's column guards. RLS stays on in Supabase as defence in depth. |
| SQL functions (`vendor_venue_requests`, `vendor_public_reviews`, rating trigger, booking→calendar trigger) | Ported to TypeScript (`inbox.ts`, `public.ts`, `ratings.ts`, `bookings.ts`), so they also work on AWS where those functions don't exist |
| Supabase Storage uploads from the browser | Presigned S3 PUTs (`POST /api/me/uploads`), so files still go straight to the bucket. Type and size are part of the signature. The API builds every stored URL from the key, so clients can't store `javascript:` URLs. |
| Edge function `notify-organizer-venue-response` | `POST /api/me/inbox/venue-requests/:id/respond`, which emails via SMTP |
| Realtime subscriptions | Polling every 30s while visible + refetch on focus / app resume |
| Supabase Auth | Choose with `AUTH_PROVIDER` (below) |

## Prisma setup

- Schema: `server/prisma/schema.prisma`, **introspected from an exact replica
  of the live Supabase project** (`illuxus`, ref `xhjdcimginceibzcwzlk`): the
  27 tables' DDL was exported read-only from the production catalog on
  2026-11-18. No cross-schema relations, so it's portable to AWS.
- Migrations: `server/prisma/migrations/`
  - `0_init`: exactly the live tables, indexes and foreign keys.
  - `1_portable_constraints`: the live CHECK constraints and expression/partial
    indexes Prisma can't model. Idempotent: a no-op on Supabase.
  - `2_integrity_rules`: the portable part of SQL migration 111 (one booking
    per quote, one business per user, one review per booking side, http(s)-only
    URLs, non-negative capacities). It's skipped with a NOTICE if existing rows
    would violate a unique rule; CHECKs are `NOT VALID`.
  - `3_self_hosted_auth`: `app_users` / `auth_sessions`, used only with
    `AUTH_PROVIDER=local`. They sit empty and unused on Supabase.
- `supabase/tests/01_base_schema_stub.sql` is the same live DDL, so the
  Supabase-mode tests run on production's real table shapes.
- Config: `prisma.config.ts`. The CLI uses `DIRECT_URL`; the API uses
  `DATABASE_URL` through `@prisma/adapter-pg`.
- The client is generated on `npm install` (`postinstall`) into
  `server/src/generated` (git-ignored).

CI proves three things on every push: a fresh DB built by
`prisma migrate deploy` matches the schema (no drift), the API suite passes
on that DB, and it passes on a Supabase-shaped DB baselined for Prisma.

## Path A: keep the data on Supabase

1. **Schema reconciliation is done** (2026-11-18, against the live project).
   It changed real things: columns the reconstructed schema assumed but
   production doesn't have (for example `vendor_services.sort_order`,
   `vendor_availability.created_at`, `rfqs.created_by`) would have made the
   Services, Availability and Inbox endpoints fail in production. Re-check
   whenever the main app changes these tables:
   `DIRECT_URL=… npm run db:pull > /tmp/live.prisma && diff server/prisma/schema.prisma /tmp/live.prisma`.
2. **Apply SQL migration 111** in the Supabase SQL editor (it's verified to apply
   cleanly on the live table shapes; it skips indexes that already exist).
3. **Baseline Prisma** (the tables already exist, so don't create them):
   ```sh
   DIRECT_URL=… npm run db:baseline    # marks 0_init applied, then applies 1-3
   ```
   Both paths are checked locally: a fresh `migrate deploy` and a baselined
   live replica each end with **zero drift** against `schema.prisma`.
4. **API env:** `AUTH_PROVIDER=supabase`, `SUPABASE_URL`,
   `DATABASE_URL` (pooler :6543 is fine), `DATABASE_SSL=require`, and storage
   via Supabase's S3 endpoint (*Project Settings → Storage → S3 access keys*).
5. **Web/native env:** `VITE_AUTH_PROVIDER=supabase`, the Supabase URL and
   publishable key (sign-in only), and `VITE_API_URL`.

Users keep their existing accounts and passwords.

## Path B: move to AWS

1. **Database:** RDS/Aurora PostgreSQL 15+. `DIRECT_URL=… npm run db:deploy`
   creates everything. To copy data from Supabase:
   `pg_dump --data-only --schema=public --exclude-table=_prisma_migrations …`,
   then `psql` into RDS (load parents before children, or wrap in
   `SET session_replication_role = replica`).
2. **Storage:** two S3 buckets (`venue-media`, `vendor-media`), public read
   through CloudFront (`STORAGE_PUBLIC_BASE_URL` = the distribution, with the
   origin path mapping `/<bucket>/<key>`). Bucket CORS must allow `PUT` from
   the web origin and `https://localhost`, `capacitor://localhost`. Copy
   objects with `aws s3 sync` from Supabase's S3 endpoint, then rewrite URLs:
   `update venue_media set url = replace(url, '<old base>', '<new base>');`
   (and the same for `vendor_portfolio.url`, `vendors.logo_url`, `vendors.cover_url`).
3. **Auth:** `AUTH_PROVIDER=local` + `JWT_SECRET` (`openssl rand -hex 32`).
   Invite users with `npm run user:create -- --email … --business "…"`.
   Supabase password hashes aren't exportable in a usable form, so existing
   vendors get a new password (or keep `AUTH_PROVIDER=supabase` on AWS: Supabase
   Auth works with any database).
4. **Email:** SES SMTP credentials → `SMTP_URL`.
5. **Run the API:** the Docker image (`Dockerfile`) on ECS Fargate / App
   Runner behind an ALB; health check `/api/health`, readiness `/api/ready`.
   Run `npx prisma migrate deploy` as a one-off task from the same image
   before each release.
6. **Clients:** `VITE_AUTH_PROVIDER=local`, `VITE_API_URL=https://api.<domain>/api`,
   and add the API and CloudFront origins to `vercel.json`'s CSP
   (`connect-src`, `img-src`, `media-src`). `*.amazonaws.com` /
   `*.cloudfront.net` are already allowed.

**The main illuxus app shares this database.** Moving the database to AWS
moves it for the main app too. Migrate both together, or keep Path A until
the main app is ready.

## Where the API runs

| Option | How | Notes |
| --- | --- | --- |
| Vercel (same project as the web app) | `api/[...path].ts` → `server/src/vercel.ts` | Same-origin `/api`, nothing else to host. Use a pooled `DATABASE_URL` and `DB_POOL_MAX=1-3`. |
| AWS ECS / App Runner / EC2 | `Dockerfile` | Long-running, graceful SIGTERM shutdown, non-root, healthcheck. |
| Local | `npm run api:dev`, or `docker compose up` (Postgres + MinIO + API) | Vite proxies `/api` to `:8787`. |

## Reliability behaviour

- **Configuration** is validated at boot (`server/src/env.ts`). Bad config
  stops the process with a list of what's wrong; it never fails per request.
- **Errors** always return `{ error: { code, message, requestId } }`. DB
  outages and timeouts are **503** (retryable), not 500, and the process
  keeps serving. Unknown errors are a generic 500; details go only to logs,
  keyed by `requestId`.
- **DB:** pooled connections, 10s connect timeout, 15s statement timeout
  (direct connections) plus a client-side query timeout. Race-prone updates
  (booking status, request responses, cover photo) use conditional updates
  inside transactions.
- **Process:** `unhandledRejection` is logged without crashing.
  `uncaughtException` drains and exits so the orchestrator restarts a clean
  process.
- **Security:** helmet, CORS allowlist, per-IP rate limits (login 10/min),
  1 MB body limit, argon2id, refresh-token rotation with reuse detection,
  account lockout, secrets redacted from logs.
- **Clients:** 20s request timeout, friendly offline errors, one silent token
  refresh on 401, retries only for network/5xx errors, error states with
  "Try again" in every screen, and the app-wide error boundary from `main`.
