# Illuxus Venues

The venue-partner app in the Illuxus platform. Venue businesses list their
spaces, manage media, services and availability, answer organizer requests,
send quotes and run bookings. Organizers book through the main **illuxus**
app; both apps share one Supabase backend.

It ships as a **web app / installable PWA** (Vercel) and as **native Android
and iOS apps** (Capacitor), all from the same codebase.

> **Branch `master`:** the apps no longer talk to Supabase directly. They call
> the **Illuxus Venues API** (`server/`, Fastify + Prisma 7), which runs
> against **Supabase Postgres or AWS RDS/Aurora**, with Supabase Auth or
> built-in auth, and Supabase Storage or S3. See
> [docs/PRISMA_MIGRATION.md](docs/PRISMA_MIGRATION.md) and the endpoint
> contract in [docs/API.md](docs/API.md).

## Getting started

```sh
npm ci                      # also generates the Prisma client
cp .env.example .env        # web app settings (VITE_*)
# API settings: see server/.env.example (same .env file works for both)
npm run api:dev             # API on http://localhost:8787
npm run dev                 # web on http://localhost:8081 (proxies /api)
```

Or run Postgres + S3 (MinIO) + the API in containers: `docker compose up --build`.

Requires Node 22+. See `.env.example` for every variable.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :8081 (proxies `/api` → :8787) |
| `npm run api:dev` / `api:build` / `api:start` | API server (watch / compile / run compiled) |
| `npm run test:api` | API integration tests on Postgres (`TEST_PG_URL`, `TEST_DB_FLAVOR=aws\|supabase`) |
| `npm run db:deploy` / `db:status` / `db:baseline` / `db:pull` | Prisma migrations (uses `DIRECT_URL`) |
| `npm run user:create` | Invite a portal user (self-hosted auth) |
| `npm run check` | lint + typecheck + unit tests + production build (what CI runs) |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run typecheck` | `tsc` over app and config sources |
| `npm test` | Vitest unit tests |
| `npm run test:db` | Applies every migration to a scratch Postgres and runs the RLS / security tests (`PGHOST`, `PGPORT`, `PGUSER`) |
| `npm run build` | Web build with service worker → `dist/` |
| `npm run cap:sync` | Native build (no service worker) + copy into `android/` and `ios/` |
| `npm run cap:android` / `cap:ios` | Sync, then open Android Studio / Xcode |
| `npm run android:release` | Signed release bundle (`.aab`) |
| `npm run cap:assets` | Regenerate app icons + splash screens from `resources/` |

## Routes

| Route | Audience | Purpose |
| --- | --- | --- |
| `/` | Public | Landing page: venues on Illuxus |
| `/v/:vendorId` | Public | A venue business's profile |
| `/venues/:venueId` | Public | One venue: gallery, capacity, rules, services |
| `/vendor/login` | Public | Sign in (supports a same-origin `?next=`) |
| `/vendor/signup` | Public | Invite-only notice |
| `/vendor?tab=…` | Vendor | Dashboard: Overview, Inbox, Venues, Quotes, Bookings, Services, Portfolio, Availability, Reviews, Profile |

## Architecture

- **Stack:** Vite + React 18 + TypeScript, Tailwind + shadcn/ui, TanStack
  Query, react-hook-form + zod, Capacitor 8 for Android / iOS. API: Fastify 5
  + Prisma 7 (pg driver adapter) + zod, S3-compatible storage, SMTP email.
- **Routes are code-split**; vendor libraries are split into long-cacheable
  chunks.
- **Security is enforced in the database.** RLS, column guards and storage
  policies live in `supabase/migrations/`. The client-side allowlist and
  URL checks are UX and defence in depth, not the boundary. See migration
  `111_security_hardening.sql` and its tests in `supabase/tests/`.
- **Untrusted URLs** (organizer links, map links, media URLs) always go
  through `src/lib/safeUrl.ts` before reaching an `href`.
- **Errors**: a top-level error boundary, retryable error states in every
  tab, and optional reporting via `VITE_ERROR_REPORT_URL`
  (`src/lib/monitoring.ts`).
- **Native shell** (`src/lib/native.ts`): Android back button, status bar
  that follows the theme, splash screen, external links in the system
  browser, safe-area insets.

## Releasing

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the web, database, Android
and iOS release runbooks.
