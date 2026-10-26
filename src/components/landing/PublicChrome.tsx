import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, LayoutDashboard, MapPin, Users } from "lucide-react";

import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteContainer } from "@/components/landing/primitives";
import "@/components/landing/landing.css";
import { useVendorAuth } from "@/contexts/VendorAuthContext";
import type { PublicVenue } from "@/hooks/usePublicVenues";
import { spaceTypeLabel } from "@/lib/venueLabels";
import { cn, illuxusOrigin, planEventUrl } from "@/lib/utils";

/**
 * Shared frame for the public pages (landing, vendor profile, venue page):
 * floating-chip header, blueprint-grid canvas and footer, as on illuxus.
 */

const HEADER_CHIP =
  "float-chip inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-10 2xl:px-3.5";

/** Landing sections. Hash links on the landing page, "/#…" everywhere else. */
const SECTIONS = [
  { id: "venues", label: "Venues" },
  { id: "how-it-works", label: "How it works" },
  { id: "services", label: "Services" },
];

export function PublicPage({ onLanding = false, children }: { onLanding?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Fixed drafting grid the page scrolls over, as on illuxus. */}
      <div aria-hidden="true" className="blueprint-grid pointer-events-none fixed inset-0 opacity-70" />
      <PublicHeader onLanding={onLanding} />
      <main className="relative">{children}</main>
      <PublicFooter />
    </div>
  );
}

function PublicHeader({ onLanding }: { onLanding: boolean }) {
  const { vendor } = useVendorAuth();
  const ref = React.useRef<HTMLElement>(null);

  // Fade the canvas in behind the chips once the page scrolls under them.
  React.useEffect(() => {
    const onScroll = () => {
      ref.current?.style.setProperty("--haze", window.scrollY > 8 ? "1" : "0");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header ref={ref} className="landing-header fixed inset-x-0 top-0 z-40">
      <SiteContainer className="relative flex h-16 items-center justify-between gap-3 lg:h-[4.5rem]">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Illuxus Venues home">
          <IlluxusWordmark height={22} ariaLabel="" />
          <span className="eyebrow rounded-full border border-border bg-card px-2.5 py-1 text-[10px] text-primary">
            Venues
          </span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1.5 lg:flex">
          {SECTIONS.map((s) =>
            onLanding ? (
              <a key={s.id} href={`#${s.id}`} className={HEADER_CHIP}>
                {s.label}
              </a>
            ) : (
              <Link key={s.id} to={`/#${s.id}`} className={HEADER_CHIP}>
                {s.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle floating />
          {vendor ? (
            <Link to="/vendor" className={cn(HEADER_CHIP, "float-chip-solid font-semibold")}>
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          ) : (
            <a
              href={planEventUrl()}
              className="group float-chip float-chip-solid inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-10 lg:px-4"
            >
              <span className="hidden sm:inline">Plan your event</span>
              <span className="sm:hidden">Plan</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </a>
          )}
        </div>
      </SiteContainer>
    </header>
  );
}

function PublicFooter() {
  const origin = illuxusOrigin().replace(/\/$/, "");
  return (
    <footer className="relative border-t border-border bg-card/60">
      <SiteContainer className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <IlluxusWordmark height={20} />
          <p className="mt-2 text-[13px] text-muted-foreground">Venues, part of the Illuxus event platform.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
          <a href={origin} className="hover:text-foreground">
            illuxus.com
          </a>
          <a href={`${origin}/discover`} className="hover:text-foreground">
            Discover events
          </a>
          <a href={`${origin}/contact`} className="hover:text-foreground">
            Contact
          </a>
          <Link to="/vendor/login" className="hover:text-foreground">
            Venue admin sign in
          </Link>
        </nav>
      </SiteContainer>
      <SiteContainer className="border-t border-border py-5 text-[12px] text-muted-foreground">
        © {new Date().getFullYear()} Illuxus. All rights reserved.
      </SiteContainer>
    </footer>
  );
}

/** Venue card used on the landing page and the vendor profile. */
export function VenueCard({ venue }: { venue: PublicVenue }) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-border bg-card transition-colors hover:border-foreground/20">
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {venue.cover_url ? (
          <img
            src={venue.cover_url}
            alt={venue.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary/10 to-accent/10">
            <Building2 className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
          </div>
        )}
        <span className="eyebrow absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[10px] text-foreground backdrop-blur">
          {spaceTypeLabel(venue.space_type)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-semibold leading-snug">
          {/* Stretched link: the whole card opens the venue page. */}
          <Link to={`/venues/${venue.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {venue.name}
          </Link>
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          {venue.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {venue.city}
            </span>
          )}
          {venue.max_capacity ? (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              Up to {venue.max_capacity.toLocaleString("en-IN")} guests
            </span>
          ) : null}
          {venue.area_sqft ? <span>{venue.area_sqft.toLocaleString("en-IN")} sq ft</span> : null}
        </div>
        {venue.description && (
          <p className="mt-3 line-clamp-2 text-[14px] leading-relaxed text-muted-foreground">{venue.description}</p>
        )}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[14px] font-semibold text-foreground underline decoration-accent decoration-2 underline-offset-[6px]">
          View venue
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
