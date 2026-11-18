import { useQuery } from "@tanstack/react-query";

import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { get } from "@/lib/api";
import { INBOX_POLL_MS } from "@/lib/polling";

/**
 * A row in the vendor Inbox that represents an organizer directly picking
 * one of this vendor's venues from the main app's marketplace. Backed by
 * `event_venue_selections`. Distinct from an RFQ: the organizer already
 * committed to a specific venue, we just need Accept / Decline.
 *
 * Read from GET /api/me/inbox/venue-requests, which already resolves the
 * requested services and maps `event_city`.
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

export function useInboxVenueRequests() {
  const { vendor } = useVendorAuth();

  return useQuery<InboxVenueRequest[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-inbox-venues", vendor?.id],
    queryFn: ({ signal }) =>
      get<InboxVenueRequest[]>("/me/inbox/venue-requests", { signal }),
    // No push channel: poll while the dashboard is visible.
    refetchInterval: INBOX_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
