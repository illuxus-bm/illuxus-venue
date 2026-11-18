import { useQuery } from "@tanstack/react-query";

import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { get } from "@/lib/api";
import { INBOX_POLL_MS } from "@/lib/polling";

export type RfqStatus = "open" | "quoted" | "accepted" | "expired" | "cancelled";

export interface InboxRfq {
  invitee_id: string;
  rfq_id: string;
  requirements: string;
  event_city: string | null;
  event_date: string | null;
  expected_guests: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  status: RfqStatus;
  invited_at: string;
  responded_at: string | null;
  declined: boolean;
  category_slug: string | null;
  category_name: string | null;
}

/**
 * Every RFQ the current vendor has been invited to, newest first.
 * Segmentation into New / Responded / Expired happens in the tab component
 * so we only make one round-trip.
 */
export function useInboxRfqs() {
  const { vendor } = useVendorAuth();

  return useQuery<InboxRfq[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-inbox", vendor?.id],
    queryFn: ({ signal }) => get<InboxRfq[]>("/me/inbox/rfqs", { signal }),
    // No push channel: poll while the dashboard is visible.
    refetchInterval: INBOX_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
