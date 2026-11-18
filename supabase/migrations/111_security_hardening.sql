-- =============================================================================
-- 111 · Security hardening
-- =============================================================================
-- Closes privilege-escalation and integrity holes found in review of
-- migrations 100–110. Each section is idempotent (safe to re-run) and only
-- tightens access; nothing here widens what any role can do.
--
-- Design note: the column guards below are plain (SECURITY INVOKER) triggers
-- that only restrict the client roles `authenticated` / `anon`. Inside a
-- SECURITY DEFINER function `current_user` is the function owner, so trusted
-- server-side paths keep working unchanged:
--   recompute_vendor_rating(), accept_vendor_quote(), create_vendor_business(),
--   the Supabase dashboard / service_role, and the main app's own RPCs.
-- =============================================================================

-- Returns true when the statement comes straight from a client (PostgREST).
create or replace function public.is_client_role()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select current_user in ('authenticated', 'anon');
$$;


-- -----------------------------------------------------------------------------
-- 1 · vendors: members can't self-verify, change commission or fake ratings
-- -----------------------------------------------------------------------------
create or replace function public.vendors_guard_protected_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_client_role() and (
       new.id                  is distinct from old.id
    or new.verification_status is distinct from old.verification_status
    or new.commission_rate     is distinct from old.commission_rate
    or new.rating_avg          is distinct from old.rating_avg
    or new.rating_count        is distinct from old.rating_count
  ) then
    raise exception 'These vendor fields are managed by Illuxus and cannot be changed here.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendors_guard_protected on public.vendors;
create trigger trg_vendors_guard_protected
  before update on public.vendors
  for each row execute function public.vendors_guard_protected_columns();


-- -----------------------------------------------------------------------------
-- 2 · vendor_bookings: neither party can rewrite who/what/how much
-- -----------------------------------------------------------------------------
-- Blocks: vendor zeroing commission, organizer re-pointing a booking at a
-- rival vendor (then reviewing it / blocking their calendar), either side
-- changing the agreed total.
create or replace function public.vendor_bookings_guard_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_client_role() and (
       new.vendor_id         is distinct from old.vendor_id
    or new.org_id            is distinct from old.org_id
    or new.quote_id          is distinct from old.quote_id
    or new.rfq_id            is distinct from old.rfq_id
    or new.total             is distinct from old.total
    or new.currency          is distinct from old.currency
    or new.commission_rate   is distinct from old.commission_rate
    or new.commission_amount is distinct from old.commission_amount
  ) then
    raise exception 'A booking''s parties, quote and amounts cannot be changed after it is created.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendor_bookings_guard_immutable on public.vendor_bookings;
create trigger trg_vendor_bookings_guard_immutable
  before update on public.vendor_bookings
  for each row execute function public.vendor_bookings_guard_immutable();

-- One booking per quote: two concurrent accept_vendor_quote() calls used to
-- be able to create two bookings for the same quote.
do $$
begin
  if not exists (
    select 1 from public.vendor_bookings
     where quote_id is not null
     group by quote_id having count(*) > 1
  ) then
    create unique index if not exists vendor_bookings_quote_id_uniq
      on public.vendor_bookings (quote_id) where quote_id is not null;
  else
    raise notice 'vendor_bookings has duplicate quote_id rows; resolve them, then re-run 111 to add the unique index.';
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 3 · vendor_bookings ↔ availability sync: two bugs
-- -----------------------------------------------------------------------------
--  a) Cancelling from in_progress (offered by the Bookings tab) never
--     released the date.
--  b) Confirming on a day already blocked raised a unique violation and
--     failed the confirm itself.
create or replace function public.vendor_bookings_sync_availability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'confirmed' and new.event_date is not null
     and (tg_op = 'INSERT' or old.status <> 'confirmed')
     and not exists (
       select 1 from public.vendor_availability
        where booking_id = new.id and status = 'booked'
     ) then
    insert into public.vendor_availability (vendor_id, date, status, note, booking_id)
    values (new.vendor_id, new.event_date, 'booked', 'Confirmed booking', new.id)
    on conflict do nothing;  -- day already blocked: it stays blocked
  end if;

  if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
    delete from public.vendor_availability
     where booking_id = new.id and status = 'booked';
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4 · vendor_members: only owners manage the team; never lose the last owner
-- -----------------------------------------------------------------------------
create or replace function public.is_vendor_owner(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.vendor_members
     where vendor_id = p_vendor_id
       and user_id = auth.uid()
       and role = 'owner'
  );
$$;
revoke all on function public.is_vendor_owner(uuid) from public, anon;
grant execute on function public.is_vendor_owner(uuid) to authenticated;

drop policy if exists "vendor_members_owner_manage" on public.vendor_members;
drop policy if exists "vendor_members_owner_insert" on public.vendor_members;
drop policy if exists "vendor_members_owner_update" on public.vendor_members;
drop policy if exists "vendor_members_owner_delete" on public.vendor_members;

create policy "vendor_members_owner_insert"
  on public.vendor_members for insert to authenticated
  with check (public.is_vendor_owner(vendor_id));

create policy "vendor_members_owner_update"
  on public.vendor_members for update to authenticated
  using (public.is_vendor_owner(vendor_id))
  with check (public.is_vendor_owner(vendor_id));

-- Owners remove anyone; a non-owner may remove only themselves (leave).
create policy "vendor_members_owner_delete"
  on public.vendor_members for delete to authenticated
  using (
    public.is_vendor_owner(vendor_id)
    or (user_id = auth.uid() and role <> 'owner')
  );

create or replace function public.vendor_members_keep_an_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_client_role()
     and old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.vendor_id <> old.vendor_id)
     and not exists (
       select 1 from public.vendor_members m
        where m.vendor_id = old.vendor_id
          and m.role = 'owner'
          and m.id <> old.id
     ) then
    raise exception 'A business must keep at least one owner.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_vendor_members_keep_owner on public.vendor_members;
create trigger trg_vendor_members_keep_owner
  before update or delete on public.vendor_members
  for each row execute function public.vendor_members_keep_an_owner();

-- One business per user. A second membership row made the portal's
-- vendor lookup ambiguous and locked the victim out.
do $$
begin
  if not exists (
    select 1 from public.vendor_members group by user_id having count(*) > 1
  ) then
    create unique index if not exists vendor_members_user_id_uniq
      on public.vendor_members (user_id);
  else
    raise notice 'vendor_members has users in several businesses; resolve, then re-run 111 to add the unique index.';
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 5 · quotes / rfq_invitees: no re-parenting, vendors can't self-accept
-- -----------------------------------------------------------------------------
create or replace function public.quotes_guard_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_client_role() then
    return new;
  end if;

  if new.rfq_id is distinct from old.rfq_id
     or new.vendor_id is distinct from old.vendor_id then
    raise exception 'A quote cannot be moved to another request or vendor.'
      using errcode = '42501';
  end if;

  -- Accepting / declining is the organizer's decision (accept_vendor_quote()
  -- for accepts). A vendor member flipping their own quote is rejected.
  if new.status is distinct from old.status
     and new.status in ('accepted', 'declined')
     and public.is_vendor_member(new.vendor_id) then
    raise exception 'Only the organizer can accept or decline a quote.'
      using errcode = '42501';
  end if;

  -- An accepted / declined / expired quote is final.
  if old.status in ('accepted', 'declined', 'expired')
     and public.is_vendor_member(new.vendor_id)
     and (new.status is distinct from old.status
          or new.total is distinct from old.total
          or new.currency is distinct from old.currency) then
    raise exception 'This quote is closed and can no longer be edited.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_quotes_guard_update on public.quotes;
create trigger trg_quotes_guard_update
  before update on public.quotes
  for each row execute function public.quotes_guard_update();

create or replace function public.rfq_invitees_guard_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_client_role()
     and (new.rfq_id is distinct from old.rfq_id
          or new.vendor_id is distinct from old.vendor_id) then
    -- Re-pointing an invite row was a way to self-invite to any RFQ.
    raise exception 'An invitation cannot be moved to another request or vendor.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rfq_invitees_guard_update on public.rfq_invitees;
create trigger trg_rfq_invitees_guard_update
  before update on public.rfq_invitees
  for each row execute function public.rfq_invitees_guard_update();


-- -----------------------------------------------------------------------------
-- 6 · vendor_reviews: one review per booking per side, rating 1–5
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from public.vendor_reviews
     group by booking_id, reviewer_type having count(*) > 1
  ) then
    create unique index if not exists vendor_reviews_booking_reviewer_uniq
      on public.vendor_reviews (booking_id, reviewer_type);
  else
    raise notice 'vendor_reviews has duplicate (booking_id, reviewer_type) rows; resolve, then re-run 111.';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.vendor_reviews'::regclass
       and conname = 'vendor_reviews_rating_range'
  ) then
    -- NOT VALID: enforced for new rows without failing on legacy data.
    alter table public.vendor_reviews
      add constraint vendor_reviews_rating_range
      check (rating between 1 and 5) not valid;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 7 · Storage: venue-media writes scoped to the venue's own vendor
-- -----------------------------------------------------------------------------
-- Before: any signed-in user (including every organizer on the shared
-- project) could upload anything, anywhere in the bucket, including
-- script-carrying SVGs served from our domain.

-- Path shape `<venue_id>/<file>`. Safe on malformed paths (no uuid cast error).
create or replace function public.can_manage_venue_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when split_part(p_name, '/', 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then false
    else exists (
      select 1 from public.venues v
       where v.id = split_part(p_name, '/', 1)::uuid
         and public.is_vendor_member(v.vendor_id)
    )
  end;
$$;
revoke all on function public.can_manage_venue_object(text) from public, anon;
grant execute on function public.can_manage_venue_object(text) to authenticated;

-- Same for vendor-media (`<vendor_id>/<file>`): the old policies cast the
-- folder to uuid and returned a 500 instead of a 403 on odd paths.
create or replace function public.can_manage_vendor_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when split_part(p_name, '/', 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then false
    else public.is_vendor_member(split_part(p_name, '/', 1)::uuid)
  end;
$$;
revoke all on function public.can_manage_vendor_object(text) from public, anon;
grant execute on function public.can_manage_vendor_object(text) to authenticated;

drop policy if exists "venue_media_auth_insert"   on storage.objects;
drop policy if exists "venue_media_owner_update"  on storage.objects;
drop policy if exists "venue_media_owner_delete"  on storage.objects;
drop policy if exists "venue_media_member_insert" on storage.objects;
drop policy if exists "venue_media_member_update" on storage.objects;
drop policy if exists "venue_media_member_delete" on storage.objects;

create policy "venue_media_member_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'venue-media' and public.can_manage_venue_object(name));

-- Any member of the venue's business can manage its files, not only the
-- person who uploaded them.
create policy "venue_media_member_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'venue-media' and public.can_manage_venue_object(name))
  with check (bucket_id = 'venue-media' and public.can_manage_venue_object(name));

create policy "venue_media_member_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'venue-media' and public.can_manage_venue_object(name));

drop policy if exists "vendor_media_member_insert" on storage.objects;
drop policy if exists "vendor_media_member_update" on storage.objects;
drop policy if exists "vendor_media_member_delete" on storage.objects;

create policy "vendor_media_member_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-media' and public.can_manage_vendor_object(name));

create policy "vendor_media_member_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'vendor-media' and public.can_manage_vendor_object(name))
  with check (bucket_id = 'vendor-media' and public.can_manage_vendor_object(name));

create policy "vendor_media_member_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-media' and public.can_manage_vendor_object(name));

-- No SVG (it can carry script); server-side size + type limits on both buckets.
update storage.buckets
   set file_size_limit    = 50 * 1024 * 1024,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
         'application/pdf',
         'video/mp4', 'video/webm', 'video/quicktime'
       ]
 where id = 'venue-media';

update storage.buckets
   set file_size_limit    = 5 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'vendor-media';


-- -----------------------------------------------------------------------------
-- 8 · venue_media rows: hidden / draft venues aren't public
-- -----------------------------------------------------------------------------
drop policy if exists "venue_media_public_read" on public.venue_media;
create policy "venue_media_public_read"
  on public.venue_media for select
  using (exists (
    select 1 from public.venues v
     where v.id = venue_media.venue_id
       and (v.is_active or public.is_vendor_member(v.vendor_id))
  ));


-- -----------------------------------------------------------------------------
-- 9 · URL and number sanity (stored-XSS sinks, negative capacities)
-- -----------------------------------------------------------------------------
-- NOT VALID: enforced for every new / updated row; legacy rows are left
-- alone so the migration can't fail on existing data. Run
--   ALTER TABLE ... VALIDATE CONSTRAINT ...
-- after cleaning old rows, if any.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('venues',           'venues_map_url_https',      $c$map_url is null or map_url ~* '^https?://'$c$),
      ('venue_media',      'venue_media_url_http',       $c$url ~* '^https?://'$c$),
      ('vendor_portfolio', 'vendor_portfolio_url_http',  $c$url ~* '^https?://'$c$),
      ('venues',           'venues_numbers_non_negative', $c$
          coalesce(area_sqft, 0) >= 0 and coalesce(length_ft, 0) >= 0
          and coalesce(width_ft, 0) >= 0 and coalesce(ceiling_height_ft, 0) >= 0
          and coalesce(capacity_floating, 0) >= 0 and coalesce(capacity_theater, 0) >= 0
          and coalesce(capacity_banquet, 0) >= 0 and coalesce(capacity_ushape, 0) >= 0
          and coalesce(capacity_classroom, 0) >= 0 and coalesce(green_rooms_count, 0) >= 0
          and coalesce(parking_car_capacity, 0) >= 0
          and coalesce(parking_two_wheeler_capacity, 0) >= 0 $c$)
    ) as t(tbl, name, expr)
  loop
    if to_regclass('public.' || c.tbl) is not null
       and not exists (
         select 1 from pg_constraint
          where conrelid = ('public.' || c.tbl)::regclass and conname = c.name
       ) then
      execute format('alter table public.%I add constraint %I check (%s) not valid',
                     c.tbl, c.name, c.expr);
    end if;
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- 10 · Email allowlist: confirmed emails only; table locked behind RLS
-- -----------------------------------------------------------------------------
create or replace function public.enforce_vendor_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  _email     text;
  _confirmed timestamptz;
begin
  select lower(email), email_confirmed_at into _email, _confirmed
    from auth.users
   where id = new.user_id;

  if _email is null then
    raise exception
      'Cannot create vendor_members row: auth user % not found.', new.user_id
      using errcode = '23503';
  end if;

  -- Whoever signs up first with an invited address must also own the inbox.
  if _confirmed is null then
    raise exception
      'Confirm your email address before joining the vendor portal.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.vendor_email_allowlist a
     where lower(a.email) = _email
  ) then
    raise exception
      'Vendor portal access is invite-only. Email % is not on the allowlist.', _email
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Grants were already revoked (105); RLS with no policies makes the table
-- unreachable from the API even if a grant is re-added by mistake.
alter table public.vendor_email_allowlist enable row level security;


-- -----------------------------------------------------------------------------
-- 11 · Definer RPCs: no anonymous execution
-- -----------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('create_vendor_business', 'accept_vendor_quote',
                         'get_or_create_vendor_thread', 'vendor_venue_requests')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- 12 · Indexes for RLS predicates and hot filters
-- -----------------------------------------------------------------------------
-- Every RLS check calls is_vendor_member() → vendor_members(user_id, vendor_id).
do $$
declare
  ix record;
begin
  for ix in
    select * from (values
      ('vendor_members',         'vendor_members_user_vendor_idx',  'user_id, vendor_id'),
      ('vendor_availability',    'vendor_availability_venue_idx',   'venue_id'),
      ('vendor_availability',    'vendor_availability_booking_idx', 'booking_id'),
      ('rfq_invitees',           'rfq_invitees_vendor_idx',         'vendor_id'),
      ('rfq_invitees',           'rfq_invitees_rfq_vendor_idx',     'rfq_id, vendor_id'),
      ('quotes',                 'quotes_vendor_idx',               'vendor_id'),
      ('quotes',                 'quotes_rfq_idx',                  'rfq_id'),
      ('vendor_bookings',        'vendor_bookings_vendor_idx',      'vendor_id'),
      ('vendor_bookings',        'vendor_bookings_org_idx',         'org_id'),
      ('vendor_reviews',         'vendor_reviews_booking_idx',      'booking_id'),
      ('vendor_services',        'vendor_services_vendor_idx',      'vendor_id'),
      ('vendor_portfolio',       'vendor_portfolio_vendor_idx',     'vendor_id'),
      ('event_venue_selections', 'event_venue_selections_vendor_idx', 'vendor_id'),
      ('event_venue_selections', 'event_venue_selections_venue_status_idx', 'venue_id, status')
    ) as t(tbl, name, cols)
  loop
    if to_regclass('public.' || ix.tbl) is not null
       and (
         -- every listed column exists
         select bool_and(exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = ix.tbl
              and column_name = trim(col)
         ))
         from unnest(string_to_array(ix.cols, ',')) as col
       ) then
      execute format('create index if not exists %I on public.%I (%s)', ix.name, ix.tbl, ix.cols);
    end if;
  end loop;
end $$;
