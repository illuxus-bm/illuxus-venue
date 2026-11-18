-- =============================================================================
-- 01_base_schema_stub.sql
--
-- INFERRED STAND-IN for the shared Illuxus base schema. FOR TESTS ONLY.
--
-- The real tables live in the shared Illuxus Supabase project (created by the
-- main app / Lovable) and are NOT in this repo. supabase/migrations/100+ only
-- add RLS, functions, triggers and storage policies on top of them. This file
-- recreates those tables with columns, keys, FKs, CHECKs and unique
-- constraints inferred from:
--   • the migrations themselves (columns their functions / policies use), and
--   • the frontend (src/hooks/*.ts, src/pages/**, src/contexts/
--     VendorAuthContext.tsx, src/integrations/supabase/types.ts).
--
-- Where the real shape is unknown, choices are conservative and noted inline.
-- It may drift from production; if a migration depends on a detail not seen
-- here, extend this file rather than the migration.
--
-- Deliberately NOT created here (the migrations create them):
--   venues, venue_media (106), vendor_email_allowlist (105).
-- RLS is NOT enabled here; the migrations do that.
-- Requires 00_supabase_stub.sql (auth.users, gen_random_uuid, roles).
-- =============================================================================

\set ON_ERROR_STOP 1
SET client_min_messages = warning;


-- -----------------------------------------------------------------------------
-- Organizer side (main Illuxus app)
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name        text,
  first_name          text,
  last_name           text,
  avatar_url          text,
  mobile_country_code text,
  mobile_number       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  owner_id   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.org_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member'
             CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

-- Types match vendor_venue_requests() (109): date/end_date timestamptz,
-- capacity int, the rest text.
CREATE TABLE public.events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id              uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  title                text NOT NULL,
  description          text,
  date                 timestamptz,
  end_date             timestamptz,
  timezone             text,
  location             text,
  venue                text,
  capacity             integer,
  event_format         text,
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  banner_landscape_url text,
  banner_portrait_url  text,
  image_url            text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR date IS NULL OR end_date >= date)
);


-- -----------------------------------------------------------------------------
-- Vendor identity + taxonomy
-- -----------------------------------------------------------------------------
-- Column list from types.ts (vendors Row). Return types of
-- get_marketplace_vendors() (100) pin rating_avg numeric, rating_count int,
-- response_time_hours int.
CREATE TABLE public.vendors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name       text NOT NULL,
  tagline             text,
  bio                 text,
  website             text,
  city                text,
  country             text,
  logo_url            text,
  cover_url           text,
  years_experience    integer CHECK (years_experience IS NULL OR years_experience >= 0),
  response_time_hours integer CHECK (response_time_hours IS NULL OR response_time_hours >= 0),
  socials             jsonb DEFAULT '{}'::jsonb,
  notify_email        boolean NOT NULL DEFAULT true,
  auto_reply          text,
  default_currency    text NOT NULL DEFAULT 'USD',
  rating_avg          numeric(3,2) DEFAULT 0,
  rating_count        integer NOT NULL DEFAULT 0,
  verification_status text NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  commission_rate     numeric(5,2) NOT NULL DEFAULT 10.00
                      CHECK (commission_rate >= 0 AND commission_rate <= 100),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'staff'
             CHECK (role IN ('owner', 'manager', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, user_id)
);

-- 104 does INSERT ... (slug, name, icon) ON CONFLICT (slug).
CREATE TABLE public.vendor_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  icon       text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_category_map (
  vendor_id   uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.vendor_categories (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, category_id)
);


-- -----------------------------------------------------------------------------
-- Rate card / portfolio / areas
-- -----------------------------------------------------------------------------
-- 108 adds venue_id + category.
CREATE TABLE public.vendor_services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  base_price       bigint NOT NULL DEFAULT 0 CHECK (base_price >= 0),   -- minor units
  currency         text NOT NULL DEFAULT 'USD',
  unit             text NOT NULL DEFAULT 'per_event'
                   CHECK (unit IN ('per_hour', 'per_event', 'per_person', 'per_day', 'flat')),
  duration         text,
  is_instant_book  boolean NOT NULL DEFAULT false,
  quote_on_request boolean NOT NULL DEFAULT false,
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_service_addons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid NOT NULL REFERENCES public.vendor_services (id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  price       bigint NOT NULL DEFAULT 0 CHECK (price >= 0),   -- minor units
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Shape unknown in this repo (usePublicProfile picks city/area/name/...).
CREATE TABLE public.vendor_service_areas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  city       text NOT NULL,
  country    text,
  radius_km  integer CHECK (radius_km IS NULL OR radius_km >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, city)
);

CREATE TABLE public.vendor_portfolio (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  url        text NOT NULL,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  caption    text,
  is_cover   boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- RFQ -> quote -> booking pipeline
-- -----------------------------------------------------------------------------
-- useInboxRfqs embeds vendor_categories from rfqs, so rfqs.category_id FK.
CREATE TABLE public.rfqs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  event_id        uuid REFERENCES public.events (id) ON DELETE SET NULL,
  category_id     uuid REFERENCES public.vendor_categories (id) ON DELETE SET NULL,
  created_by      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  requirements    text NOT NULL DEFAULT '',
  event_city      text,
  event_date      date,
  expected_guests integer CHECK (expected_guests IS NULL OR expected_guests >= 0),
  budget_min      bigint CHECK (budget_min IS NULL OR budget_min >= 0),   -- minor units
  budget_max      bigint CHECK (budget_max IS NULL OR budget_max >= 0),
  currency        text NOT NULL DEFAULT 'USD',
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'quoted', 'accepted', 'expired', 'cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_max >= budget_min)
);

CREATE TABLE public.rfq_invitees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id       uuid NOT NULL REFERENCES public.rfqs (id) ON DELETE CASCADE,
  vendor_id    uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  invited_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  declined     boolean NOT NULL DEFAULT false,
  UNIQUE (rfq_id, vendor_id)
);

-- SendQuoteDialog relies on UNIQUE (rfq_id, vendor_id).
CREATE TABLE public.quotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id      uuid NOT NULL REFERENCES public.rfqs (id) ON DELETE CASCADE,
  vendor_id   uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  total       bigint NOT NULL CHECK (total >= 0),   -- minor units
  currency    text NOT NULL DEFAULT 'USD',
  valid_until date,
  inclusions  text,
  notes       text,
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, vendor_id)
);

CREATE TABLE public.quote_line_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES public.quotes (id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity    numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price  bigint NOT NULL DEFAULT 0 CHECK (unit_price >= 0),   -- minor units
  amount      bigint NOT NULL DEFAULT 0 CHECK (amount >= 0),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Columns from accept_vendor_quote() (100) + useMyBookings.
CREATE TABLE public.vendor_bookings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          uuid REFERENCES public.quotes (id) ON DELETE SET NULL,
  rfq_id            uuid REFERENCES public.rfqs (id) ON DELETE SET NULL,
  org_id            uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  vendor_id         uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  event_id          uuid REFERENCES public.events (id) ON DELETE SET NULL,
  total             bigint NOT NULL DEFAULT 0 CHECK (total >= 0),   -- minor units
  currency          text NOT NULL DEFAULT 'USD',
  commission_rate   numeric(5,2) NOT NULL DEFAULT 10.00,
  commission_amount bigint NOT NULL DEFAULT 0,
  event_date        date,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  deposit_status    text NOT NULL DEFAULT 'pending'
                    CHECK (deposit_status IN ('pending', 'received', 'refunded')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
  -- one-booking-per-quote is added by migration 111, not assumed here
);

CREATE TABLE public.booking_milestones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES public.vendor_bookings (id) ON DELETE CASCADE,
  label        text NOT NULL,
  amount       bigint NOT NULL DEFAULT 0 CHECK (amount >= 0),   -- minor units
  due_date     date,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'paid', 'completed', 'waived')),
  sort_order   integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE (vendor_id, date) is the Lovable baseline constraint that 108 swaps
-- for a venue-aware unique index. booking_id written by
-- vendor_bookings_sync_availability() (100). 108 adds venue_id.
CREATE TABLE public.vendor_availability (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  date       date NOT NULL,
  status     text NOT NULL DEFAULT 'held'
             CHECK (status IN ('available', 'held', 'booked')),
  note       text,
  booking_id uuid REFERENCES public.vendor_bookings (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, date)
);


-- -----------------------------------------------------------------------------
-- Messaging
-- -----------------------------------------------------------------------------
CREATE TABLE public.vendor_message_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  vendor_id       uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  rfq_id          uuid REFERENCES public.rfqs (id) ON DELETE SET NULL,
  booking_id      uuid REFERENCES public.vendor_bookings (id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES public.vendor_message_threads (id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'vendor' CHECK (sender_type IN ('organizer', 'vendor')),
  body        text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- Reviews -- no vendor_id column; reviews hang off bookings (see 100, 110).
-- -----------------------------------------------------------------------------
CREATE TABLE public.vendor_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL REFERENCES public.vendor_bookings (id) ON DELETE CASCADE,
  reviewer_id   uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reviewer_type text NOT NULL CHECK (reviewer_type IN ('organizer', 'vendor')),
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reviewer_type)
);


-- -----------------------------------------------------------------------------
-- Vendor email OTPs -- 101 widens the purpose CHECK to include 'login'.
-- -----------------------------------------------------------------------------
CREATE TABLE public.vendor_email_otps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  code_hash   text NOT NULL,
  purpose     text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_email_otps_purpose_check
    CHECK (purpose = ANY (ARRAY['signup', 'reverify', 'password_reset']))
);


-- -----------------------------------------------------------------------------
-- Organizer -> venue direct picks (main app marketplace).
-- -----------------------------------------------------------------------------
-- Column types match vendor_venue_requests() (109). venue_id is read by
-- 108/109 but added by no migration in this repo, so it is part of the base
-- schema here; it has no FK because public.venues is created later (106).
-- 109 adds response_notified_status.
CREATE TABLE public.event_venue_selections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  vendor_id               uuid NOT NULL REFERENCES public.vendors (id) ON DELETE CASCADE,
  venue_id                uuid,
  status                  text NOT NULL DEFAULT 'contacted'
                          CHECK (status IN ('contacted', 'accepted', 'declined', 'cancelled')),
  notes                   text,
  selected_service_ids    uuid[] DEFAULT '{}'::uuid[],
  event_type              text,
  event_duration_hours    numeric(5,1) CHECK (event_duration_hours IS NULL OR event_duration_hours > 0),
  expected_attendees      integer CHECK (expected_attendees IS NULL OR expected_attendees >= 0),
  seating_capacity        integer CHECK (seating_capacity IS NULL OR seating_capacity >= 0),
  seating_arrangement     text,
  needs_pre_function_area boolean NOT NULL DEFAULT false,
  needs_vip_area          boolean NOT NULL DEFAULT false,
  needs_additional_rooms  boolean NOT NULL DEFAULT false,
  venue_link              text,
  responded_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_venue_selections_vendor_id_idx ON public.event_venue_selections (vendor_id);
CREATE INDEX event_venue_selections_event_id_idx  ON public.event_venue_selections (event_id);
