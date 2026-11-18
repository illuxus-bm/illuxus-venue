# Deployment & release runbook

One codebase, four deliverables: the web app (Vercel), the database
migrations (Supabase), the Android app (Play Store) and the iOS app
(App Store). CI (`.github/workflows/ci.yml`) builds and tests all of them on
every push and pull request.

## 1. Database (do this first)

Migrations live in `supabase/migrations/` and apply in filename order on the
**shared** Illuxus Supabase project.

1. Verify locally against a scratch Postgres 16:
   ```sh
   PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run test:db
   ```
   This applies a Supabase stub (`supabase/tests/00_*`), an inferred stand-in
   for the main app's base tables (`01_*`), every migration, then the
   behavioural security tests (`test_*.sql`).
2. Apply to staging, then production: Supabase SQL editor, or
   `supabase db push` if the project is linked.
3. Migration `111_security_hardening.sql` is safe to re-run. If it prints a
   NOTICE about duplicate rows (bookings per quote, members per user, reviews
   per booking), clean those rows and run it again to add the unique index.
4. **Coordinate with the main illuxus app.** 111 blocks *direct client*
   updates to booking parties and amounts, quote parents and vendor
   verification / commission / rating columns. Server-side paths (SECURITY
   DEFINER functions, service role) are unaffected. Before applying in
   production, check the main app doesn't write those columns directly from
   the browser.

## 2. Web (Vercel)

- Environment variables (Project → Settings → Environment Variables):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_ILLUXUS_ORIGIN`, optional `VITE_VENDOR_ALLOWED_EMAILS`,
  `VITE_ERROR_REPORT_URL`, `VITE_APP_VERSION`.
- `vercel.json` sets the SPA rewrite, long-term caching for hashed assets,
  no-cache for `index.html` / `sw.js`, `noindex` on `/vendor`, and the
  security headers (HSTS, CSP, frame-ancestors, nosniff, Permissions-Policy).
- **CSP:** the inline theme script in `index.html` is allowed by its SHA-256
  hash. If you edit that script, update the hash in `vercel.json`; the unit
  test `deployConfig.test.ts` fails until you do. If `VITE_ERROR_REPORT_URL`
  points outside `*.supabase.co`, add its origin to `connect-src`.
- **Supabase Auth URLs:** add the production origin to *Authentication →
  URL Configuration → Redirect URLs* (`https://<domain>/vendor/login`).
- The PWA service worker auto-updates; users get the new build on next load.

## 3. Android (Google Play)

Identity: `com.illuxus.venues`, debug builds install side by side as
`com.illuxus.venues.debug`. Version name comes from `package.json`;
version code is `major*10000 + minor*100 + patch`, or `ANDROID_VERSION_CODE`
in CI.

1. **Create the upload key once** and keep it out of git:
   ```sh
   keytool -genkey -v -keystore illuxus-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Local release: create `android/keystore.properties` (git-ignored):
   ```properties
   storeFile=/absolute/path/illuxus-upload.jks
   storePassword=…
   keyAlias=upload
   keyPassword=…
   ```
   then `npm run android:release` → `android/app/build/outputs/bundle/release/app-release.aab`.
3. CI release: push a tag `vX.Y.Z`. The `android-release` job (GitHub
   environment `production`) needs secrets `ANDROID_KEYSTORE_BASE64`
   (`base64 -w0 illuxus-upload.jks`), `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, and variables `VITE_ILLUXUS_ORIGIN`,
   `VITE_VENDOR_ALLOWED_EMAILS`, `VITE_ERROR_REPORT_URL`.
4. Upload the `.aab` to Play Console (internal testing first). Enrol in Play
   App Signing.
5. Hardening already in place: HTTPS-only network security config, no
   cloud backup / device transfer of app data (it holds the session), R8
   minification + resource shrinking, Android 11+ intent visibility for
   links, email and phone, WebView debugging off in release.

Play Console checklist: privacy policy URL, Data safety form (email
address for account management; photos and videos the user uploads; no
tracking), content rating, target audience (business users), screenshots.

## 4. iOS (App Store)

Identity: `com.illuxus.venues`, minimum iOS 15. Building requires a Mac
with the current Xcode.

1. `npm ci && npm run cap:ios` opens `ios/App/App.xcodeproj`.
2. *Signing & Capabilities*: select the team, keep automatic signing.
3. Set **Version** to match `package.json` (also `MARKETING_VERSION`) and
   bump **Build** for each upload.
4. *Product → Archive → Distribute App → App Store Connect*.
5. Already configured in `Info.plist`: camera / microphone / photo-library
   usage strings (the WebView file picker needs them), arm64 device
   requirement, `ITSAppUsesNonExemptEncryption = false` (HTTPS only), so
   export compliance doesn't block TestFlight.

App Store Connect checklist: privacy policy URL, App Privacy answers
(contact info: email, linked to the user, not used for tracking; user
content: photos/videos), a **demo account** for App Review (the portal is
invite-only, so add the reviewer's email to `vendor_email_allowlist`),
screenshots for 6.9" and 6.5" iPhones and 13" iPad.

## 5. Release checklist

- [ ] `npm run check` and `npm run test:db` pass; CI is green
- [ ] Migrations applied to staging, smoke-tested, then production
- [ ] Vercel production env vars set; Supabase redirect URLs include the domain
- [ ] Version bumped in `package.json` (and iOS build number)
- [ ] Tag `vX.Y.Z` pushed; Android `.aab` downloaded from the workflow run
- [ ] iOS archive uploaded from Xcode; TestFlight build verified
- [ ] Rollback plan: Vercel *Promote previous deployment*; Play staged
      rollout halt; App Store phased release pause
