import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { vendorDto } from "../../lib/dto.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { ratingFor } from "../../lib/ratings.js";
import { currency, httpUrl, optText, parse, uuid } from "../../lib/validate.js";
import { vendorId } from "../../plugins/context.js";

/** Only these columns are vendor-editable (never verification, commission, ratings). */
const profilePatch = z
  .object({
    business_name: z.string().trim().min(2, "Business name is required").max(120),
    tagline: optText(160),
    bio: optText(4000),
    website: httpUrl.nullish().or(z.literal("").transform(() => null)),
    city: optText(80),
    country: optText(80),
    years_experience: z.number().int().min(0).max(200).nullish(),
    response_time_hours: z.number().int().min(0).max(24 * 30).nullish(),
    socials: z
      .record(z.string().regex(/^[a-z]{2,20}$/), httpUrl)
      .refine((o) => Object.keys(o).length <= 10, "Too many links"),
    notify_email: z.boolean(),
    auto_reply: optText(2000),
    default_currency: currency,
  })
  .partial()
  .strict();

const imageBody = z.object({ kind: z.enum(["logo", "cover"]), key: z.string().min(3).max(300) }).strict();

const uploadBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("venue-media"), venue_id: uuid, content_type: z.string().max(100), size: z.number().int() }).strict(),
  z.object({ kind: z.literal("vendor-media"), content_type: z.string().max(100), size: z.number().int() }).strict(),
]);

export const profileRoutes: FastifyPluginAsync = async (app) => {
  const { db, storage } = app;

  const withRating = async (v: Parameters<typeof vendorDto>[0]) => ({ ...vendorDto(v), ...(await ratingFor(db, v.id)) });

  app.patch("/vendor", async (req) => {
    const patch = parse(profilePatch, req.body);
    if (Object.keys(patch).length === 0) throw badRequest("Nothing to update.");
    const updated = await db.vendors.update({ where: { id: vendorId(req) }, data: patch });
    return withRating(updated);
  });

  /** Point logo / cover at a finished upload; delete the file it replaces. */
  app.put("/vendor/image", async (req) => {
    const { kind, key } = parse(imageBody, req.body);
    const vid = vendorId(req);
    if (!key.startsWith(`${vid}/`)) throw badRequest("That upload doesn't belong to your business.");
    const column = kind === "logo" ? "logo_url" : "cover_url";
    const before = await db.vendors.findUniqueOrThrow({ where: { id: vid }, select: { logo_url: true, cover_url: true } });
    const updated = await db.vendors.update({
      where: { id: vid },
      data: { [column]: storage.publicUrl("vendor-media", key) },
    });
    const oldKey = storage.keyFromUrl("vendor-media", before[column]);
    if (oldKey && oldKey !== key) void storage.remove("vendor-media", oldKey, req.log);
    return withRating(updated);
  });

  /** Presigned direct-to-bucket upload. */
  app.post("/uploads", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req) => {
    const body = parse(uploadBody, req.body);
    const vid = vendorId(req);
    if (body.kind === "venue-media") {
      const venue = await db.venues.findFirst({ where: { id: body.venue_id, vendor_id: vid }, select: { id: true } });
      if (!venue) throw notFound("Venue not found");
      return storage.presign("venue-media", venue.id, body.content_type, body.size);
    }
    return storage.presign("vendor-media", vid, body.content_type, body.size);
  });

};
