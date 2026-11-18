import { useQuery } from "@tanstack/react-query";

import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { get } from "@/lib/api";
import { INBOX_POLL_MS } from "@/lib/polling";

/**
 * Aggregate counts + revenue shown on the Overview KPI row
 * (GET /api/me/stats).
 *
 * `revenueThisMonth` is in minor units (cents/paise) of `currency` and
 * should be rendered via formatMoneyCents(...) in the UI.
 */
export interface VendorStats {
  openRequests: number;
  pendingQuotes: number;
  bookings: number;
  revenueThisMonth: number;
  currency: string;
}

export function useVendorDashboardStats() {
  const { vendor } = useVendorAuth();
  const vendorId = vendor?.id;

  return useQuery<VendorStats>({
    enabled: !!vendorId,
    queryKey: ["vendor-stats", vendorId],
    queryFn: ({ signal }) =>
      get<VendorStats>("/me/stats", {
        signal,
        // The server computes "this month" from the vendor's local midnight
        // on the 1st, not UTC's.
        query: { tz_offset_minutes: new Date().getTimezoneOffset() },
      }),
    // No push channel: poll while the dashboard is visible.
    refetchInterval: INBOX_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
