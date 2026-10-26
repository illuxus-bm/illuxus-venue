import * as React from "react";
import { Link, useParams } from "react-router-dom";
import {
  Accessibility,
  ArrowLeft,
  BadgeCheck,
  Car,
  Check,
  Map as MapIcon,
  MapPin,
  Ruler,
  Users,
} from "lucide-react";

import { PublicPage } from "@/components/landing/PublicChrome";
import { PillLink, PosterTitle, Reveal, SiteContainer } from "@/components/landing/primitives";
import { VenueIllustration } from "@/components/landing/VenueIllustration";
import { MediaGallery } from "@/components/public/MediaGallery";
import { mediaKindFromUrl, type GalleryItem } from "@/lib/media";
import { NotFoundBlock } from "@/components/public/NotFoundBlock";
import { PublicServiceList } from "@/components/public/PublicServiceList";
import { StarRating } from "@/components/StarRating";
import type { Venue } from "@/hooks/useMyVenues";
import { usePublicVenue } from "@/hooks/usePublicProfile";
import {
  ALCOHOL_LABEL,
  CAPACITY_LAYOUTS,
  CATERING_LABEL,
  CLIMATE_LABEL,
  DECOR_LABEL,
  formatTimeOfDay,
  spaceTypeLabel,
} from "@/lib/venueLabels";
import { initials, planEventUrl } from "@/lib/utils";

/**
 * Public page for one venue (/venues/:venueId): gallery, capacity by seating
 * layout, amenities, house rules, location and the add-on services offered
 * here. Booking happens in illuxus, so the call to action goes there.
 * Unlisted venues (is_active = false) aren't readable publicly and show as
 * not found.
 */
export default function PublicVenuePage() {
  const { venueId } = useParams<{ venueId: string }>();
  const { data, isLoading, error } = usePublicVenue(venueId);

  React.useEffect(() => {
    if (data?.venue) document.title = `${data.venue.name} · Illuxus Venues`;
  }, [data?.venue]);

  if (isLoading) {
    return (
      <PublicPage>
        <SiteContainer className="space-y-6 pb-24 pt-28">
          <div className="h-6 w-40 animate-pulse rounded bg-card" />
          <div className="h-12 w-2/3 animate-pulse rounded-lg bg-card" />
          <div className="aspect-[16/9] animate-pulse rounded-[20px] border border-border bg-card" />
        </SiteContainer>
      </PublicPage>
    );
  }

  if (error || !data) {
    return (
      <PublicPage>
        <NotFoundBlock
          title={error ? "We couldn't load this venue" : "Venue not found"}
          body={error ? "Please try again in a moment." : "This venue isn't listed right now, or the link is out of date."}
        />
      </PublicPage>
    );
  }

  const { venue, media, vendor, services } = data;
  const gallery: GalleryItem[] = media.map((m) => ({
    id: m.id,
    url: m.url,
    caption: m.caption,
    kind: mediaKindFromUrl(m.url, m.media_kind),
  }));
  const address = [venue.address_line, venue.city, venue.state, venue.pincode].filter(Boolean).join(", ");
  const capacities = CAPACITY_LAYOUTS.map((l): { label: string; value: number | null } => ({
    label: l.label,
    value: venue[l.key],
  })).filter(
    (c): c is { label: string; value: number } => typeof c.value === "number" && c.value > 0,
  );
  const largest = capacities.reduce((max, c) => Math.max(max, c.value), 0);

  return (
    <PublicPage>
      <section className="pb-10 pt-24 lg:pt-28">
        <SiteContainer>
          <Link
            to={`/v/${vendor.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {vendor.business_name}
          </Link>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <span className="eyebrow text-primary">{spaceTypeLabel(venue.space_type)}</span>
              <PosterTitle as="h1" immediate text={venue.name} className="mt-2 text-[clamp(44px,6.5vw,92px)]" />
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-muted-foreground">
                {(venue.city || address) && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {venue.city ?? address}
                  </span>
                )}
                {largest > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    Up to {largest.toLocaleString("en-IN")} guests
                  </span>
                )}
                {venue.area_sqft ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Ruler className="h-4 w-4" />
                    {venue.area_sqft.toLocaleString("en-IN")} sq ft
                  </span>
                ) : null}
              </div>
            </div>
            <PillLink href={planEventUrl()} arrow>
              Check dates &amp; book
            </PillLink>
          </div>

          <div className="mt-8">
            {gallery.length > 0 ? (
              <MediaGallery items={gallery} />
            ) : (
              <div className="aspect-[16/9] overflow-hidden rounded-[20px] border border-border bg-muted">
                <VenueIllustration className="h-full w-full" />
              </div>
            )}
          </div>
        </SiteContainer>
      </section>

      <section className="border-t border-border py-12 md:py-16">
        <SiteContainer className="grid gap-10 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-12">
            {venue.description && (
              <Block title="About this space">
                <p className="whitespace-pre-line text-[16px] leading-relaxed text-foreground/90">{venue.description}</p>
              </Block>
            )}

            {capacities.length > 0 && (
              <Block title="Capacity by layout">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {capacities.map((c) => (
                    <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
                      <p className="poster text-[36px] leading-none text-foreground">{c.value.toLocaleString("en-IN")}</p>
                      <p className="mt-1.5 text-[13px] text-muted-foreground">{c.label}</p>
                    </div>
                  ))}
                </div>
              </Block>
            )}

            <SpaceFacts venue={venue} />
            <Amenities venue={venue} />
            <Policies venue={venue} />

            {services.length > 0 && (
              <Block title="Add-on services">
                <p className="-mt-2 mb-5 text-[14px] text-muted-foreground">
                  Tick the ones you want when you request this venue on Illuxus.
                </p>
                <PublicServiceList services={services} />
              </Block>
            )}

            {(address || venue.map_url) && (
              <Block title="Location">
                {address && <p className="text-[16px]">{address}</p>}
                {venue.map_url && (
                  <a
                    href={venue.map_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold underline decoration-accent decoration-2 underline-offset-[6px]"
                  >
                    <MapIcon className="h-4 w-4" />
                    Open in Google Maps
                  </a>
                )}
              </Block>
            )}
          </div>

          {/* Booking card: stays in view beside the details on wide screens. */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Reveal className="rounded-[22px] border border-accent/40 bg-card p-6">
              <p className="eyebrow text-muted-foreground">Book this venue</p>
              <p className="mt-3 text-[15px] leading-relaxed">
                Create your event on Illuxus with your dates and city. If {venue.name} is free on every day of your
                event, you can request it with the services you need.
              </p>
              <PillLink href={planEventUrl()} arrow className="mt-5 w-full">
                Plan your event
              </PillLink>
              <div className="mt-6 border-t border-border pt-5">
                <p className="text-[12px] text-muted-foreground">Operated by</p>
                <Link to={`/v/${vendor.id}`} className="mt-2 flex items-center gap-3 rounded-xl p-1 -m-1 hover:bg-muted/60">
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                    {vendor.logo_url ? (
                      <img src={vendor.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="poster text-[18px] text-primary">{initials(vendor.business_name)}</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate font-semibold">
                      {vendor.business_name}
                      {vendor.verification_status === "verified" && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />}
                    </span>
                    {vendor.rating_count > 0 ? (
                      <StarRating value={vendor.rating_avg ?? 0} count={vendor.rating_count} />
                    ) : (
                      <span className="text-[12px] text-muted-foreground">View profile</span>
                    )}
                  </span>
                </Link>
              </div>
            </Reveal>
          </aside>
        </SiteContainer>
      </section>
    </PublicPage>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Reveal as="section">
      <h2 className="poster text-[clamp(28px,3.4vw,40px)] text-foreground">{title}</h2>
      <div className="mt-5">{children}</div>
    </Reveal>
  );
}

function FactGrid({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  if (shown.length === 0) return null;
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label} className="border-b border-border pb-3">
          <dt className="text-[12px] text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-[15px] font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SpaceFacts({ venue }: { venue: Venue }) {
  const ft = (n: number | null) => (n ? `${n} ft` : null);
  const rows: Array<[string, string | null]> = [
    ["Area", venue.area_sqft ? `${venue.area_sqft.toLocaleString("en-IN")} sq ft` : null],
    ["Dimensions", venue.length_ft && venue.width_ft ? `${venue.length_ft} × ${venue.width_ft} ft` : null],
    ["Ceiling height", ft(venue.ceiling_height_ft)],
    ["Climate", venue.climate_control ? CLIMATE_LABEL[venue.climate_control] : null],
  ];
  if (!rows.some((r) => r[1])) return null;
  return (
    <Block title="The space">
      <FactGrid rows={rows} />
    </Block>
  );
}

function Amenities({ venue }: { venue: Venue }) {
  const items = [
    venue.has_stage && (venue.stage_dimensions ? `Stage (${venue.stage_dimensions})` : "Stage"),
    venue.green_rooms_count ? `${venue.green_rooms_count} green room${venue.green_rooms_count === 1 ? "" : "s"}` : null,
    venue.has_projector && "Projector",
    venue.has_screen && "Screen",
    venue.has_sound_system && "Sound system",
    venue.has_microphones && "Microphones",
    venue.has_power_backup && "Power backup",
    venue.has_wifi && "Wi-Fi",
  ].filter((i): i is string => typeof i === "string");

  const access = [
    venue.parking_car_capacity ? `Parking for ${venue.parking_car_capacity} cars` : null,
    venue.parking_two_wheeler_capacity ? `Parking for ${venue.parking_two_wheeler_capacity} two-wheelers` : null,
    venue.has_valet && "Valet",
    venue.wheelchair_accessible && "Wheelchair accessible",
    venue.has_elevator && "Elevator",
  ].filter((i): i is string => typeof i === "string");

  if (items.length === 0 && access.length === 0) return null;
  return (
    <Block title="Amenities">
      <div className="grid gap-8 sm:grid-cols-2">
        {items.length > 0 && <CheckList items={items} />}
        {access.length > 0 && (
          <div>
            <p className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
              <Car className="h-4 w-4" />
              <Accessibility className="h-4 w-4" />
              Getting there
            </p>
            <CheckList items={access} />
          </div>
        )}
      </div>
    </Block>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[15px]">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Policies({ venue }: { venue: Venue }) {
  const curfew = formatTimeOfDay(venue.music_curfew_time);
  const rows: Array<[string, string | null]> = [
    ["Catering", venue.catering_policy ? CATERING_LABEL[venue.catering_policy] : null],
    ["Decor", venue.decor_policy ? DECOR_LABEL[venue.decor_policy] : null],
    ["Alcohol", venue.alcohol_policy ? ALCOHOL_LABEL[venue.alcohol_policy] : null],
    ["Music until", curfew],
    ["Noise", venue.noise_restrictions],
  ];
  if (!rows.some((r) => r[1])) return null;
  return (
    <Block title="House rules">
      <FactGrid rows={rows} />
    </Block>
  );
}
