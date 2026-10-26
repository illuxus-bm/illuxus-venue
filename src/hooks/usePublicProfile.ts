import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Venue, VenueMedia } from "@/hooks/useMyVenues";
import { usePublicVenues, type PublicVenue } from "@/hooks/usePublicVenues";

/**
 * Reads for the public pages: the vendor profile (/v/:vendorId) and a single
 * venue (/venues/:venueId). Everything here is readable signed out:
 * vendors, vendor_portfolio and vendor_service_areas are public-read, active
 * services and venues are public-read, venue_media is public-read, and
 * reviews come through the vendor_public_reviews RPC (migration 110).
 */

export interface PublicVendor {
  id: string;
  business_name: string;
  tagline: string | null;
  bio: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  logo_url: string | null;
  cover_url: string | null;
  years_experience: number | null;
  response_time_hours: number | null;
  socials: Record<string, string> | null;
  rating_avg: number | null;
  rating_count: number;
  verification_status: string | null;
}

export interface PublicService {
  id: string;
  title: string;
  description: string | null;
  base_price: number;
  currency: string;
  unit: string;
  duration: string | null;
  category: string | null;
  venue_id: string | null;
}

export interface PublicPortfolioItem {
  id: string;
  url: string;
  media_type: "image" | "video";
  caption: string | null;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  event_date: string | null;
}

export interface PublicVendorProfile {
  vendor: PublicVendor;
  services: PublicService[];
  portfolio: PublicPortfolioItem[];
  reviews: PublicReview[];
  serviceAreas: string[];
}

// Display columns only: auto_reply, commission_rate and notify_email are
// readable under RLS but have no business on a public page.
const VENDOR_COLUMNS =
  "id, business_name, tagline, bio, website, city, country, logo_url, cover_url, years_experience, response_time_hours, socials, rating_avg, rating_count, verification_status";
const SERVICE_COLUMNS = "id, title, description, base_price, currency, unit, duration, category, venue_id";

// A malformed id in the URL would make Postgres reject the query (invalid
// uuid); treat it as "not found" instead of an error.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function usePublicVendorProfile(vendorId: string | undefined) {
  return useQuery<PublicVendorProfile | null>({
    queryKey: ["public-vendor", vendorId],
    enabled: !!vendorId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!UUID.test(vendorId!)) return null;
      const db = supabase as any;
      const { data: vendor, error } = await db
        .from("vendors")
        .select(VENDOR_COLUMNS)
        .eq("id", vendorId)
        .maybeSingle();
      if (error) throw error;
      if (!vendor) return null;

      const [services, portfolio, reviews, areas] = await Promise.all([
        db
          .from("vendor_services")
          .select(SERVICE_COLUMNS)
          .eq("vendor_id", vendorId)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        db
          .from("vendor_portfolio")
          .select("id, url, media_type, caption")
          .eq("vendor_id", vendorId)
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true }),
        db.rpc("vendor_public_reviews", { p_vendor_id: vendorId, p_limit: 12 }),
        db.from("vendor_service_areas").select("*").eq("vendor_id", vendorId),
      ]);

      return {
        vendor: vendor as PublicVendor,
        services: ((services.data ?? []) as PublicService[]).map((s) => ({
          ...s,
          base_price: Number(s.base_price),
        })),
        portfolio: (portfolio.data ?? []) as PublicPortfolioItem[],
        // Before migration 110 runs the RPC doesn't exist; show no reviews
        // rather than failing the whole page.
        reviews: reviews.error ? [] : ((reviews.data ?? []) as PublicReview[]),
        serviceAreas: serviceAreaNames(areas.data ?? []),
      };
    },
  });
}

/** The vendor's listed venues, from the same read the landing page uses. */
export function useVendorVenues(vendorId: string | undefined): {
  venues: PublicVenue[];
  isLoading: boolean;
} {
  const { data = [], isLoading } = usePublicVenues();
  return { venues: data.filter((v) => v.vendor_id === vendorId), isLoading };
}

export interface PublicVenueDetail {
  venue: Venue;
  media: VenueMedia[];
  vendor: Pick<PublicVendor, "id" | "business_name" | "logo_url" | "rating_avg" | "rating_count" | "verification_status">;
  services: PublicService[];
}

export function usePublicVenue(venueId: string | undefined) {
  return useQuery<PublicVenueDetail | null>({
    queryKey: ["public-venue", venueId],
    enabled: !!venueId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!UUID.test(venueId!)) return null;
      const db = supabase as any;
      // RLS returns only listed (is_active) venues to the public.
      const { data: venue, error } = await db.from("venues").select("*").eq("id", venueId).maybeSingle();
      if (error) throw error;
      if (!venue) return null;

      const [media, vendor, services] = await Promise.all([
        db
          .from("venue_media")
          .select("*")
          .eq("venue_id", venueId)
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        db
          .from("vendors")
          .select("id, business_name, logo_url, rating_avg, rating_count, verification_status")
          .eq("id", venue.vendor_id)
          .maybeSingle(),
        // Offered here: pinned to this venue, or vendor-wide (venue_id null).
        db
          .from("vendor_services")
          .select(SERVICE_COLUMNS)
          .eq("vendor_id", venue.vendor_id)
          .eq("is_active", true)
          .or(`venue_id.is.null,venue_id.eq.${venueId}`)
          .order("created_at", { ascending: true }),
      ]);

      return {
        venue: venue as Venue,
        media: (media.data ?? []) as VenueMedia[],
        vendor: vendor.data ?? {
          id: venue.vendor_id,
          business_name: "Venue partner",
          logo_url: null,
          rating_avg: null,
          rating_count: 0,
          verification_status: null,
        },
        services: ((services.data ?? []) as PublicService[]).map((s) => ({ ...s, base_price: Number(s.base_price) })),
      };
    },
  });
}

/** vendor_service_areas came from the Lovable baseline with no fixed shape
 *  in this repo, so pick whichever name-like column a row has. */
function serviceAreaNames(rows: Array<Record<string, unknown>>): string[] {
  const names = rows
    .map((r) => r.city ?? r.area ?? r.name ?? r.region ?? r.label)
    .filter((n): n is string => typeof n === "string" && n.trim() !== "")
    .map((n) => n.trim());
  return Array.from(new Set(names));
}
