import { useQuery } from "@tanstack/react-query";

import type { Venue, VenueMedia } from "@/hooks/useMyVenues";
import {
  getPublicOrNull,
  usePublicVenues,
  type PublicVenue,
} from "@/hooks/usePublicVenues";
import { seg } from "@/lib/api";

/**
 * Reads for the public pages: the vendor profile (/v/:vendorId) and a single
 * venue (/venues/:venueId). Both are unauthenticated API reads
 * (GET /api/public/vendors/:id, GET /api/public/venues/:id); a 404 renders
 * as "not found".
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

// A malformed id in the URL can't exist; skip the round-trip and treat it as
// "not found" (the API would 404 too).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function usePublicVendorProfile(vendorId: string | undefined) {
  return useQuery<PublicVendorProfile | null>({
    queryKey: ["public-vendor", vendorId],
    enabled: !!vendorId,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => {
      if (!UUID.test(vendorId!)) return null;
      return getPublicOrNull<PublicVendorProfile>(`/public/vendors/${seg(vendorId!)}`, signal);
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
    queryFn: ({ signal }) => {
      if (!UUID.test(venueId!)) return null;
      return getPublicOrNull<PublicVenueDetail>(`/public/venues/${seg(venueId!)}`, signal);
    },
  });
}
