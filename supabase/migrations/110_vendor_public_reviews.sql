-- ═══════════════════════════════════════════════════════════════════════════
-- 110_vendor_public_reviews.sql
--
-- Reviews for the vendor's public profile page (/v/<vendor id>).
--
-- vendor_reviews is public-read, but a review only reaches its vendor through
-- vendor_bookings, which is readable solely by the booking's organization and
-- the vendor's members. So a signed-out visitor joining the two sees nothing.
-- This SECURITY DEFINER function returns just the public face of each
-- organizer → vendor review: rating, comment, date and the event's date.
-- No reviewer identity, booking id, amount or organization is exposed.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.vendor_public_reviews(p_vendor_id uuid, p_limit int default 20)
returns table (
  id          uuid,
  rating      int,
  comment     text,
  created_at  timestamptz,
  event_date  date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.rating::int, r.comment, r.created_at, b.event_date::date
    from public.vendor_reviews r
    join public.vendor_bookings b on b.id = r.booking_id
   where b.vendor_id = p_vendor_id
     and r.reviewer_type = 'organizer'
   order by r.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.vendor_public_reviews(uuid, int) from public;
grant execute on function public.vendor_public_reviews(uuid, int) to anon, authenticated;

comment on function public.vendor_public_reviews(uuid, int) is
  'Organizer reviews of a vendor for its public profile: rating, comment, dates only. SECURITY DEFINER because vendor_bookings (the review → vendor link) is private.';
