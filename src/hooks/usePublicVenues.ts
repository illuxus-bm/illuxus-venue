import { useQuery } from "@tanstack/react-query";

import { ApiError, get } from "@/lib/api";

/**
 * Listed venues for the public landing page (GET /api/public/venues, no
 * auth). The server picks each venue's cover image and max capacity.
 */

export interface PublicVenue {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  space_type: string | null;
  city: string | null;
  area_sqft: number | null;
  max_capacity: number | null;
  cover_url: string | null;
}

export function usePublicVenues() {
  return useQuery<PublicVenue[]>({
    queryKey: ["public-venues"],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => get<PublicVenue[]>("/public/venues", { signal, auth: false }),
  });
}

/** 404 from a public detail endpoint → "not found" (null), not an error. */
export async function getPublicOrNull<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    return await get<T>(path, { signal, auth: false });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
