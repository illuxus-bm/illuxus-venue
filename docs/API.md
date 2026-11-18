# Illuxus Venues API (v1)

REST/JSON API in `server/` (Fastify + Prisma). All paths are under `/api`.
The web app calls it same-origin (`/api`); native apps call the absolute
`VITE_API_URL`.

## Conventions

- **Auth:** `Authorization: Bearer <access token>`.
  - `AUTH_PROVIDER=supabase`: the token is the Supabase session access token.
  - `AUTH_PROVIDER=local`: the token comes from `POST /api/auth/login` / `refresh`.
- **Field names are snake_case** and match the TypeScript types in
  `src/hooks/*` (`Venue`, `VenueMedia`, `MyService`, `BlockedDate`,
  `MyBooking`, `MyQuote`, `MyReview`, `PortfolioItem`, `InboxRfq`,
  `InboxVenueRequest`, `PublicVenue`, `PublicVendorProfile`,
  `PublicVenueDetail`, `VendorStats`).
- **Money** is integer minor units (paise/cents), as numbers.
- **Dates:** date-only columns are `"YYYY-MM-DD"`; timestamps are ISO-8601 UTC.
- **Lists** return a bare JSON array. Single resources return the object.
- **Errors** always have this shape (HTTP status carries the class):
  ```json
  { "error": { "code": "bad_request", "message": "Human-readable, safe to show", "details": [...], "requestId": "…" } }
  ```
  | status | code | meaning |
  | --- | --- | --- |
  | 400 | `bad_request` | validation failed; `details` = `[{ path, message }]` |
  | 401 | `unauthorized` | missing/expired token → refresh, then sign in again |
  | 403 | `forbidden` / `not_a_vendor` | signed in but not allowed |
  | 404 | `not_found` | doesn't exist or isn't yours |
  | 409 | `conflict` | duplicate / state conflict |
  | 429 | `rate_limited` / `locked` | slow down |
  | 503 | `unavailable` | DB down / feature not configured; safe to retry |
- Writes only accept the documented fields; anything else is rejected
  (vendors can't set `verification_status`, `commission_rate`, ratings, ids…).

## Health

| | |
| --- | --- |
| `GET /api/health` | `{ ok: true }` liveness |
| `GET /api/ready` | `{ ok, db, auth, storage, email }`; 503 if DB down |

## Auth (only when `AUTH_PROVIDER=local`)

| | body | returns |
| --- | --- | --- |
| `POST /api/auth/login` | `{ email, password }` | `TokenPair` |
| `POST /api/auth/refresh` | `{ refresh_token }` | `TokenPair` (old refresh token is revoked) |
| `POST /api/auth/logout` | `{ refresh_token }` | `204` |

`TokenPair = { access_token, token_type: "bearer", expires_in, refresh_token, user: { id, email } }`

With `AUTH_PROVIDER=supabase` these return `404`; sign in with supabase-js.

## Session

| | returns |
| --- | --- |
| `GET /api/me` | `{ user: { id, email }, vendor: Vendor \| null }`. `vendor` is null when the account isn't a vendor member (UI shows "not authorized"). |

`Vendor` = the `vendors` row as in `src/integrations/supabase/types.ts`
(`rating_avg`, `commission_rate` as numbers).

All routes below require a vendor member, else `403 not_a_vendor`, and are
scoped to the caller's vendor.

## Profile

| | body | returns |
| --- | --- | --- |
| `PATCH /api/me/vendor` | any of `business_name, tagline, bio, website, city, country, years_experience, response_time_hours, socials (Record<string,string>), notify_email, auto_reply, default_currency` | `Vendor` |
| `PUT /api/me/vendor/image` | `{ kind: "logo" \| "cover", key }` (key from an upload) | `Vendor`; previous file deleted |

## Uploads

| | body | returns |
| --- | --- | --- |
| `POST /api/me/uploads` | `{ kind: "venue-media", venue_id, content_type, size }` or `{ kind: "vendor-media", content_type, size }` | `{ key, uploadUrl, publicUrl, headers }` |

Then `PUT uploadUrl` with the raw file and `headers` (must match the
declared type and size). Limits: venue-media 50 MB (jpeg, png, webp, avif,
gif, mp4, webm, mov, pdf); vendor-media 5 MB (jpeg, png, webp). Then
reference `key` in the create call below. The API builds the URL from the
key; clients never send URLs. `503` if storage isn't configured.

## Venues

| | body | returns |
| --- | --- | --- |
| `GET /api/me/venues` | | `Venue[]` (oldest first) |
| `POST /api/me/venues` | `VenueDraft` | `Venue` (201) |
| `PATCH /api/me/venues/:id` | partial `VenueDraft` (incl. `is_active`) | `Venue` |
| `DELETE /api/me/venues/:id` | | `204`; its media files are deleted too |
| `GET /api/me/venues/:id/media` | | `VenueMedia[]` (cover first, then sort_order, created_at) |
| `POST /api/me/venues/:id/media` | `{ key, media_kind, caption?, is_cover? }` | `VenueMedia` (201) |
| `PATCH /api/me/venue-media/:id` | `{ is_cover?, caption? }` (setting a cover unsets the others atomically) | `VenueMedia` |
| `DELETE /api/me/venue-media/:id` | | `204` |

`map_url` must be http(s). Numbers must be ≥ 0. `name` and `city` required on create.

## Services

| | body | returns |
| --- | --- | --- |
| `GET /api/me/services` | | `MyService[]` |
| `POST /api/me/services` | `{ title, description?, base_price (minor units), currency, unit, duration?, is_instant_book, quote_on_request, is_active, venue_id?, category? }` | `MyService` (201) |
| `PATCH /api/me/services/:id` | partial of the above | `MyService` |
| `DELETE /api/me/services/:id` | | `204` |

`venue_id` must be one of the vendor's venues.

## Availability

| | body | returns |
| --- | --- | --- |
| `GET /api/me/availability` | | `BlockedDate[]` (`held` + `booked`, by date) |
| `POST /api/me/availability` | `{ date: "YYYY-MM-DD", note?, venue_id? }` | `BlockedDate` (201); 409 if already blocked |
| `DELETE /api/me/availability/:id` | | `204`; only `held` (manual) blocks |

## Portfolio

| | body | returns |
| --- | --- | --- |
| `GET /api/me/portfolio` | | `PortfolioItem[]` |
| `POST /api/me/portfolio` | `{ key, caption? }` (vendor-media upload) | `PortfolioItem` (201) |
| `DELETE /api/me/portfolio/:id` | | `204`; file deleted |

## Inbox

| | body | returns |
| --- | --- | --- |
| `GET /api/me/inbox/rfqs` | | `InboxRfq[]` (newest invite first) |
| `POST /api/me/inbox/rfqs/:rfqId/decline` | | `204` |
| `GET /api/me/inbox/venue-requests` | | `InboxVenueRequest[]` (newest first) |
| `POST /api/me/inbox/venue-requests/:selectionId/respond` | `{ status: "accepted" \| "declined" }` | `{ status, emailed: boolean }`; only from `contacted` |

## Quotes

| | body | returns |
| --- | --- | --- |
| `GET /api/me/quotes` | | `MyQuote[]` (newest first) |
| `POST /api/me/quotes` | `{ rfq_id, total (minor units, > 0), currency, valid_until: "YYYY-MM-DD" (≥ today), inclusions?, notes? }` | `MyQuote` (201). 403 if not invited, 409 if a quote exists or the RFQ isn't open |

## Bookings

| | body | returns |
| --- | --- | --- |
| `GET /api/me/bookings` | | `MyBooking[]` (by event date, undated last) |
| `PATCH /api/me/bookings/:id` | `{ status }` or `{ deposit_status }` | `MyBooking` |

Allowed: `pending→confirmed`, `confirmed→in_progress`, `in_progress→completed`,
`pending|confirmed|in_progress→cancelled`; deposit `pending→received`,
`received→refunded`. Confirming blocks the event date; cancelling releases it
(same transaction). Anything else → 409.

## Reviews & stats

| | returns |
| --- | --- |
| `GET /api/me/reviews` | `MyReview[]` (organizer reviews, newest first) |
| `GET /api/me/stats` | `{ openRequests, pendingQuotes, bookings, revenueThisMonth, currency }`; `?tz_offset_minutes=` (from `Date#getTimezoneOffset()`) for the local month start |

## Public (no auth)

| | returns |
| --- | --- |
| `GET /api/public/venues` | `PublicVenue[]` (listed venues with cover) |
| `GET /api/public/venues/:id` | `PublicVenueDetail`, 404 if missing/unlisted/not a UUID |
| `GET /api/public/vendors/:id` | `PublicVendorProfile`, 404 if missing/not a UUID |

Public responses are cacheable (`Cache-Control: public, max-age=60, stale-while-revalidate=300`).
