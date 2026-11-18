import type { Db } from "../db.js";

/**
 * Live rating from organizer reviews. Computed instead of trusting
 * vendors.rating_avg, which only a Supabase trigger keeps current.
 */
export async function ratingFor(db: Db, vendorId: string): Promise<{ rating_avg: number | null; rating_count: number }> {
  const agg = await db.vendor_reviews.aggregate({
    where: { reviewer_type: "organizer", vendor_bookings: { vendor_id: vendorId } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const avg = agg._avg.rating;
  return {
    rating_avg: avg == null ? null : Math.round(avg * 100) / 100,
    rating_count: agg._count._all,
  };
}
