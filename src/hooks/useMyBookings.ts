import { useQuery } from "@tanstack/react-query";

import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { get, patch, seg } from "@/lib/api";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface MyBooking {
  id: string;
  /** vendor_bookings has no `title` field; fall back to rfq.requirements snippet. */
  summary: string;
  /** Minor units — format with formatMoneyCents. */
  total: number;
  currency: string;
  status: BookingStatus;
  event_date: string | null;
  deposit_status: "pending" | "received" | "refunded";
  created_at: string;
}

export function useMyBookings() {
  const { vendor } = useVendorAuth();

  return useQuery<MyBooking[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-bookings", vendor?.id],
    // Server order: by event date, undated last.
    queryFn: ({ signal }) => get<MyBooking[]>("/me/bookings", { signal }),
  });
}

/** Fields PATCH /api/me/bookings/:id accepts — one of them per call. */
export type BookingPatch =
  | { status: BookingStatus }
  | { deposit_status: MyBooking["deposit_status"] };

export function updateBooking(id: string, body: BookingPatch): Promise<MyBooking> {
  return patch<MyBooking>(`/me/bookings/${seg(id)}`, body);
}
