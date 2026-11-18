-- =============================================================================
-- Integrity rules Prisma's schema language can't express, so a fresh database
-- (e.g. AWS RDS) gets the same guarantees as the Supabase one: CHECK
-- constraints (allowed statuses, non-negative money, http(s)-only URLs, length
-- caps) and expression indexes. Generated from the live Supabase definitions.
--
-- Idempotent: on the existing Supabase database every statement is a no-op,
-- because the constraints already exist there.
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.booking_milestones'::regclass and conname = 'booking_milestones_status_check') then
    alter table public.booking_milestones add constraint booking_milestones_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'invoiced'::text, 'paid'::text, 'overdue'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_venue_selections'::regclass and conname = 'event_venue_selections_event_type_length') then
    alter table public.event_venue_selections add constraint event_venue_selections_event_type_length CHECK (((event_type IS NULL) OR (length(event_type) <= 60)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_venue_selections'::regclass and conname = 'event_venue_selections_seating_arrangement_length') then
    alter table public.event_venue_selections add constraint event_venue_selections_seating_arrangement_length CHECK (((seating_arrangement IS NULL) OR (length(seating_arrangement) <= 60)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_venue_selections'::regclass and conname = 'event_venue_selections_status_check') then
    alter table public.event_venue_selections add constraint event_venue_selections_status_check CHECK ((status = ANY (ARRAY['contacted'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_venue_selections'::regclass and conname = 'event_venue_selections_venue_link_length') then
    alter table public.event_venue_selections add constraint event_venue_selections_venue_link_length CHECK (((venue_link IS NULL) OR (length(venue_link) <= 500)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_attendance_target_pct_check') then
    alter table public.events add constraint events_attendance_target_pct_check CHECK (((attendance_target_pct IS NULL) OR ((attendance_target_pct >= 0) AND (attendance_target_pct <= 100))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_event_format_check') then
    alter table public.events add constraint events_event_format_check CHECK ((event_format = ANY (ARRAY['physical'::text, 'virtual'::text, 'hybrid'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_status_check') then
    alter table public.events add constraint events_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text, 'completed'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_video_provider_check') then
    alter table public.events add constraint events_video_provider_check CHECK (((video_provider IS NULL) OR (video_provider = ANY (ARRAY['livekit'::text, 'agora'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_account_type_check') then
    alter table public.profiles add constraint profiles_account_type_check CHECK ((account_type = ANY (ARRAY['attendee'::text, 'organizer'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quotes'::regclass and conname = 'quotes_status_check') then
    alter table public.quotes add constraint quotes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'declined'::text, 'expired'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.rfqs'::regclass and conname = 'rfqs_status_check') then
    alter table public.rfqs add constraint rfqs_status_check CHECK ((status = ANY (ARRAY['open'::text, 'quoted'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_availability'::regclass and conname = 'vendor_availability_status_check') then
    alter table public.vendor_availability add constraint vendor_availability_status_check CHECK ((status = ANY (ARRAY['available'::text, 'held'::text, 'booked'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_bookings'::regclass and conname = 'vendor_bookings_deposit_status_check') then
    alter table public.vendor_bookings add constraint vendor_bookings_deposit_status_check CHECK ((deposit_status = ANY (ARRAY['pending'::text, 'received'::text, 'refunded'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_bookings'::regclass and conname = 'vendor_bookings_status_check') then
    alter table public.vendor_bookings add constraint vendor_bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_email_otps'::regclass and conname = 'vendor_email_otps_purpose_check') then
    alter table public.vendor_email_otps add constraint vendor_email_otps_purpose_check CHECK ((purpose = ANY (ARRAY['signup'::text, 'login'::text, 'reverify'::text, 'password_reset'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_members'::regclass and conname = 'vendor_members_role_check') then
    alter table public.vendor_members add constraint vendor_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'staff'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_portfolio'::regclass and conname = 'vendor_portfolio_media_type_check') then
    alter table public.vendor_portfolio add constraint vendor_portfolio_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_reviews'::regclass and conname = 'vendor_reviews_rating_check') then
    alter table public.vendor_reviews add constraint vendor_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_reviews'::regclass and conname = 'vendor_reviews_reviewer_type_check') then
    alter table public.vendor_reviews add constraint vendor_reviews_reviewer_type_check CHECK ((reviewer_type = ANY (ARRAY['organizer'::text, 'vendor'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_services'::regclass and conname = 'vendor_services_category_length') then
    alter table public.vendor_services add constraint vendor_services_category_length CHECK (((category IS NULL) OR (length(category) <= 40)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_services'::regclass and conname = 'vendor_services_unit_check') then
    alter table public.vendor_services add constraint vendor_services_unit_check CHECK ((unit = ANY (ARRAY['per_hour'::text, 'per_event'::text, 'per_person'::text, 'per_day'::text, 'flat'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendors'::regclass and conname = 'vendors_commission_rate_check') then
    alter table public.vendors add constraint vendors_commission_rate_check CHECK (((commission_rate >= (5)::numeric) AND (commission_rate <= (15)::numeric)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendors'::regclass and conname = 'vendors_verification_status_check') then
    alter table public.vendors add constraint vendors_verification_status_check CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venue_media'::regclass and conname = 'venue_media_kind_check') then
    alter table public.venue_media add constraint venue_media_kind_check CHECK ((media_kind = ANY (ARRAY['empty_hall'::text, 'setup'::text, 'facility'::text, 'floor_plan'::text, 'video'::text, 'other'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_alcohol_policy_check') then
    alter table public.venues add constraint venues_alcohol_policy_check CHECK (((alcohol_policy IS NULL) OR (alcohol_policy = ANY (ARRAY['in_house_only'::text, 'outside_with_license'::text, 'prohibited'::text, 'both'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_catering_policy_check') then
    alter table public.venues add constraint venues_catering_policy_check CHECK (((catering_policy IS NULL) OR (catering_policy = ANY (ARRAY['in_house_only'::text, 'outside_permitted'::text, 'both'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_climate_control_check') then
    alter table public.venues add constraint venues_climate_control_check CHECK (((climate_control IS NULL) OR (climate_control = ANY (ARRAY['central_ac'::text, 'split_ac'::text, 'non_ac'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_decor_policy_check') then
    alter table public.venues add constraint venues_decor_policy_check CHECK (((decor_policy IS NULL) OR (decor_policy = ANY (ARRAY['empanelled_only'::text, 'client_choice'::text, 'both'::text]))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_location_lengths') then
    alter table public.venues add constraint venues_location_lengths CHECK ((((address_line IS NULL) OR (length(address_line) <= 300)) AND ((city IS NULL) OR (length(city) <= 80)) AND ((state IS NULL) OR (length(state) <= 80)) AND ((pincode IS NULL) OR (length(pincode) <= 12)) AND ((map_url IS NULL) OR (length(map_url) <= 500))));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_name_length') then
    alter table public.venues add constraint venues_name_length CHECK (((length(name) >= 1) AND (length(name) <= 120)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_space_type_length') then
    alter table public.venues add constraint venues_space_type_length CHECK (((space_type IS NULL) OR (length(space_type) <= 60)));
  end if;
end $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles USING btree (lower(username)) WHERE (username IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_subdomain_unique ON public.organizations USING btree (lower(subdomain)) WHERE (subdomain IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_custom_domain_unique ON public.organizations USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);
CREATE INDEX IF NOT EXISTS events_previous_event_idx ON public.events USING btree (previous_event_id) WHERE (previous_event_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_availability_vendor_date_venue_uniq ON public.vendor_availability USING btree (vendor_id, date, COALESCE(venue_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_vendor_email_otps_lookup ON public.vendor_email_otps USING btree (email, purpose, created_at DESC) WHERE (consumed_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_vendor_email_otps_email ON public.vendor_email_otps USING btree (lower(email));
CREATE INDEX IF NOT EXISTS venues_city_lower_idx ON public.venues USING btree (lower(city));
