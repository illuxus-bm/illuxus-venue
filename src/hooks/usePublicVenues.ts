import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Listed venues for the public landing page. Works signed out: venues RLS
 * (migration 106) lets anyone read rows with is_active = true, and
 * venue_media is public-read.
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

interface VenueRow {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  space_type: string | null;
  city: string | null;
  area_sqft: number | null;
  capacity_floating: number | null;
  capacity_theater: number | null;
  capacity_banquet: number | null;
  capacity_ushape: number | null;
  capacity_classroom: number | null;
}

export function usePublicVenues() {
  return useQuery<PublicVenue[]>({
    queryKey: ["public-venues"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("venues")
        .select(
          "id, vendor_id, name, description, space_type, city, area_sqft, capacity_floating, capacity_theater, capacity_banquet, capacity_ushape, capacity_classroom",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as VenueRow[];
      if (rows.length === 0) return [];

      // Cover photo per venue; videos are skipped since the card renders <img>.
      const { data: media } = await (supabase as any)
        .from("venue_media")
        .select("venue_id, url, is_cover, media_kind, sort_order")
        .in("venue_id", rows.map((r) => r.id))
        .neq("media_kind", "video")
        .order("is_cover", { ascending: false })
        .order("sort_order", { ascending: true });
      const coverById = new Map<string, string>();
      for (const m of (media ?? []) as Array<{ venue_id: string; url: string }>) {
        if (!coverById.has(m.venue_id) && /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(m.url)) {
          coverById.set(m.venue_id, m.url);
        }
      }

      return rows.map((r) => {
        const capacities = [
          r.capacity_floating,
          r.capacity_theater,
          r.capacity_banquet,
          r.capacity_ushape,
          r.capacity_classroom,
        ].filter((n): n is number => typeof n === "number" && n > 0);
        return {
          id: r.id,
          vendor_id: r.vendor_id,
          name: r.name,
          description: r.description,
          space_type: r.space_type,
          city: r.city,
          area_sqft: r.area_sqft,
          max_capacity: capacities.length ? Math.max(...capacities) : null,
          cover_url: coverById.get(r.id) ?? null,
        };
      });
    },
  });
}
