-- =============================================================================
-- Integrity rules from supabase/migrations/111 that are not live yet, in
-- portable form (no Supabase roles, RLS or storage), so AWS gets them too.
-- Idempotent and safe on existing data: a unique index is only added when no
-- duplicate rows exist (otherwise a NOTICE says what to clean up), and CHECKs
-- are NOT VALID (enforced for new writes, legacy rows untouched).
-- =============================================================================

do $$
begin
  -- One booking per quote (concurrent accepts used to create two).
  if not exists (select 1 from pg_class where relname = 'vendor_bookings_quote_id_uniq') then
    if exists (select 1 from public.vendor_bookings where quote_id is not null group by quote_id having count(*) > 1) then
      raise notice 'vendor_bookings has duplicate quote_id rows; clean them, then re-run to add vendor_bookings_quote_id_uniq';
    else
      create unique index vendor_bookings_quote_id_uniq on public.vendor_bookings (quote_id) where quote_id is not null;
    end if;
  end if;

  -- One business per user (a second membership made the portal ambiguous).
  if not exists (select 1 from pg_class where relname = 'vendor_members_user_id_uniq') then
    if exists (select 1 from public.vendor_members group by user_id having count(*) > 1) then
      raise notice 'vendor_members has users in several businesses; clean them, then re-run to add vendor_members_user_id_uniq';
    else
      create unique index vendor_members_user_id_uniq on public.vendor_members (user_id);
    end if;
  end if;

  -- One review per booking per side.
  if not exists (select 1 from pg_class where relname = 'vendor_reviews_booking_reviewer_uniq') then
    if exists (select 1 from public.vendor_reviews group by booking_id, reviewer_type having count(*) > 1) then
      raise notice 'vendor_reviews has duplicate (booking_id, reviewer_type) rows; clean them, then re-run';
    else
      create unique index vendor_reviews_booking_reviewer_uniq on public.vendor_reviews (booking_id, reviewer_type);
    end if;
  end if;
end $$;

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('vendor_reviews',   'vendor_reviews_rating_range',  $c$rating between 1 and 5$c$),
      ('venues',           'venues_map_url_https',         $c$map_url is null or map_url ~* '^https?://'$c$),
      ('venue_media',      'venue_media_url_http',         $c$url ~* '^https?://'$c$),
      ('vendor_portfolio', 'vendor_portfolio_url_http',    $c$url ~* '^https?://'$c$),
      ('venues',           'venues_numbers_non_negative',  $c$
          coalesce(area_sqft, 0) >= 0 and coalesce(length_ft, 0) >= 0
          and coalesce(width_ft, 0) >= 0 and coalesce(ceiling_height_ft, 0) >= 0
          and coalesce(capacity_floating, 0) >= 0 and coalesce(capacity_theater, 0) >= 0
          and coalesce(capacity_banquet, 0) >= 0 and coalesce(capacity_ushape, 0) >= 0
          and coalesce(capacity_classroom, 0) >= 0 and coalesce(green_rooms_count, 0) >= 0
          and coalesce(parking_car_capacity, 0) >= 0
          and coalesce(parking_two_wheeler_capacity, 0) >= 0 $c$)
    ) as t(tbl, name, expr)
  loop
    if not exists (
      select 1 from pg_constraint where conrelid = ('public.' || c.tbl)::regclass and conname = c.name
    ) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
    end if;
  end loop;
end $$;
