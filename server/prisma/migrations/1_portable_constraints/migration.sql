-- =============================================================================
-- Integrity rules Prisma's schema language can't express, so a fresh database
-- (e.g. AWS RDS) gets the same guarantees as the Supabase one: CHECK
-- constraints (allowed statuses, non-negative money, http(s)-only URLs, length
-- caps) and expression indexes. Generated from the live definitions.
--
-- Idempotent: on the existing Supabase database every statement is a no-op,
-- because the constraints already exist there.
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.booking_milestones'::regclass and conname = 'booking_milestones_amount_check') then
    alter table public.booking_milestones add constraint booking_milestones_amount_check CHECK ((amount >= 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.booking_milestones'::regclass and conname = 'booking_milestones_status_check') then
    alter table public.booking_milestones add constraint booking_milestones_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'completed'::text, 'waived'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_venue_selections'::regclass and conname = 'event_venue_selections_event_duration_hours_check') then
    alter table public.event_venue_selections add constraint event_venue_selections_event_duration_hours_check CHECK (((event_duration_hours IS NULL) OR (event_duration_hours > (0)::numeric)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_venue_selections'::regclass and conname = 'event_venue_selections_expected_attendees_check') then
    alter table public.event_venue_selections add constraint event_venue_selections_expected_attendees_check CHECK (((expected_attendees IS NULL) OR (expected_attendees >= 0)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_venue_selections'::regclass and conname = 'event_venue_selections_seating_capacity_check') then
    alter table public.event_venue_selections add constraint event_venue_selections_seating_capacity_check CHECK (((seating_capacity IS NULL) OR (seating_capacity >= 0)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.event_venue_selections'::regclass and conname = 'event_venue_selections_status_check') then
    alter table public.event_venue_selections add constraint event_venue_selections_status_check CHECK ((status = ANY (ARRAY['contacted'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_check') then
    alter table public.events add constraint events_check CHECK (((end_date IS NULL) OR (date IS NULL) OR (end_date >= date)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_status_check') then
    alter table public.events add constraint events_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text, 'completed'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.org_members'::regclass and conname = 'org_members_role_check') then
    alter table public.org_members add constraint org_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_line_items'::regclass and conname = 'quote_line_items_amount_check') then
    alter table public.quote_line_items add constraint quote_line_items_amount_check CHECK ((amount >= 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_line_items'::regclass and conname = 'quote_line_items_quantity_check') then
    alter table public.quote_line_items add constraint quote_line_items_quantity_check CHECK ((quantity > (0)::numeric));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quote_line_items'::regclass and conname = 'quote_line_items_unit_price_check') then
    alter table public.quote_line_items add constraint quote_line_items_unit_price_check CHECK ((unit_price >= 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quotes'::regclass and conname = 'quotes_status_check') then
    alter table public.quotes add constraint quotes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'declined'::text, 'expired'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.quotes'::regclass and conname = 'quotes_total_check') then
    alter table public.quotes add constraint quotes_total_check CHECK ((total >= 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.rfqs'::regclass and conname = 'rfqs_budget_max_check') then
    alter table public.rfqs add constraint rfqs_budget_max_check CHECK (((budget_max IS NULL) OR (budget_max >= 0)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.rfqs'::regclass and conname = 'rfqs_budget_min_check') then
    alter table public.rfqs add constraint rfqs_budget_min_check CHECK (((budget_min IS NULL) OR (budget_min >= 0)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.rfqs'::regclass and conname = 'rfqs_check') then
    alter table public.rfqs add constraint rfqs_check CHECK (((budget_min IS NULL) OR (budget_max IS NULL) OR (budget_max >= budget_min)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.rfqs'::regclass and conname = 'rfqs_expected_guests_check') then
    alter table public.rfqs add constraint rfqs_expected_guests_check CHECK (((expected_guests IS NULL) OR (expected_guests >= 0)));
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
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_bookings'::regclass and conname = 'vendor_bookings_total_check') then
    alter table public.vendor_bookings add constraint vendor_bookings_total_check CHECK ((total >= 0));
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
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_messages'::regclass and conname = 'vendor_messages_sender_type_check') then
    alter table public.vendor_messages add constraint vendor_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['organizer'::text, 'vendor'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_portfolio'::regclass and conname = 'vendor_portfolio_media_type_check') then
    alter table public.vendor_portfolio add constraint vendor_portfolio_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_portfolio'::regclass and conname = 'vendor_portfolio_url_http') then
    alter table public.vendor_portfolio add constraint vendor_portfolio_url_http CHECK ((url ~* '^https?://'::text)) NOT VALID;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_reviews'::regclass and conname = 'vendor_reviews_rating_check') then
    alter table public.vendor_reviews add constraint vendor_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_reviews'::regclass and conname = 'vendor_reviews_rating_range') then
    alter table public.vendor_reviews add constraint vendor_reviews_rating_range CHECK (((rating >= 1) AND (rating <= 5))) NOT VALID;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_reviews'::regclass and conname = 'vendor_reviews_reviewer_type_check') then
    alter table public.vendor_reviews add constraint vendor_reviews_reviewer_type_check CHECK ((reviewer_type = ANY (ARRAY['organizer'::text, 'vendor'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_service_addons'::regclass and conname = 'vendor_service_addons_price_check') then
    alter table public.vendor_service_addons add constraint vendor_service_addons_price_check CHECK ((price >= 0));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_service_areas'::regclass and conname = 'vendor_service_areas_radius_km_check') then
    alter table public.vendor_service_areas add constraint vendor_service_areas_radius_km_check CHECK (((radius_km IS NULL) OR (radius_km >= 0)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendor_services'::regclass and conname = 'vendor_services_base_price_check') then
    alter table public.vendor_services add constraint vendor_services_base_price_check CHECK ((base_price >= 0));
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
    alter table public.vendors add constraint vendors_commission_rate_check CHECK (((commission_rate >= (0)::numeric) AND (commission_rate <= (100)::numeric)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendors'::regclass and conname = 'vendors_response_time_hours_check') then
    alter table public.vendors add constraint vendors_response_time_hours_check CHECK (((response_time_hours IS NULL) OR (response_time_hours >= 0)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendors'::regclass and conname = 'vendors_verification_status_check') then
    alter table public.vendors add constraint vendors_verification_status_check CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vendors'::regclass and conname = 'vendors_years_experience_check') then
    alter table public.vendors add constraint vendors_years_experience_check CHECK (((years_experience IS NULL) OR (years_experience >= 0)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venue_media'::regclass and conname = 'venue_media_kind_check') then
    alter table public.venue_media add constraint venue_media_kind_check CHECK ((media_kind = ANY (ARRAY['empty_hall'::text, 'setup'::text, 'facility'::text, 'floor_plan'::text, 'video'::text, 'other'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venue_media'::regclass and conname = 'venue_media_url_http') then
    alter table public.venue_media add constraint venue_media_url_http CHECK ((url ~* '^https?://'::text)) NOT VALID;
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
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_map_url_https') then
    alter table public.venues add constraint venues_map_url_https CHECK (((map_url IS NULL) OR (map_url ~* '^https?://'::text))) NOT VALID;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_name_length') then
    alter table public.venues add constraint venues_name_length CHECK (((length(name) >= 1) AND (length(name) <= 120)));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_numbers_non_negative') then
    alter table public.venues add constraint venues_numbers_non_negative CHECK (((COALESCE(area_sqft, 0) >= 0) AND (COALESCE(length_ft, (0)::numeric) >= (0)::numeric) AND (COALESCE(width_ft, (0)::numeric) >= (0)::numeric) AND (COALESCE(ceiling_height_ft, (0)::numeric) >= (0)::numeric) AND (COALESCE(capacity_floating, 0) >= 0) AND (COALESCE(capacity_theater, 0) >= 0) AND (COALESCE(capacity_banquet, 0) >= 0) AND (COALESCE(capacity_ushape, 0) >= 0) AND (COALESCE(capacity_classroom, 0) >= 0) AND (COALESCE(green_rooms_count, 0) >= 0) AND (COALESCE(parking_car_capacity, 0) >= 0) AND (COALESCE(parking_two_wheeler_capacity, 0) >= 0))) NOT VALID;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_space_type_length') then
    alter table public.venues add constraint venues_space_type_length CHECK (((space_type IS NULL) OR (length(space_type) <= 60)));
  end if;
end $$;

CREATE INDEX IF NOT EXISTS venues_city_lower_idx ON public.venues USING btree (lower(city));
CREATE UNIQUE INDEX IF NOT EXISTS vendor_availability_vendor_date_venue_uniq ON public.vendor_availability USING btree (vendor_id, date, COALESCE(venue_id, '00000000-0000-0000-0000-000000000000'::uuid));
