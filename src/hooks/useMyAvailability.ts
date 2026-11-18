import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { del, get, post, seg } from "@/lib/api";

export type AvailabilityStatus = "available" | "held" | "booked";

export interface BlockedDate {
  id: string;
  vendor_id: string;
  date: string;
  status: AvailabilityStatus;
  note: string | null;
  booking_id: string | null;
  /** Null = the whole business is blocked (migration 108). */
  venue_id: string | null;
}

/** Every non-`available` row (held + booked) for this vendor, by date. */
export function useMyAvailability() {
  const { vendor } = useVendorAuth();

  return useQuery<BlockedDate[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-availability", vendor?.id],
    queryFn: ({ signal }) => get<BlockedDate[]>("/me/availability", { signal }),
  });
}

/** Manually block a date. The server stores it as status='held' so it's
 *  distinguishable from auto-blocks; 409 if the date is already blocked. */
export function useBlockDate() {
  const qc = useQueryClient();
  const { vendor } = useVendorAuth();

  return useMutation({
    mutationFn: async (args: { date: string; note?: string; venueId?: string | null }) => {
      if (!vendor?.id) throw new Error("no vendor");
      await post<BlockedDate>("/me/availability", {
        date: args.date,
        note: args.note || undefined,
        venue_id: args.venueId || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-availability", vendor?.id] });
    },
  });
}

/** Release a manual block. `booked` rows come from confirmed bookings and
    must be cancelled by cancelling the booking itself. */
export function useUnblockDate() {
  const qc = useQueryClient();
  const { vendor } = useVendorAuth();

  return useMutation({
    mutationFn: (id: string) => del(`/me/availability/${seg(id)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-availability", vendor?.id] });
    },
  });
}
