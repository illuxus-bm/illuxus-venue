# Illuxus Venues

The venue-partner app in the Illuxus platform. Venue businesses list their
spaces, manage media, services and availability, answer organizer requests,
send quotes and run bookings. Organizers book through the main **illuxus**
app; both apps share one Supabase backend.

It ships as a **web app / installable PWA** (Vercel) and as **native Android
and iOS apps** (Capacitor), all from the same codebase.

## Getting started

```sh
npm ci
cp .env.example .env        # paste values from the shared Supabase project
npm run dev                 # http://localhost:8081
```

Requires Node 22+. See `.env.example` for every variable.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :8081 |
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
  Query, react-hook-form + zod, Supabase (auth, Postgres, storage, realtime),
  Capacitor 8 for Android / iOS.
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
