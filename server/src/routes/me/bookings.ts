import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { bookingDto } from "../../lib/dto.js";
import { conflict, notFound } from "../../lib/errors.js";
import { idParam, parse } from "../../lib/validate.js";
import { vendorId } from "../../plugins/context.js";

const STATUS_FLOW: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};
const DEPOSIT_FLOW: Record<string, string[]> = {
  pending: ["received"],
  received: ["refunded"],
  refunded: [],
};

const patchBody = z
  .object({
    status: z.enum(["confirmed", "in_progress", "completed", "cancelled"]),
    deposit_status: z.enum(["received", "refunded"]),
  })
  .partial()
  .strict()
  .refine((b) => (b.status ? 1 : 0) + (b.deposit_status ? 1 : 0) === 1, "Change either status or deposit_status");

const include = { rfqs: { select: { requirements: true } } } as const;

export const bookingRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.get("/bookings", async (req) => {
    const rows = await db.vendor_bookings.findMany({
      where: { vendor_id: vendorId(req) },
      orderBy: [{ event_date: { sort: "asc", nulls: "last" } }, { created_at: "desc" }],
      include,
    });
    return rows.map(bookingDto);
  });

  app.patch("/bookings/:id", async (req) => {
    const id = idParam(req.params);
    const body = parse(patchBody, req.body);
    const vid = vendorId(req);

    const booking = await db.vendor_bookings.findFirst({ where: { id, vendor_id: vid } });
    if (!booking) throw notFound("Booking not found");

    if (body.deposit_status) {
      if (!DEPOSIT_FLOW[booking.deposit_status]?.includes(body.deposit_status)) {
        throw conflict(`The deposit can't go from ${booking.deposit_status} to ${body.deposit_status}.`);
      }
      const { count } = await db.vendor_bookings.updateMany({
        where: { id, vendor_id: vid, deposit_status: booking.deposit_status },
        data: { deposit_status: body.deposit_status },
      });
      if (count === 0) throw conflict("This booking changed in the meantime. Refresh and try again.");
      return bookingDto(await db.vendor_bookings.findUniqueOrThrow({ where: { id }, include }));
    }

    const next = body.status!;
    if (!STATUS_FLOW[booking.status]?.includes(next)) {
      throw conflict(`A ${booking.status.replace("_", " ")} booking can't be marked ${next.replace("_", " ")}.`);
    }

    // Status change + calendar in one transaction, guarded against races.
    await db.$transaction(async (tx) => {
      const { count } = await tx.vendor_bookings.updateMany({
        where: { id, vendor_id: vid, status: booking.status },
        data: { status: next },
      });
      if (count === 0) throw conflict("This booking changed in the meantime. Refresh and try again.");

      if (next === "confirmed" && booking.event_date) {
        // A day already blocked stays blocked (no failure); same as the DB trigger.
        await tx.vendor_availability.createMany({
          data: [{ vendor_id: vid, date: booking.event_date, status: "booked", note: "Confirmed booking", booking_id: id }],
          skipDuplicates: true,
        });
      }
      if (next === "cancelled") {
        await tx.vendor_availability.deleteMany({ where: { booking_id: id, status: "booked" } });
      }
    });

    return bookingDto(await db.vendor_bookings.findUniqueOrThrow({ where: { id }, include }));
  });

};
