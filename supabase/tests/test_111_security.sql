-- =============================================================================
-- Behavioural tests for migration 111 (and the flows it must not break).
-- Runs inside one transaction that is rolled back, so it leaves no data.
-- Each check raises on failure; psql's ON_ERROR_STOP turns that into exit 1.
-- =============================================================================
begin;

-- ── helpers ──────────────────────────────────────────────────────────────────
create schema if not exists t;
grant usage on schema t to anon, authenticated;

-- Impersonate a signed-in user the way PostgREST does.
create or replace function t.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function t.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end $$;

-- Run SQL that MUST fail. Optional sqlstate pins the reason.
create or replace function t.expect_error(p_sql text, p_state text default null, p_label text default '')
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_state is not null and sqlstate <> p_state then
      raise exception 'FAIL %: expected SQLSTATE %, got % (%)', p_label, p_state, sqlstate, sqlerrm;
    end if;
    raise notice 'ok   % (rejected: %)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: statement was allowed: %', p_label, p_sql;
end $$;

create or replace function t.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FAIL %', p_label;
  end if;
  raise notice 'ok   %', p_label;
end $$;

grant execute on all functions in schema t to anon, authenticated;

-- ── fixtures (as postgres) ───────────────────────────────────────────────────
-- U1 owner of vendor A · U2 staff of A · U3 organizer (org O) · U4 owner of rival B
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'staff@a.test', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'planner@org.test', now()),
  ('00000000-0000-0000-0000-0000000000a4', 'owner@b.test', now()),
  ('00000000-0000-0000-0000-0000000000a5', 'unconfirmed@a.test', null);

insert into public.vendor_email_allowlist (email) values
  ('owner@a.test'), ('staff@a.test'), ('owner@b.test'), ('unconfirmed@a.test')
on conflict do nothing;

insert into public.vendors (id, business_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Vendor A'),
  ('00000000-0000-0000-0000-00000000000b', 'Vendor B');

insert into public.vendor_members (vendor_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'staff'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a4', 'owner');

insert into public.venues (id, vendor_id, name, city, is_active) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Listed Hall', 'Mumbai', true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'Draft Hall',  'Mumbai', false);

insert into public.venue_media (venue_id, url, media_kind) values
  ('00000000-0000-0000-0000-0000000000c1', 'https://x.supabase.co/a.jpg', 'empty_hall'),
  ('00000000-0000-0000-0000-0000000000c2', 'https://x.supabase.co/b.jpg', 'empty_hall');

insert into public.organizations (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'Org', '00000000-0000-0000-0000-0000000000a3');

insert into public.rfqs (id, org_id, event_date, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', current_date + 30, 'open'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', current_date + 40, 'open');

insert into public.rfq_invitees (rfq_id, vendor_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000a');

insert into public.quotes (id, rfq_id, vendor_id, total, currency, status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', 100000, 'INR', 'sent'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000a', 50000,  'INR', 'sent');

-- ── 1 · vendors: protected columns ───────────────────────────────────────────
select t.act_as('00000000-0000-0000-0000-0000000000a1');
update public.vendors set tagline = 'Sea-facing halls' where id = '00000000-0000-0000-0000-00000000000a';
select t.expect((select tagline = 'Sea-facing halls' from public.vendors where id = '00000000-0000-0000-0000-00000000000a'),
                'owner can edit profile fields');
select t.expect_error($$update public.vendors set verification_status = 'verified' where id = '00000000-0000-0000-0000-00000000000a'$$,
                      '42501', 'member cannot self-verify');
select t.expect_error($$update public.vendors set commission_rate = 0 where id = '00000000-0000-0000-0000-00000000000a'$$,
                      '42501', 'member cannot change commission');
select t.expect_error($$update public.vendors set rating_avg = 5, rating_count = 999 where id = '00000000-0000-0000-0000-00000000000a'$$,
                      '42501', 'member cannot fake ratings');
reset role;

-- ── 2 · quotes ───────────────────────────────────────────────────────────────
select t.act_as('00000000-0000-0000-0000-0000000000a1');
select t.expect_error($$update public.quotes set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000f2'$$,
                      '42501', 'vendor cannot accept own quote');
select t.expect_error($$update public.quotes set rfq_id = '00000000-0000-0000-0000-0000000000e1' where id = '00000000-0000-0000-0000-0000000000f2'$$,
                      '42501', 'vendor cannot move quote to another RFQ');
update public.quotes set total = 55000 where id = '00000000-0000-0000-0000-0000000000f2';
select t.expect((select total = 55000 from public.quotes where id = '00000000-0000-0000-0000-0000000000f2'),
                'vendor can revise an open quote');
select t.expect_error($$update public.rfq_invitees set rfq_id = '00000000-0000-0000-0000-0000000000e1'
                        where rfq_id = '00000000-0000-0000-0000-0000000000e2'$$,
                      '42501', 'vendor cannot re-point an invitation');
reset role;

-- ── 3 · accept_vendor_quote still works; only once per quote ────────────────
select t.act_as('00000000-0000-0000-0000-0000000000a3');
select public.accept_vendor_quote('00000000-0000-0000-0000-0000000000f1');
reset role;
select t.expect((select count(*) = 1 from public.vendor_bookings where quote_id = '00000000-0000-0000-0000-0000000000f1'),
                'organizer accept creates exactly one booking');
select t.expect_error($$insert into public.vendor_bookings (quote_id, org_id, vendor_id, total, currency)
                        values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1',
                                '00000000-0000-0000-0000-00000000000a', 1, 'INR')$$,
                      '23505', 'second booking for the same quote is rejected');

-- ── 4 · bookings: immutable parties and amounts ─────────────────────────────
select t.act_as('00000000-0000-0000-0000-0000000000a1');
select t.expect_error($$update public.vendor_bookings set commission_amount = 0
                        where quote_id = '00000000-0000-0000-0000-0000000000f1'$$,
                      '42501', 'vendor cannot zero commission');
select t.expect_error($$update public.vendor_bookings set total = 1
                        where quote_id = '00000000-0000-0000-0000-0000000000f1'$$,
                      '42501', 'vendor cannot change booking total');
update public.vendor_bookings set status = 'confirmed' where quote_id = '00000000-0000-0000-0000-0000000000f1';
select t.expect((select status = 'confirmed' from public.vendor_bookings where quote_id = '00000000-0000-0000-0000-0000000000f1'),
                'vendor can confirm a booking');
reset role;
select t.expect((select count(*) = 1 from public.vendor_availability a
                   join public.vendor_bookings b on b.id = a.booking_id
                  where b.quote_id = '00000000-0000-0000-0000-0000000000f1' and a.status = 'booked'),
                'confirming blocks the date');

select t.act_as('00000000-0000-0000-0000-0000000000a3');
select t.expect_error($$update public.vendor_bookings set vendor_id = '00000000-0000-0000-0000-00000000000b'
                        where quote_id = '00000000-0000-0000-0000-0000000000f1'$$,
                      '42501', 'organizer cannot re-point booking at a rival vendor');
reset role;

-- ── 5 · availability sync bugs ───────────────────────────────────────────────
-- (a) confirm on a day that is already blocked must not fail
insert into public.vendor_availability (vendor_id, date, status, note)
values ('00000000-0000-0000-0000-00000000000a', current_date + 60, 'held', 'manual');
insert into public.vendor_bookings (id, org_id, vendor_id, total, currency, event_date, status) values
  ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-00000000000a', 1000, 'INR', current_date + 60, 'pending');
select t.act_as('00000000-0000-0000-0000-0000000000a1');
update public.vendor_bookings set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000000b9';
reset role;
select t.expect(true, 'confirm on an already-blocked day succeeds');

-- (b) cancelling from in_progress releases the auto-block
select t.act_as('00000000-0000-0000-0000-0000000000a1');
update public.vendor_bookings set status = 'in_progress' where quote_id = '00000000-0000-0000-0000-0000000000f1';
update public.vendor_bookings set status = 'cancelled'   where quote_id = '00000000-0000-0000-0000-0000000000f1';
reset role;
select t.expect((select count(*) = 0 from public.vendor_availability a
                   join public.vendor_bookings b on b.id = a.booking_id
                  where b.quote_id = '00000000-0000-0000-0000-0000000000f1'),
                'cancel from in_progress releases the date');

-- ── 6 · team management ──────────────────────────────────────────────────────
select t.act_as('00000000-0000-0000-0000-0000000000a2');  -- staff
delete from public.vendor_members where user_id = '00000000-0000-0000-0000-0000000000a1';
reset role;
select t.expect((select count(*) = 1 from public.vendor_members where user_id = '00000000-0000-0000-0000-0000000000a1'),
                'staff cannot remove the owner');

select t.act_as('00000000-0000-0000-0000-0000000000a2');
select t.expect_error($$insert into public.vendor_members (vendor_id, user_id, role)
                        values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a4', 'owner')$$,
                      null, 'staff cannot add members');
reset role;

select t.act_as('00000000-0000-0000-0000-0000000000a1');
select t.expect_error($$delete from public.vendor_members where user_id = '00000000-0000-0000-0000-0000000000a1'$$,
                      '42501', 'last owner cannot leave');
reset role;

select t.expect_error($$insert into public.vendor_members (vendor_id, user_id, role)
                        values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a5', 'staff')$$,
                      '42501', 'unconfirmed email cannot join even if allowlisted');

-- ── 7 · storage ──────────────────────────────────────────────────────────────
select t.act_as('00000000-0000-0000-0000-0000000000a3');  -- organizer, not a member
select t.expect_error($$insert into storage.objects (bucket_id, name, owner)
                        values ('venue-media', '00000000-0000-0000-0000-0000000000c1/x.jpg', auth.uid())$$,
                      '42501', 'non-member cannot upload venue media');
reset role;

select t.act_as('00000000-0000-0000-0000-0000000000a2');  -- staff of A
insert into storage.objects (bucket_id, name, owner)
values ('venue-media', '00000000-0000-0000-0000-0000000000c1/x.jpg', auth.uid());
select t.expect(true, 'vendor member can upload to own venue');
select t.expect_error($$insert into storage.objects (bucket_id, name, owner)
                        values ('venue-media', 'not-a-uuid/x.jpg', auth.uid())$$,
                      '42501', 'malformed path is a clean 403, not a 500');
reset role;

select t.act_as('00000000-0000-0000-0000-0000000000a4');  -- rival owner
select t.expect_error($$insert into storage.objects (bucket_id, name, owner)
                        values ('vendor-media', '00000000-0000-0000-0000-00000000000a/logo.png', auth.uid())$$,
                      '42501', 'rival cannot write into another vendor''s folder');
reset role;

select t.expect((select not ('image/svg+xml' = any(allowed_mime_types)) from storage.buckets where id = 'venue-media'),
                'venue-media no longer accepts SVG');

-- ── 8 · URL and number sanity ────────────────────────────────────────────────
select t.act_as('00000000-0000-0000-0000-0000000000a1');
select t.expect_error($$update public.venues set map_url = 'javascript:alert(1)'
                        where id = '00000000-0000-0000-0000-0000000000c1'$$,
                      '23514', 'javascript: map link rejected');
select t.expect_error($$update public.venues set capacity_theater = -5
                        where id = '00000000-0000-0000-0000-0000000000c1'$$,
                      '23514', 'negative capacity rejected');
update public.venues set map_url = 'https://maps.app.goo.gl/abc' where id = '00000000-0000-0000-0000-0000000000c1';
select t.expect(true, 'https map link accepted');
reset role;

-- ── 9 · hidden venues' media is not public ───────────────────────────────────
select t.act_as_anon();
select t.expect((select count(*) = 1 from public.venue_media where venue_id = '00000000-0000-0000-0000-0000000000c1'),
                'anon sees listed venue media');
select t.expect((select count(*) = 0 from public.venue_media where venue_id = '00000000-0000-0000-0000-0000000000c2'),
                'anon cannot see draft venue media');
reset role;

-- ── 10 · reviews still recompute ratings through the definer path ────────────
update public.vendor_bookings set status = 'completed' where id = '00000000-0000-0000-0000-0000000000b9';
select t.act_as('00000000-0000-0000-0000-0000000000a3');
insert into public.vendor_reviews (booking_id, reviewer_id, reviewer_type, rating, comment)
values ('00000000-0000-0000-0000-0000000000b9', auth.uid(), 'organizer', 4, 'Great');
select t.expect_error($$insert into public.vendor_reviews (booking_id, reviewer_id, reviewer_type, rating)
                        values ('00000000-0000-0000-0000-0000000000b9', auth.uid(), 'organizer', 1)$$,
                      '23505', 'one organizer review per booking');
reset role;
select t.expect((select rating_count = 1 and rating_avg = 4 from public.vendors where id = '00000000-0000-0000-0000-00000000000a'),
                'rating recompute still updates protected columns');

rollback;
