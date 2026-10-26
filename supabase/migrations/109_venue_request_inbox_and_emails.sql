-- ═══════════════════════════════════════════════════════════════════════════
-- 109_venue_request_inbox_and_emails.sql
--
-- Two fixes for the venue-request loop between the organizer app and the
-- venue portal.
--
--   1. Inbox could not see draft events. The Inbox read
--      event_venue_selections joined to `events!inner`, but events RLS only
--      exposes PUBLISHED events to anyone other than the owner. Quick Create
--      saves every event as a draft, so the venue admin's Inbox silently
--      dropped those requests. `vendor_venue_requests()` (SECURITY DEFINER)
--      returns the caller's requests with the full event details, the
--      requested venue, and the organizer's contact details — scoped to
--      vendors the caller is a member of.
--
--   2. Duplicate-safe "accepted / declined" email. The organizer email is
--      sent by the notify-organizer-venue-response edge function, called by
--      the existing trg_event_venue_selections_notify trigger AND (from now
--      on) by the venue portal right after Accept / Decline, so the email
--      still goes out when the trigger's app_settings aren't configured.
--      `response_notified_status` lets the function claim a send atomically
--      so the organizer gets exactly one email per decision.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Response-email de-duplication ─────────────────────────────────
alter table public.event_venue_selections
  add column if not exists response_notified_status text;

comment on column public.event_venue_selections.response_notified_status is
  'Status (accepted / declined) the organizer was last emailed about. Set by notify-organizer-venue-response before sending so the trigger and the venue portal can both call it without a duplicate email.';


-- ── 2. Inbox read ────────────────────────────────────────────────────
drop function if exists public.vendor_venue_requests();

create or replace function public.vendor_venue_requests()
returns table (
  selection_id            uuid,
  vendor_id               uuid,
  status                  text,
  notes                   text,
  created_at              timestamptz,
  responded_at            timestamptz,
  selected_service_ids    uuid[],

  event_type              text,
  event_duration_hours    numeric,
  expected_attendees      int,
  seating_capacity        int,
  seating_arrangement     text,
  needs_pre_function_area boolean,
  needs_vip_area          boolean,
  needs_additional_rooms  boolean,
  venue_link              text,

  event_id                uuid,
  event_title             text,
  event_description       text,
  event_date              timestamptz,
  event_end_date          timestamptz,
  event_timezone          text,
  event_location          text,
  event_venue             text,
  event_capacity          int,
  event_format            text,
  event_status            text,
  event_banner_url        text,

  venue_id                uuid,
  venue_name              text,

  org_name                text,
  organizer_name          text,
  organizer_email         text,
  organizer_phone         text
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    s.id,
    s.vendor_id,
    s.status,
    s.notes,
    s.created_at,
    s.responded_at,
    coalesce(s.selected_service_ids, array[]::uuid[]),

    s.event_type,
    s.event_duration_hours::numeric,
    s.expected_attendees,
    s.seating_capacity,
    s.seating_arrangement,
    coalesce(s.needs_pre_function_area, false),
    coalesce(s.needs_vip_area, false),
    coalesce(s.needs_additional_rooms, false),
    s.venue_link,

    e.id,
    e.title,
    e.description,
    e.date,
    e.end_date,
    e.timezone,
    e.location,
    e.venue,
    e.capacity,
    e.event_format,
    e.status,
    coalesce(e.banner_landscape_url, e.banner_portrait_url, e.image_url),

    v.id,
    v.name,

    o.name,
    coalesce(
      nullif(trim(p.display_name), ''),
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      u.raw_user_meta_data ->> 'display_name',
      split_part(u.email::text, '@', 1)
    ),
    u.email::text,
    nullif(concat_ws(' ', p.mobile_country_code, p.mobile_number), '')
  from public.event_venue_selections s
  join public.events e        on e.id = s.event_id
  left join public.venues v   on v.id = s.venue_id
  left join public.organizations o on o.id = e.org_id
  left join auth.users u      on u.id = e.user_id
  left join public.profiles p on p.user_id = e.user_id
  where exists (
    select 1 from public.vendor_members m
     where m.vendor_id = s.vendor_id
       and m.user_id = auth.uid()
  )
  order by s.created_at desc;
$$;

revoke all on function public.vendor_venue_requests() from public, anon;
grant execute on function public.vendor_venue_requests() to authenticated;

comment on function public.vendor_venue_requests() is
  'Venue requests for every vendor the caller belongs to, with full event + organizer details. SECURITY DEFINER because events RLS hides draft events from non-owners.';
