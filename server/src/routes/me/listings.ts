import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { availabilityDto, portfolioDto, serviceDto, toDbDate } from "../../lib/dto.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { currency, idParam, isoDate, optText, parse, uuid } from "../../lib/validate.js";
import { vendorId } from "../../plugins/context.js";

const serviceFields = {
  title: z.string().trim().min(2, "Give the service a title").max(120),
  description: optText(2000),
  base_price: z.number().int().min(0).max(1_000_000_000_00),
  currency,
  unit: z.enum(["per_hour", "per_event", "per_person", "per_day", "flat"]),
  duration: optText(60),
  is_instant_book: z.boolean(),
  quote_on_request: z.boolean(),
  is_active: z.boolean(),
  venue_id: uuid.nullish(),
  category: optText(40),
};
const createService = z
  .object(serviceFields)
  .partial()
  .required({ title: true, base_price: true, currency: true, unit: true })
  .strict();
const patchService = z.object(serviceFields).partial().strict();

const createBlock = z
  .object({ date: isoDate, note: optText(200), venue_id: uuid.nullish() })
  .strict();

const createPortfolio = z.object({ key: z.string().min(3).max(300), caption: optText(200) }).strict();

export const listingRoutes: FastifyPluginAsync = async (app) => {
  const { db, storage } = app;

  const assertVenue = async (vendor: string, venueId: string | null | undefined) => {
    if (!venueId) return;
    const v = await db.venues.findFirst({ where: { id: venueId, vendor_id: vendor }, select: { id: true } });
    if (!v) throw badRequest("Pick one of your own venues.");
  };

  // ── Services ──────────────────────────────────────────────────────────
  app.get("/services", async (req) => {
    const rows = await db.vendor_services.findMany({ where: { vendor_id: vendorId(req) }, orderBy: { created_at: "asc" } });
    return rows.map(serviceDto);
  });

  app.post("/services", async (req, reply) => {
    const input = parse(createService, req.body);
    const vid = vendorId(req);
    await assertVenue(vid, input.venue_id);
    const created = await db.vendor_services.create({
      data: { ...input, base_price: BigInt(input.base_price), vendor_id: vid },
    });
    return reply.status(201).send(serviceDto(created));
  });

  app.patch("/services/:id", async (req) => {
    const id = idParam(req.params);
    const input = parse(patchService, req.body);
    const vid = vendorId(req);
    const existing = await db.vendor_services.findFirst({ where: { id, vendor_id: vid }, select: { id: true } });
    if (!existing) throw notFound("Service not found");
    await assertVenue(vid, input.venue_id);
    const updated = await db.vendor_services.update({
      where: { id },
      data: { ...input, ...(input.base_price !== undefined ? { base_price: BigInt(input.base_price) } : {}) },
    });
    return serviceDto(updated);
  });

  app.delete("/services/:id", async (req, reply) => {
    const id = idParam(req.params);
    const { count } = await db.vendor_services.deleteMany({ where: { id, vendor_id: vendorId(req) } });
    if (count === 0) throw notFound("Service not found");
    return reply.status(204).send();
  });

  // ── Availability ──────────────────────────────────────────────────────
  app.get("/availability", async (req) => {
    const rows = await db.vendor_availability.findMany({
      where: { vendor_id: vendorId(req), status: { in: ["held", "booked"] } },
      orderBy: { date: "asc" },
    });
    return rows.map(availabilityDto);
  });

  app.post("/availability", async (req, reply) => {
    const input = parse(createBlock, req.body);
    const vid = vendorId(req);
    await assertVenue(vid, input.venue_id);
    const date = toDbDate(input.date);
    const clash = await db.vendor_availability.findFirst({
      where: { vendor_id: vid, date, venue_id: input.venue_id ?? null },
      select: { id: true },
    });
    if (clash) throw conflict("That date is already blocked.");
    try {
      const created = await db.vendor_availability.create({
        data: { vendor_id: vid, date, note: input.note, status: "held", venue_id: input.venue_id ?? null },
      });
      return reply.status(201).send(availabilityDto(created));
    } catch (err) {
      // Lost a race with a parallel request on the unique index.
      if ((err as { code?: string }).code === "P2002") throw conflict("That date is already blocked.");
      throw err;
    }
  });

  app.delete("/availability/:id", async (req, reply) => {
    const id = idParam(req.params);
    const vid = vendorId(req);
    const row = await db.vendor_availability.findFirst({ where: { id, vendor_id: vid }, select: { status: true } });
    if (!row) throw notFound("Blocked date not found");
    if (row.status !== "held") throw conflict("This date comes from a confirmed booking. Cancel the booking to release it.");
    await db.vendor_availability.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ── Portfolio ─────────────────────────────────────────────────────────
  app.get("/portfolio", async (req) => {
    const rows = await db.vendor_portfolio.findMany({
      where: { vendor_id: vendorId(req) },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });
    return rows.map(portfolioDto);
  });

  app.post("/portfolio", async (req, reply) => {
    const input = parse(createPortfolio, req.body);
    const vid = vendorId(req);
    if (!input.key.startsWith(`${vid}/`)) throw badRequest("That upload doesn't belong to your business.");
    const last = await db.vendor_portfolio.aggregate({ where: { vendor_id: vid }, _max: { sort_order: true } });
    const created = await db.vendor_portfolio.create({
      data: {
        vendor_id: vid,
        url: storage.publicUrl("vendor-media", input.key),
        media_type: "image",
        caption: input.caption,
        sort_order: (last._max.sort_order ?? -1) + 1,
      },
    });
    return reply.status(201).send(portfolioDto(created));
  });

  app.delete("/portfolio/:id", async (req, reply) => {
    const id = idParam(req.params);
    const row = await db.vendor_portfolio.findFirst({ where: { id, vendor_id: vendorId(req) } });
    if (!row) throw notFound("Portfolio item not found");
    await db.vendor_portfolio.delete({ where: { id } });
    void storage.remove("vendor-media", storage.keyFromUrl("vendor-media", row.url), req.log);
    return reply.status(204).send();
  });
};
