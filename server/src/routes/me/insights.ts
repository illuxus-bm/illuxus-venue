import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { dateOnly, iso, money } from "../../lib/dto.js";
import { parse } from "../../lib/validate.js";
import { vendorId } from "../../plugins/context.js";

const statsQuery = z.object({
  // Date#getTimezoneOffset(): minutes to ADD to local time to get UTC.
  tz_offset_minutes: z.coerce.number().int().min(-14 * 60).max(14 * 60).default(0),
});

export const insightRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.get("/reviews", async (req) => {
    const rows = await db.vendor_reviews.findMany({
      where: { reviewer_type: "organizer", vendor_bookings: { vendor_id: vendorId(req) } },
      orderBy: { created_at: "desc" },
      take: 500,
      include: { vendor_bookings: { select: { event_date: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      reviewer_type: r.reviewer_type,
      created_at: iso(r.created_at),
      booking_event_date: dateOnly(r.vendor_bookings?.event_date),
    }));
  });

  app.get("/stats", async (req) => {
    const { tz_offset_minutes } = parse(statsQuery, req.query);
    const vid = vendorId(req);
    const vendor = await db.vendors.findUniqueOrThrow({ where: { id: vid }, select: { default_currency: true } });

    // Start of the current month in the vendor's local time, as a UTC instant.
    const localNow = new Date(Date.now() - tz_offset_minutes * 60_000);
    const monthStart = new Date(
      Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1) + tz_offset_minutes * 60_000,
    );

    const [openRequests, pendingQuotes, bookings, revenue] = await Promise.all([
      db.rfq_invitees.count({
        where: { vendor_id: vid, declined: false, responded_at: null, rfqs: { status: "open" } },
      }),
      db.quotes.count({ where: { vendor_id: vid, status: "sent" } }),
      db.vendor_bookings.count({
        where: { vendor_id: vid, status: { in: ["confirmed", "in_progress", "completed"] } },
      }),
      db.vendor_bookings.aggregate({
        where: {
          vendor_id: vid,
          status: "completed",
          currency: vendor.default_currency,
          updated_at: { gte: monthStart },
        },
        _sum: { total: true },
      }),
    ]);

    return {
      openRequests,
      pendingQuotes,
      bookings,
      revenueThisMonth: money(revenue._sum.total),
      currency: vendor.default_currency,
    };
  });
};
