-- ═══════════════════════════════════════════════════════════════════════════
-- 108_venue_location_services_availability.sql
--
-- Closes the gaps between "the venue admin lists a venue" and "the
-- organizer sees only the venues they can actually book":
--
--   1. Location per venue. Until now a venue inherited its city from the
--      owning vendor, so a vendor with a hall in Mumbai and a lawn in
--      Delhi showed both under one city. Adds address / city / state /
--      pincode / map link on `venues`, backfilling city from the vendor.
--
--   2. Videos. `venue_media` gains a 'video' kind and the venue-media
--      bucket accepts MP4 / WebM / MOV, with the per-file cap raised to
--      50 MB (Supabase's default global upload limit).
--
--   3. Per-venue additional services (photography, food, lunch, decor…).
--      `vendor_services` gains `venue_id` (null = offered at every venue
--      of the vendor) and `category`. Re-using vendor_services keeps the
--      existing request flow working unchanged: the organizer's picks
--      still land in event_venue_selections.selected_service_ids and the
--      vendor inbox still resolves their titles.
--
--   4. Date-range availability across organizations. The main app used to
--      read event_venue_selections directly, but RLS only lets an
--      organizer see their OWN org's rows — so a venue another organizer
--      had already booked still looked free. `unavailable_venue_ids`
--      (SECURITY DEFINER) answers "which venues are busy on any day of
--      [start, end]" without exposing whose events those are.
--      `vendor_availability` also gains an optional `venue_id` so the
--      admin can block one space instead of the whole business.
--
-- Idempotent throughout. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Venue location ────────────────────────────────────────────────
alter table public.venues
  add column if not exists address_line text,
  add column if not exists city         text,
  add column if not exists state        text,
  add column if not exists pincode      text,
  add column if not exists map_url      text;

alter table public.venues
  drop constraint if exists venues_location_lengths;
alter table public.venues
  add  constraint venues_location_lengths
    check (
      (address_line is null or length(address_line) <= 300)
      and (city    is null or length(city)    <= 80)
      and (state   is null or length(state)   <= 80)
      and (pincode is null or length(pincode) <= 12)
      and (map_url is null or length(map_url) <= 500)
    );

-- Backfill from the owning vendor so existing venues keep showing up
-- under the same city they did before this migration.
update public.venues v
   set city = vd.city
  from public.vendors vd
 where vd.id = v.vendor_id
   and v.city is null
   and vd.city is not null;

create index if not exists venues_city_lower_idx on public.venues (lower(city));


-- ── 2. Video media ───────────────────────────────────────────────────
alter table public.venue_media
  drop constraint if exists venue_media_kind_check;
alter table public.venue_media
  add  constraint venue_media_kind_check
    check (media_kind in ('empty_hall','setup','facility','floor_plan','video','other'));

update storage.buckets
   set file_size_limit    = 50 * 1024 * 1024,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml',
         'application/pdf',
         'video/mp4', 'video/webm', 'video/quicktime'
       ]
 where id = 'venue-media';


-- ── 3. Per-venue services ────────────────────────────────────────────
alter table public.vendor_services
  add column if not exists venue_id uuid references public.venues(id) on delete cascade,
  add column if not exists category text;

alter table public.vendor_services
  drop constraint if exists vendor_services_category_length;
alter table public.vendor_services
  add  constraint vendor_services_category_length
    check (category is null or length(category) <= 40);

create index if not exists vendor_services_venue_id_idx on public.vendor_services (venue_id);

-- A service can only be pinned to a venue owned by the same vendor.
-- RLS on vendor_services checks vendor membership, but not that the
-- venue_id points at one of that vendor's venues.
create or replace function public.vendor_services_check_venue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.venue_id is not null and not exists (
    select 1 from public.venues v
     where v.id = new.venue_id
       and v.vendor_id = new.vendor_id
  ) then
    raise exception 'Venue % does not belong to vendor %', new.venue_id, new.vendor_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendor_services_check_venue on public.vendor_services;
create trigger trg_vendor_services_check_venue
  before insert or update of venue_id, vendor_id on public.vendor_services
  for each row execute function public.vendor_services_check_venue();


-- ── 4a. Venue-level manual blocks ────────────────────────────────────
alter table public.vendor_availability
  add column if not exists venue_id uuid references public.venues(id) on delete cascade;

-- If the baseline has UNIQUE (vendor_id, date), two venues of the same
-- vendor could never be blocked on the same day. Swap it for a unique
-- index that includes the venue (null venue = whole business).
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.vendor_availability'::regclass
       and con.contype = 'u'
       and (
         select array_agg(att.attname::text order by att.attname)
           from unnest(con.conkey) k
           join pg_attribute att
             on att.attrelid = con.conrelid and att.attnum = k
       ) = array['date', 'vendor_id']
  loop
    execute format('alter table public.vendor_availability drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists vendor_availability_vendor_date_venue_uniq
  on public.vendor_availability (
    vendor_id, date, coalesce(venue_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );


-- ── 4b. Availability across organizations ────────────────────────────
-- A venue is unavailable for [p_start, p_end] when, on any day in that
-- range:
--   • the vendor blocked the whole business or that venue
--     (vendor_availability status 'held' / 'booked'), or
--   • another event already has an ACCEPTED selection for that venue
--     (legacy rows without venue_id block every venue of the vendor).
-- Pass p_exclude_event_id to ignore the caller's own event, so an
-- organizer re-opening the picker isn't told their own booking clashes.
create or replace function public.unavailable_venue_ids(
  p_start            date,
  p_end              date default null,
  p_exclude_event_id uuid default null
)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select p_start as s, coalesce(p_end, p_start) as e
  )
  select v.id
    from public.venues v, bounds b
   where exists (
           select 1 from public.vendor_availability a
            where a.vendor_id = v.vendor_id
              and (a.venue_id is null or a.venue_id = v.id)
              and a.status in ('held', 'booked')
              and a.date between b.s and b.e
         )
      or exists (
           select 1
             from public.event_venue_selections s
             join public.events ev on ev.id = s.event_id
            where s.status = 'accepted'
              and (s.venue_id = v.id or (s.venue_id is null and s.vendor_id = v.vendor_id))
              and (p_exclude_event_id is null or s.event_id <> p_exclude_event_id)
              and ev.date::date <= b.e
              and coalesce(ev.end_date, ev.date)::date >= b.s
         );
$$;

revoke all on function public.unavailable_venue_ids(date, date, uuid) from public;
grant execute on function public.unavailable_venue_ids(date, date, uuid) to anon, authenticated;

comment on function public.unavailable_venue_ids(date, date, uuid) is
  'Venue ids that cannot be booked on any day of [p_start, p_end]: manual / booking blocks in vendor_availability, or an accepted event_venue_selections row on an overlapping event. SECURITY DEFINER so organizers see clashes with other organizations'' events without reading those rows.';
