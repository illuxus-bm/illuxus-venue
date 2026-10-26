import * as React from "react";
import { useParams } from "react-router-dom";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  Clock,
  Facebook,
  Globe,
  ImageIcon,
  Instagram,
  Linkedin,
  MapPin,
  MessageSquareQuote,
  Star,
  UtensilsCrossed,
  Youtube,
} from "lucide-react";

import { PublicPage, VenueCard } from "@/components/landing/PublicChrome";
import { PillLink, PosterTitle, Reveal, SectionChip, SiteContainer } from "@/components/landing/primitives";
import { MediaGallery } from "@/components/public/MediaGallery";
import { mediaKindFromUrl } from "@/lib/media";
import { NotFoundBlock } from "@/components/public/NotFoundBlock";
import { PublicServiceList } from "@/components/public/PublicServiceList";
import { StarRating } from "@/components/StarRating";
import { usePublicVendorProfile, useVendorVenues, type PublicReview } from "@/hooks/usePublicProfile";
import { initials, planEventUrl } from "@/lib/utils";

/**
 * Public profile of a venue business (/v/:vendorId): who they are, the
 * venues they list, the add-on services they offer, their portfolio and
 * organizer reviews. Linked from the dashboard's "View public profile".
 */
export default function PublicProfilePage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const { data, isLoading, error } = usePublicVendorProfile(vendorId);
  const { venues, isLoading: venuesLoading } = useVendorVenues(vendorId);

  React.useEffect(() => {
    if (data?.vendor) document.title = `${data.vendor.business_name} · Illuxus Venues`;
  }, [data?.vendor]);

  if (isLoading) {
    return (
      <PublicPage>
        <SiteContainer className="space-y-6 pb-24 pt-28">
          <div className="h-56 animate-pulse rounded-[28px] border border-border bg-card" />
          <div className="h-10 w-2/3 animate-pulse rounded-lg bg-card" />
          <div className="h-5 w-1/2 animate-pulse rounded bg-card" />
        </SiteContainer>
      </PublicPage>
    );
  }

  if (error || !data) {
    return (
      <PublicPage>
        <NotFoundBlock
          title={error ? "We couldn't load this profile" : "Profile not found"}
          body={error ? "Please try again in a moment." : "This venue partner may have moved or no longer lists with Illuxus."}
        />
      </PublicPage>
    );
  }

  const { vendor, services, portfolio, reviews, serviceAreas } = data;
  const venueNames = new Map(venues.map((v) => [v.id, v.name]));
  const location = [vendor.city, vendor.country].filter(Boolean).join(", ");
  const socials = socialLinks(vendor.socials);

  return (
    <PublicPage>
      {/* ─── Cover + identity ─── */}
      <section className="pb-12 pt-24 lg:pt-28">
        <SiteContainer>
          <div className="relative overflow-hidden rounded-[28px] border border-border bg-card">
            <div className="relative h-44 sm:h-60">
              {vendor.cover_url ? (
                <img src={vendor.cover_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-primary/20 via-transparent to-accent/20">
                  <div aria-hidden="true" className="floor-plane opacity-60" />
                </div>
              )}
            </div>

            <div className="relative px-5 pb-6 sm:px-8 sm:pb-8">
              <div className="-mt-12 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-end gap-4">
                  <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-card bg-muted sm:h-28 sm:w-28">
                    {vendor.logo_url ? (
                      <img src={vendor.logo_url} alt={`${vendor.business_name} logo`} className="h-full w-full object-cover" />
                    ) : (
                      <span className="poster text-[40px] text-primary">{initials(vendor.business_name)}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PillLink href={planEventUrl()} size="md" arrow>
                    Book a venue
                  </PillLink>
                  {vendor.website && (
                    <PillLink href={externalUrl(vendor.website)} size="md" variant="outline">
                      <Globe className="h-4 w-4" />
                      Website
                    </PillLink>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <h1 className="poster text-[clamp(40px,5.5vw,68px)] leading-[0.95] text-foreground">{vendor.business_name}</h1>
                {vendor.verification_status === "verified" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[12px] font-semibold text-primary">
                    <BadgeCheck className="h-4 w-4" />
                    Verified
                  </span>
                )}
              </div>
              {vendor.tagline && <p className="mt-2 max-w-2xl text-[17px] text-muted-foreground">{vendor.tagline}</p>}

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-muted-foreground">
                {location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {location}
                  </span>
                )}
                {vendor.rating_count > 0 && <StarRating value={vendor.rating_avg ?? 0} count={vendor.rating_count} />}
                {vendor.years_experience ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" />
                    {vendor.years_experience}+ years in events
                  </span>
                ) : null}
                {vendor.response_time_hours ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    Replies within {vendor.response_time_hours} h
                  </span>
                ) : null}
              </div>

              {socials.length > 0 && (
                <div className="mt-4 flex items-center gap-2">
                  {socials.map(({ href, label, Icon }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={label}
                      className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SiteContainer>
      </section>

      {/* ─── About ─── */}
      {(vendor.bio || serviceAreas.length > 0) && (
        <Section>
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            {vendor.bio && (
              <div>
                <h2 className="eyebrow text-muted-foreground">About</h2>
                <p className="mt-3 whitespace-pre-line text-[16px] leading-relaxed text-foreground/90">{vendor.bio}</p>
              </div>
            )}
            {serviceAreas.length > 0 && (
              <div>
                <h2 className="eyebrow text-muted-foreground">Serves</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {serviceAreas.map((a) => (
                    <span key={a} className="rounded-full border border-border bg-card px-3 py-1 text-[13px]">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ─── Venues ─── */}
      <Section id="venues" chip={{ icon: Building2, label: "Venues" }} title={`Spaces at ${vendor.business_name}`}>
        {venuesLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[340px] animate-pulse rounded-[20px] border border-border bg-card" />
            ))}
          </div>
        ) : venues.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((venue, i) => (
              <Reveal key={venue.id} index={i % 3}>
                <VenueCard venue={venue} />
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyNote text="No venues are listed right now." />
        )}
      </Section>

      {/* ─── Services ─── */}
      {services.length > 0 && (
        <Section chip={{ icon: UtensilsCrossed, label: "Add-on services" }} title="Everything they can arrange">
          <PublicServiceList services={services} venueNames={venueNames} />
        </Section>
      )}

      {/* ─── Portfolio ─── */}
      {portfolio.length > 0 && (
        <Section chip={{ icon: ImageIcon, label: "Portfolio" }} title="Events they've hosted">
          <MediaGallery
            items={portfolio.map((p) => ({
              id: p.id,
              url: p.url,
              caption: p.caption,
              kind: p.media_type === "video" ? "video" : mediaKindFromUrl(p.url),
            }))}
          />
        </Section>
      )}

      {/* ─── Reviews ─── */}
      <Section chip={{ icon: MessageSquareQuote, label: "Reviews" }} title="What organizers say">
        {reviews.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {reviews.map((r, i) => (
              <Reveal key={r.id} index={i % 2}>
                <ReviewCard review={r} />
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyNote text="No reviews yet. Reviews appear here after organizers complete events with this venue partner." />
        )}
      </Section>

      <section className="pb-24 pt-4">
        <SiteContainer>
          <div className="relative overflow-hidden rounded-[28px] border border-accent/40 bg-card px-6 py-14 text-center sm:px-12">
            <div aria-hidden="true" className="floor-plane opacity-60" />
            <div className="relative">
              <PosterTitle text={`Host your next event with ${vendor.business_name}`} className="mx-auto max-w-3xl text-[clamp(36px,5vw,64px)]" />
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                Create your event on Illuxus with your dates and city; their venues show up when they're free.
              </p>
              <div className="mt-8 flex justify-center">
                <PillLink href={planEventUrl()} arrow>
                  Plan your event
                </PillLink>
              </div>
            </div>
          </div>
        </SiteContainer>
      </section>
    </PublicPage>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function Section({
  id,
  chip,
  title,
  children,
}: {
  id?: string;
  chip?: { icon: typeof Star; label: string };
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border py-14 md:py-20">
      <SiteContainer>
        {chip && (
          <Reveal>
            <SectionChip icon={chip.icon} label={chip.label} />
          </Reveal>
        )}
        {title && <PosterTitle text={title} className="mt-5 max-w-3xl text-[clamp(34px,4.6vw,60px)]" />}
        <div className={title || chip ? "mt-10" : undefined}>{children}</div>
      </SiteContainer>
    </section>
  );
}

function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <figure className="h-full rounded-[20px] border border-border bg-card p-5">
      <div className="flex items-center gap-0.5" aria-label={`${review.rating} out of 5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={i < review.rating ? "h-4 w-4 fill-accent text-accent" : "h-4 w-4 text-muted-foreground/40"} />
        ))}
      </div>
      {review.comment && <blockquote className="mt-3 text-[15px] leading-relaxed">“{review.comment}”</blockquote>}
      <figcaption className="mt-3 text-[12px] text-muted-foreground">
        Organizer review ·{" "}
        {new Date(review.event_date ?? review.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
      </figcaption>
    </figure>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="rounded-[20px] border border-dashed border-border bg-card/70 px-6 py-10 text-center text-[14px] text-muted-foreground">
      {text}
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/** Accepts "example.com" as well as full URLs. */
function externalUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function socialLinks(socials: Record<string, string> | null) {
  const defs = [
    { key: "instagram", label: "Instagram", Icon: Instagram },
    { key: "linkedin", label: "LinkedIn", Icon: Linkedin },
    { key: "facebook", label: "Facebook", Icon: Facebook },
    { key: "youtube", label: "YouTube", Icon: Youtube },
  ];
  return defs
    .filter((d) => socials?.[d.key])
    .map((d) => ({ href: externalUrl(socials![d.key]), label: d.label, Icon: d.Icon }));
}
