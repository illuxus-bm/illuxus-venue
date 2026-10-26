import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

/**
 * A row in the vendor Inbox that represents an organizer directly picking
 * one of this vendor's venues from the main app's marketplace. Backed by
 * `event_venue_selections`. Distinct from an RFQ: the organizer already
 * committed to a specific venue, we just need Accept / Decline.
 *
 * Read through the `vendor_venue_requests()` RPC (migration 109), not a
 * direct `events!inner` join: events RLS hides DRAFT events from anyone
 * but their owner, and Quick Create saves every new event as a draft, so
 * the direct join silently dropped most requests.
 *
 * Segmentation into New / Responded / Expired lives in the tab component
 * (mirrors InboxRfq) so we only round-trip once.
 */
export type VenueRequestStatus =
  | "contacted"
  | "accepted"
  | "declined"
  | "cancelled";

export interface InboxVenueRequestService {
  id: string;
  title: string;
  category: string | null;
}

/** Venue-booking brief the organizer filled in on step 2 of Quick Create.
 *  Every field is optional / boolean-with-default; the vendor UI hides
 *  rows that are unset. */
export interface InboxVenueRequestBrief {
  event_type: string | null;
  event_duration_hours: number | null;
  expected_attendees: number | null;
  seating_capacity: number | null;
  seating_arrangement: string | null;
  needs_pre_function_area: boolean;
  needs_vip_area: boolean;
  needs_additional_rooms: boolean;
  venue_link: string | null;
}

export interface InboxVenueRequest extends InboxVenueRequestBrief {
  selection_id: string;
  event_id: string;
  event_title: string | null;
  event_description: string | null;
  event_date: string | null;
  event_end_date: string | null;
  event_timezone: string | null;
  /** events.location — city or full address typed by the organizer. */
  event_city: string | null;
  event_venue: string | null;
  event_capacity: number | null;
  event_format: string | null;
  event_banner_url: string | null;
  /** Which of this vendor's venues was requested (null on legacy rows). */
  venue_id: string | null;
  venue_name: string | null;
  org_name: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
  organizer_phone: string | null;
  notes: string | null;
  status: VenueRequestStatus;
  /** When the organizer picked this venue. */
  created_at: string;
  responded_at: string | null;
  /** Services the organizer ticked in the picker. Ids the vendor has
   *  since deleted are dropped. */
  requested_services: InboxVenueRequestService[];
}

type RpcRow = Omit<InboxVenueRequest, "event_city" | "requested_services"> & {
  vendor_id: string;
  event_location: string | null;
  event_status: string | null;
  selected_service_ids: string[] | null;
};

export function useInboxVenueRequests() {
  const { vendor } = useVendorAuth();

  return useQuery<InboxVenueRequest[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-inbox-venues", vendor?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("vendor_venue_requests");
      if (error) throw error;
      const rows = ((data ?? []) as RpcRow[]).filter(
        (r) => r.vendor_id === vendor!.id,
      );

      // One batch fetch for every service referenced across all rows.
      const allServiceIds = Array.from(
        new Set(rows.flatMap((r) => r.selected_service_ids ?? [])),
      );
      const serviceById = new Map<string, InboxVenueRequestService>();
      if (allServiceIds.length > 0) {
        const { data: services } = await (supabase as any)
          .from("vendor_services")
          .select("id, title, category")
          .in("id", allServiceIds)
          .eq("vendor_id", vendor!.id);
        for (const s of (services ?? []) as InboxVenueRequestService[]) {
          serviceById.set(s.id, s);
        }
      }

      return rows.map<InboxVenueRequest>(
        ({ vendor_id: _v, event_location, event_status: _s, selected_service_ids, ...row }) => ({
          ...row,
          event_city: event_location,
          event_duration_hours:
            row.event_duration_hours == null ? null : Number(row.event_duration_hours),
          requested_services: (selected_service_ids ?? [])
            .map((id) => serviceById.get(id))
            .filter((s): s is InboxVenueRequestService => !!s),
        }),
      );
    },
  });
}
