import { useQuery } from "@tanstack/react-query";

import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { get } from "@/lib/api";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired";

export interface MyQuote {
  id: string;
  rfq_id: string;
  /** Snippet from rfqs.requirements — vendor-side has no title field. */
  rfq_summary: string;
  /** Minor units — format with formatMoneyCents. */
  total: number;
  currency: string;
  status: QuoteStatus;
  valid_until: string;
  created_at: string;
}

export function useMyQuotes() {
  const { vendor } = useVendorAuth();

  return useQuery<MyQuote[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-quotes", vendor?.id],
    queryFn: ({ signal }) => get<MyQuote[]>("/me/quotes", { signal }),
  });
}
