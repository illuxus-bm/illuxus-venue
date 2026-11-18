-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "booking_milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_venue_selections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "venue_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'contacted',
    "notes" TEXT,
    "selected_service_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "event_type" TEXT,
    "event_duration_hours" DECIMAL(5,1),
    "expected_attendees" INTEGER,
    "seating_capacity" INTEGER,
    "seating_arrangement" TEXT,
    "needs_pre_function_area" BOOLEAN NOT NULL DEFAULT false,
    "needs_vip_area" BOOLEAN NOT NULL DEFAULT false,
    "needs_additional_rooms" BOOLEAN NOT NULL DEFAULT false,
    "venue_link" TEXT,
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_notified_status" TEXT,

    CONSTRAINT "event_venue_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID,
    "user_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMPTZ(6),
    "end_date" TIMESTAMPTZ(6),
    "timezone" TEXT,
    "location" TEXT,
    "venue" TEXT,
    "capacity" INTEGER,
    "event_format" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "banner_landscape_url" TEXT,
    "banner_portrait_url" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "owner_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "display_name" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "avatar_url" TEXT,
    "mobile_country_code" TEXT,
    "mobile_number" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" BIGINT NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rfq_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "total" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "valid_until" DATE,
    "inclusions" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_invitees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rfq_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),
    "declined" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "rfq_invitees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfqs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "event_id" UUID,
    "category_id" UUID,
    "created_by" UUID,
    "requirements" TEXT NOT NULL DEFAULT '',
    "event_city" TEXT,
    "event_date" DATE,
    "expected_guests" INTEGER,
    "budget_min" BIGINT,
    "budget_max" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "note" TEXT,
    "booking_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venue_id" UUID,

    CONSTRAINT "vendor_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id" UUID,
    "rfq_id" UUID,
    "org_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "event_id" UUID,
    "total" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "commission_amount" BIGINT NOT NULL DEFAULT 0,
    "event_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deposit_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_category_map" (
    "vendor_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_category_map_pkey" PRIMARY KEY ("vendor_id","category_id")
);

-- CreateTable
CREATE TABLE "vendor_email_allowlist" (
    "email" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_email_allowlist_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "vendor_email_otps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_email_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_message_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "rfq_id" UUID,
    "booking_id" UUID,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_type" TEXT NOT NULL DEFAULT 'vendor',
    "body" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_portfolio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "media_type" TEXT NOT NULL DEFAULT 'image',
    "caption" TEXT,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "reviewer_type" TEXT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_service_addons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_service_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_service_areas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT,
    "radius_km" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "base_price" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unit" TEXT NOT NULL DEFAULT 'per_event',
    "duration" TEXT,
    "is_instant_book" BOOLEAN NOT NULL DEFAULT false,
    "quote_on_request" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venue_id" UUID,
    "category" TEXT,

    CONSTRAINT "vendor_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_name" TEXT NOT NULL,
    "tagline" TEXT,
    "bio" TEXT,
    "website" TEXT,
    "city" TEXT,
    "country" TEXT,
    "logo_url" TEXT,
    "cover_url" TEXT,
    "years_experience" INTEGER,
    "response_time_hours" INTEGER,
    "socials" JSONB DEFAULT '{}',
    "notify_email" BOOLEAN NOT NULL DEFAULT true,
    "auto_reply" TEXT,
    "default_currency" TEXT NOT NULL DEFAULT 'USD',
    "rating_avg" DECIMAL(3,2) DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "verification_status" TEXT NOT NULL DEFAULT 'unverified',
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "media_kind" TEXT NOT NULL DEFAULT 'empty_hall',
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "space_type" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "area_sqft" INTEGER,
    "length_ft" DECIMAL(6,1),
    "width_ft" DECIMAL(6,1),
    "ceiling_height_ft" DECIMAL(4,1),
    "capacity_floating" INTEGER,
    "capacity_theater" INTEGER,
    "capacity_banquet" INTEGER,
    "capacity_ushape" INTEGER,
    "capacity_classroom" INTEGER,
    "climate_control" TEXT,
    "has_stage" BOOLEAN NOT NULL DEFAULT false,
    "stage_dimensions" TEXT,
    "green_rooms_count" INTEGER,
    "has_projector" BOOLEAN NOT NULL DEFAULT false,
    "has_screen" BOOLEAN NOT NULL DEFAULT false,
    "has_sound_system" BOOLEAN NOT NULL DEFAULT false,
    "has_microphones" BOOLEAN NOT NULL DEFAULT false,
    "has_power_backup" BOOLEAN NOT NULL DEFAULT false,
    "has_wifi" BOOLEAN NOT NULL DEFAULT false,
    "catering_policy" TEXT,
    "decor_policy" TEXT,
    "alcohol_policy" TEXT,
    "music_curfew_time" TIME(6),
    "noise_restrictions" TEXT,
    "parking_car_capacity" INTEGER,
    "parking_two_wheeler_capacity" INTEGER,
    "has_valet" BOOLEAN NOT NULL DEFAULT false,
    "wheelchair_accessible" BOOLEAN NOT NULL DEFAULT false,
    "has_elevator" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address_line" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "map_url" TEXT,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "email_verified_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_venue_selections_event_id_idx" ON "event_venue_selections"("event_id");

-- CreateIndex
CREATE INDEX "event_venue_selections_vendor_id_idx" ON "event_venue_selections"("vendor_id");

-- CreateIndex
CREATE INDEX "event_venue_selections_vendor_idx" ON "event_venue_selections"("vendor_id");

-- CreateIndex
CREATE INDEX "event_venue_selections_venue_status_idx" ON "event_venue_selections"("venue_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_org_id_user_id_key" ON "org_members"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "quotes_rfq_idx" ON "quotes"("rfq_id");

-- CreateIndex
CREATE INDEX "quotes_vendor_idx" ON "quotes"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_rfq_id_vendor_id_key" ON "quotes"("rfq_id", "vendor_id");

-- CreateIndex
CREATE INDEX "rfq_invitees_rfq_vendor_idx" ON "rfq_invitees"("rfq_id", "vendor_id");

-- CreateIndex
CREATE INDEX "rfq_invitees_vendor_idx" ON "rfq_invitees"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_invitees_rfq_id_vendor_id_key" ON "rfq_invitees"("rfq_id", "vendor_id");

-- CreateIndex
CREATE INDEX "vendor_availability_booking_idx" ON "vendor_availability"("booking_id");

-- CreateIndex
CREATE INDEX "vendor_availability_venue_idx" ON "vendor_availability"("venue_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bookings_quote_id_uniq" ON "vendor_bookings"("quote_id") WHERE (quote_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "vendor_bookings_org_idx" ON "vendor_bookings"("org_id");

-- CreateIndex
CREATE INDEX "vendor_bookings_vendor_idx" ON "vendor_bookings"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_categories_slug_key" ON "vendor_categories"("slug");

-- CreateIndex
CREATE INDEX "idx_vendor_email_otps_expires" ON "vendor_email_otps"("expires_at") WHERE (consumed_at IS NULL);

-- CreateIndex
CREATE INDEX "idx_vendor_email_otps_lookup" ON "vendor_email_otps"("email", "purpose", "created_at" DESC) WHERE (consumed_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_members_user_id_uniq" ON "vendor_members"("user_id");

-- CreateIndex
CREATE INDEX "vendor_members_user_vendor_idx" ON "vendor_members"("user_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_members_vendor_id_user_id_key" ON "vendor_members"("vendor_id", "user_id");

-- CreateIndex
CREATE INDEX "vendor_portfolio_vendor_idx" ON "vendor_portfolio"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_reviews_booking_idx" ON "vendor_reviews"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_reviews_booking_id_reviewer_type_key" ON "vendor_reviews"("booking_id", "reviewer_type");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_reviews_booking_reviewer_uniq" ON "vendor_reviews"("booking_id", "reviewer_type");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_service_areas_vendor_id_city_key" ON "vendor_service_areas"("vendor_id", "city");

-- CreateIndex
CREATE INDEX "vendor_services_vendor_idx" ON "vendor_services"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_services_venue_id_idx" ON "vendor_services"("venue_id");

-- CreateIndex
CREATE INDEX "venue_media_venue_id_idx" ON "venue_media"("venue_id");

-- CreateIndex
CREATE INDEX "venues_is_active_idx" ON "venues"("is_active");

-- CreateIndex
CREATE INDEX "venues_vendor_id_idx" ON "venues"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_family_id_idx" ON "auth_sessions"("family_id");

-- AddForeignKey
ALTER TABLE "booking_milestones" ADD CONSTRAINT "booking_milestones_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "event_venue_selections" ADD CONSTRAINT "event_venue_selections_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "event_venue_selections" ADD CONSTRAINT "event_venue_selections_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rfq_invitees" ADD CONSTRAINT "rfq_invitees_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rfq_invitees" ADD CONSTRAINT "rfq_invitees_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "vendor_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_availability" ADD CONSTRAINT "vendor_availability_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_availability" ADD CONSTRAINT "vendor_availability_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_availability" ADD CONSTRAINT "vendor_availability_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_bookings" ADD CONSTRAINT "vendor_bookings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_bookings" ADD CONSTRAINT "vendor_bookings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_bookings" ADD CONSTRAINT "vendor_bookings_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_bookings" ADD CONSTRAINT "vendor_bookings_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_bookings" ADD CONSTRAINT "vendor_bookings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_category_map" ADD CONSTRAINT "vendor_category_map_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "vendor_categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_category_map" ADD CONSTRAINT "vendor_category_map_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_members" ADD CONSTRAINT "vendor_members_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_message_threads" ADD CONSTRAINT "vendor_message_threads_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_message_threads" ADD CONSTRAINT "vendor_message_threads_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_message_threads" ADD CONSTRAINT "vendor_message_threads_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_message_threads" ADD CONSTRAINT "vendor_message_threads_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_messages" ADD CONSTRAINT "vendor_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "vendor_message_threads"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_portfolio" ADD CONSTRAINT "vendor_portfolio_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_reviews" ADD CONSTRAINT "vendor_reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_service_addons" ADD CONSTRAINT "vendor_service_addons_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "vendor_services"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_service_areas" ADD CONSTRAINT "vendor_service_areas_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_services" ADD CONSTRAINT "vendor_services_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_services" ADD CONSTRAINT "vendor_services_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "venue_media" ADD CONSTRAINT "venue_media_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

