import { useQuery } from "@tanstack/react-query";

import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { get } from "@/lib/api";

export interface MyReview {
  id: string;
  rating: number;
  comment: string | null;
  reviewer_type: "organizer" | "vendor";
  created_at: string;
  booking_event_date: string | null;
}

/** Reviews received by this vendor from organizers, newest first. */
export function useMyReviews() {
  const { vendor } = useVendorAuth();

  return useQuery<MyReview[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-reviews", vendor?.id],
    queryFn: ({ signal }) => get<MyReview[]>("/me/reviews", { signal }),
  });
}
