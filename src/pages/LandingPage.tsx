import {
  Building2,
  CalendarCheck,
  Camera,
  CheckCircle2,
  Clapperboard,
  Coffee,
  MailCheck,
  MapPin,
  Music,
  Palette,
  Sparkles,
  Users,
  UtensilsCrossed,
  Wine,
} from "lucide-react";

import { PillLink, PosterTitle, Reveal, SectionChip, SiteContainer } from "@/components/landing/primitives";
import { VenueIllustration } from "@/components/landing/VenueIllustration";
import { PublicPage, VenueCard } from "@/components/landing/PublicChrome";
import { usePublicVenues, type PublicVenue } from "@/hooks/usePublicVenues";
import { spaceTypeLabel } from "@/lib/venueLabels";
import { cn, planEventUrl } from "@/lib/utils";

/**
 * Public landing page of the venue portal, styled after the illuxus landing
 * (poster headlines, floating header chips, blueprint grid, perspective
 * floor) so both sites read as one product.
 *
 * Organizers book venues from inside illuxus — the venue only shows up there
 * when it's free on every event date and in the event's city — so every
 * booking call to action points at illuxus. The venue admin signs in here.
 */

const STEPS = [
  {
    icon: CalendarCheck,
    title: "Set your dates and city",
    body: "Create your event on Illuxus with its start and end dates and where it takes place.",
  },
  {
    icon: MapPin,
    title: "See only venues you can book",
    body: "Illuxus lists the venues in your city that are free on every day of your event, with photos, capacity and add-ons.",
  },
  {
    icon: MailCheck,
    title: "Get confirmed by email",
    body: "Send the request with the services you want. The venue team replies in their dashboard and you hear back by email.",
  },
];

const SERVICES = [
  { icon: Camera, label: "Photography" },
  { icon: Clapperboard, label: "Videography" },
  { icon: UtensilsCrossed, label: "Food & catering" },
  { icon: Coffee, label: "Breakfast, lunch & dinner" },
  { icon: Wine, label: "Beverages & bar" },
  { icon: Palette, label: "Decor & florals" },
  { icon: Music, label: "Sound, light & AV" },
  { icon: Users, label: "Staff & hospitality" },
];

export default function LandingPage() {
  const { data: venues = [], isLoading } = usePublicVenues();
  const planUrl = planEventUrl();

  return (
    <PublicPage onLanding>
      <Hero venues={venues} planUrl={planUrl} />
      <Stats venues={venues} />
      <VenuesSection venues={venues} loading={isLoading} />
      <HowItWorks />
      <ServicesSection />
      <ClosingCta planUrl={planUrl} />
    </PublicPage>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Hero                                                                   */
/* ────────────────────────────────────────────────────────────────────── */

function Hero({ venues, planUrl }: { venues: PublicVenue[]; planUrl: string }) {
  // The card shows a drawn hall; the listing only supplies its caption.
  const featured = venues[0] ?? null;

  return (
    <section className="relative overflow-hidden pb-20 pt-32 sm:pt-40 lg:pb-28">
      <div aria-hidden="true" className="floor-plane opacity-60" />
      <SiteContainer className="relative grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="max-w-[600px]">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-3.5 py-1.5">
            <span className="h-2 w-2 rounded-full bg-accent ring-4 ring-accent/20" />
            <span className="eyebrow text-foreground">Venues by Illuxus</span>
          </span>
          <PosterTitle
            as="h1"
            immediate
            text="The right room for every event you host"
            className="mt-5 text-[clamp(50px,7vw,104px)]"
          />
          <div className="rule-draw mt-5 h-px w-full max-w-[520px] bg-accent/70" />
          <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-muted-foreground sm:text-[18px] [text-wrap:pretty]">
            Halls, lawns, terraces and conference rooms, with photography, food and decor on tap.
            Pick your dates on Illuxus and see only the venues that are free and in your city.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PillLink href="#venues" arrow>
              Browse venues
            </PillLink>
            <PillLink href={planUrl} variant="outline">
              Plan your event on Illuxus
            </PillLink>
          </div>
        </div>

        <HeroShowcase venue={featured} />
      </SiteContainer>
    </section>
  );
}

/** A framed venue card with chips floating around it, like the illuxus hero ticket. */
function HeroShowcase({ venue }: { venue: PublicVenue | null }) {
  const tags = [
    { label: "Free on your dates", className: "-left-4 top-8 sm:-left-10", delay: "0s" },
    { label: "In your city", className: "-right-2 top-1/3 sm:-right-8", delay: "-2s" },
    // Kept over the picture: lower down it would cover the venue name.
    { label: "Add-on services", className: "-left-2 top-[52%] sm:-left-8", delay: "-4s" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      <div className="relative -rotate-2 overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_40px_80px_-40px_rgba(3,14,26,0.6)]">
        {/* Drawn hall, not the venue's uploaded cover: uploads can be anything
            (screenshots, floor plans) and the hero needs art-directed imagery. */}
        <div className="relative aspect-[4/3] bg-muted">
          <VenueIllustration className="h-full w-full" />
        </div>
        <div className="flex items-end justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="eyebrow text-muted-foreground">{venue ? spaceTypeLabel(venue.space_type) : "Illuxus Venues"}</p>
            {/* pb + leading: `truncate` clips, and the poster face's tight line-height would cut the letters' feet. */}
            <p className="poster mt-1 truncate pb-1 text-[34px] leading-[1.05] text-foreground">{venue?.name ?? "Your next venue"}</p>
            {venue?.city && (
              <p className="mt-1 inline-flex items-center gap-1 text-[13px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {venue.city}
              </p>
            )}
          </div>
          {venue?.max_capacity ? (
            <div className="shrink-0 text-right">
              <p className="poster pb-1 text-[34px] leading-[1.05] text-accent">{venue.max_capacity.toLocaleString("en-IN")}</p>
              <p className="eyebrow text-[10px] text-muted-foreground">Guests</p>
            </div>
          ) : null}
        </div>
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
        {tags.map((tag) => (
          <span
            key={tag.label}
            className={cn(
              "chip-bob absolute inline-flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold text-foreground shadow-[0_14px_30px_-18px_rgba(3,14,26,0.6)]",
              tag.className,
            )}
            style={{ animationDelay: tag.delay }}
          >
            <CheckCircle2 className="h-5 w-5 text-accent" />
            {tag.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Stats                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

function Stats({ venues }: { venues: PublicVenue[] }) {
  if (venues.length === 0) return null;
  const cities = new Set(venues.map((v) => v.city?.trim()).filter(Boolean)).size;
  const largest = Math.max(0, ...venues.map((v) => v.max_capacity ?? 0));
  const items = [
    { value: venues.length.toString(), label: venues.length === 1 ? "Venue listed" : "Venues listed" },
    cities > 0 ? { value: cities.toString(), label: cities === 1 ? "City" : "Cities" } : null,
    largest > 0 ? { value: largest.toLocaleString("en-IN"), label: "Guests in the largest space" } : null,
  ].filter((i): i is { value: string; label: string } => i !== null);

  return (
    <section className="relative border-y border-border bg-card/60">
      <SiteContainer className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map((item, i) => (
          <Reveal key={item.label} index={i} className="px-2 py-8 text-center sm:px-6">
            <p className="poster text-[clamp(44px,5vw,64px)] text-foreground">{item.value}</p>
            <p className="eyebrow mt-1 text-muted-foreground">{item.label}</p>
          </Reveal>
        ))}
      </SiteContainer>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Venues                                                                 */
/* ────────────────────────────────────────────────────────────────────── */

function VenuesSection({ venues, loading }: { venues: PublicVenue[]; loading: boolean }) {
  return (
    <section id="venues" className="relative scroll-mt-20 py-20 md:py-28">
      <SiteContainer>
        <Reveal>
          <SectionChip icon={Building2} label="Our venues" />
        </Reveal>
        <PosterTitle text="Spaces ready for your guest list" className="mt-5 max-w-3xl text-[clamp(40px,5.6vw,80px)]" />
        <Reveal index={1}>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
            Every space lists its capacity by seating layout, its amenities and house rules. Book any of
            them from your event on Illuxus.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[340px] animate-pulse rounded-[20px] border border-border bg-card" />
              ))
            : venues.map((venue, i) => (
                <Reveal key={venue.id} index={i % 3}>
                  <VenueCard venue={venue} />
                </Reveal>
              ))}
        </div>

        {!loading && venues.length === 0 && (
          <div className="mt-12 rounded-[20px] border border-dashed border-border bg-card/70 px-6 py-14 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="mt-3 font-semibold">New venues are on their way</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check back soon, or start planning your event on Illuxus in the meantime.
            </p>
          </div>
        )}
      </SiteContainer>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* How it works                                                           */
/* ────────────────────────────────────────────────────────────────────── */

function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-20 border-t border-border py-20 md:py-28">
      <SiteContainer>
        <Reveal>
          <SectionChip icon={Sparkles} label="How it works" />
        </Reveal>
        <PosterTitle text="Booked in three steps from your event" className="mt-5 max-w-3xl text-[clamp(40px,5.6vw,80px)]" />

        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.title} index={i} className="rounded-[20px] border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="poster text-[28px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                <span className="h-px w-8 bg-accent/60" />
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{step.body}</p>
            </Reveal>
          ))}
        </ol>
      </SiteContainer>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Services                                                               */
/* ────────────────────────────────────────────────────────────────────── */

function ServicesSection() {
  return (
    <section id="services" className="relative scroll-mt-20 border-t border-border py-20 md:py-28">
      <SiteContainer className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Reveal>
            <SectionChip icon={UtensilsCrossed} label="Add-on services" />
          </Reveal>
          <PosterTitle text="Everything around the room, in one request" className="mt-5 text-[clamp(40px,5vw,72px)]" />
          <Reveal index={1}>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted-foreground">
              Each venue lists the extras it can arrange. Tick the ones you want when you request the venue and
              they travel with your booking.
            </p>
          </Reveal>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {SERVICES.map((service, i) => (
            <Reveal
              key={service.label}
              index={i % 4}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <service.icon className="h-5 w-5" />
              </span>
              <span className="text-[14px] font-medium leading-snug">{service.label}</span>
            </Reveal>
          ))}
        </div>
      </SiteContainer>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Closing call to action                                                   */
/* ────────────────────────────────────────────────────────────────────── */

function ClosingCta({ planUrl }: { planUrl: string }) {
  return (
    <section className="relative py-20 md:py-28">
      <SiteContainer>
        <div className="relative overflow-hidden rounded-[28px] border border-accent/40 bg-card px-6 py-20 text-center sm:px-12 md:py-28">
          <div aria-hidden="true" className="floor-plane opacity-70" />
          <div className="relative mx-auto max-w-3xl">
            <PosterTitle text="Your dates, your city, your venue" className="text-[clamp(46px,7.4vw,104px)]" />
            <Reveal index={1}>
              <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-muted-foreground sm:text-[18px]">
                Create your event on Illuxus and the venues that fit will be waiting for you.
              </p>
            </Reveal>
            <Reveal index={2}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <PillLink href={planUrl} arrow>
                  Plan your event
                </PillLink>
                <PillLink href="#venues" variant="outline">
                  See the venues
                </PillLink>
              </div>
            </Reveal>
          </div>
        </div>
      </SiteContainer>
    </section>
  );
}
