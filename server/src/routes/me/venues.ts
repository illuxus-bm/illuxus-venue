import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { toDbTime, venueDto, venueMediaDto } from "../../lib/dto.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { httpUrl, idParam, nonNegDec, nonNegInt, optText, parse } from "../../lib/validate.js";
import { vendorId } from "../../plugins/context.js";

const nullableEnum = <T extends [string, ...string[]]>(values: T) => z.enum(values).nullish();

const venueFields = {
  name: z.string().trim().min(1, "Venue name is required.").max(120),
  space_type: optText(60),
  description: optText(4000),
  is_active: z.boolean(),

  address_line: optText(300),
  city: z.string().trim().min(1, "City is required so organizers in that city can find the venue.").max(80),
  state: optText(80),
  pincode: optText(12),
  map_url: httpUrl.nullish().or(z.literal("").transform(() => null)),

  area_sqft: nonNegInt(),
  length_ft: nonNegDec(99_999.9),
  width_ft: nonNegDec(99_999.9),
  ceiling_height_ft: nonNegDec(999.9),

  capacity_floating: nonNegInt(),
  capacity_theater: nonNegInt(),
  capacity_banquet: nonNegInt(),
  capacity_ushape: nonNegInt(),
  capacity_classroom: nonNegInt(),

  climate_control: nullableEnum(["central_ac", "split_ac", "non_ac"]),
  has_stage: z.boolean(),
  stage_dimensions: optText(200),
  green_rooms_count: nonNegInt(1000),

  has_projector: z.boolean(),
  has_screen: z.boolean(),
  has_sound_system: z.boolean(),
  has_microphones: z.boolean(),
  has_power_backup: z.boolean(),
  has_wifi: z.boolean(),

  catering_policy: nullableEnum(["in_house_only", "outside_permitted", "both"]),
  decor_policy: nullableEnum(["empanelled_only", "client_choice", "both"]),
  alcohol_policy: nullableEnum(["in_house_only", "outside_with_license", "prohibited", "both"]),
  music_curfew_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM (24h)")
    .nullish()
    .or(z.literal("").transform(() => null)),
  noise_restrictions: optText(1000),

  parking_car_capacity: nonNegInt(),
  parking_two_wheeler_capacity: nonNegInt(),
  has_valet: z.boolean(),
  wheelchair_accessible: z.boolean(),
  has_elevator: z.boolean(),
};

const createVenue = z.object(venueFields).partial().required({ name: true, city: true }).strict();
const patchVenue = z.object(venueFields).partial().strict();

const MEDIA_KINDS = ["empty_hall", "setup", "facility", "floor_plan", "other"] as const;
const createMedia = z
  .object({
    key: z.string().min(3).max(300),
    media_kind: z.enum([...MEDIA_KINDS, "video"]).default("other"),
    caption: optText(200),
    is_cover: z.boolean().default(false),
  })
  .strict();
const patchMedia = z.object({ is_cover: z.boolean(), caption: optText(200) }).partial().strict();

const VIDEO = /\.(mp4|webm|mov)$/i;
const IMAGE = /\.(png|jpe?g|webp|avif|gif)$/i;

/** Prisma data from validated input (time column needs a Date). */
function toData<T extends Record<string, unknown>>(input: T) {
  const { music_curfew_time, ...rest } = input as T & { music_curfew_time?: string | null };
  return {
    ...rest,
    ...(music_curfew_time !== undefined ? { music_curfew_time: toDbTime(music_curfew_time) } : {}),
  };
}

export const venueRoutes: FastifyPluginAsync = async (app) => {
  const { db, storage } = app;

  const ownVenue = async (vendor: string, id: string) => {
    const v = await db.venues.findFirst({ where: { id, vendor_id: vendor } });
    if (!v) throw notFound("Venue not found");
    return v;
  };

  app.get("/venues", async (req) => {
    const rows = await db.venues.findMany({ where: { vendor_id: vendorId(req) }, orderBy: { created_at: "asc" } });
    return rows.map(venueDto);
  });

  app.post("/venues", async (req, reply) => {
    const input = parse(createVenue, req.body);
    const created = await db.venues.create({ data: { ...toData(input), vendor_id: vendorId(req) } as never });
    return reply.status(201).send(venueDto(created));
  });

  app.patch("/venues/:id", async (req) => {
    const id = idParam(req.params);
    const input = parse(patchVenue, req.body);
    await ownVenue(vendorId(req), id);
    const updated = await db.venues.update({ where: { id }, data: toData(input) as never });
    return venueDto(updated);
  });

  app.delete("/venues/:id", async (req, reply) => {
    const id = idParam(req.params);
    await ownVenue(vendorId(req), id);
    const media = await db.venue_media.findMany({ where: { venue_id: id }, select: { url: true } });
    // Cascades to venue_media, venue-scoped services and calendar blocks.
    await db.venues.delete({ where: { id } });
    for (const m of media) void storage.remove("venue-media", storage.keyFromUrl("venue-media", m.url), req.log);
    return reply.status(204).send();
  });

  app.get("/venues/:id/media", async (req) => {
    const id = idParam(req.params);
    await ownVenue(vendorId(req), id);
    const rows = await db.venue_media.findMany({
      where: { venue_id: id },
      orderBy: [{ is_cover: "desc" }, { sort_order: "asc" }, { created_at: "asc" }],
    });
    return rows.map(venueMediaDto);
  });

  app.post("/venues/:id/media", async (req, reply) => {
    const id = idParam(req.params);
    const input = parse(createMedia, req.body);
    await ownVenue(vendorId(req), id);
    if (!input.key.startsWith(`${id}/`)) throw badRequest("That upload belongs to a different venue.");

    const isVideo = VIDEO.test(input.key);
    // Kind follows the file: videos are always "video", never a cover.
    const media_kind = isVideo ? "video" : input.media_kind === "video" ? "other" : input.media_kind;
    const is_cover = input.is_cover && IMAGE.test(input.key);

    const created = await db.$transaction(async (tx) => {
      if (is_cover) await tx.venue_media.updateMany({ where: { venue_id: id, is_cover: true }, data: { is_cover: false } });
      return tx.venue_media.create({
        data: {
          venue_id: id,
          url: storage.publicUrl("venue-media", input.key),
          media_kind,
          caption: input.caption,
          is_cover,
        },
      });
    });
    return reply.status(201).send(venueMediaDto(created));
  });

  const ownMedia = async (vendor: string, id: string) => {
    const m = await db.venue_media.findFirst({ where: { id, venues: { vendor_id: vendor } } });
    if (!m) throw notFound("Media not found");
    return m;
  };

  app.patch("/venue-media/:id", async (req) => {
    const id = idParam(req.params);
    const input = parse(patchMedia, req.body);
    const media = await ownMedia(vendorId(req), id);
    if (input.is_cover && !IMAGE.test(media.url)) throw badRequest("Only photos can be the cover.");

    const updated = await db.$transaction(async (tx) => {
      if (input.is_cover) {
        await tx.venue_media.updateMany({
          where: { venue_id: media.venue_id, is_cover: true, id: { not: id } },
          data: { is_cover: false },
        });
      }
      return tx.venue_media.update({ where: { id }, data: input });
    });
    return venueMediaDto(updated);
  });

  app.delete("/venue-media/:id", async (req, reply) => {
    const id = idParam(req.params);
    const media = await ownMedia(vendorId(req), id);
    await db.venue_media.delete({ where: { id } });
    void storage.remove("venue-media", storage.keyFromUrl("venue-media", media.url), req.log);
    return reply.status(204).send();
  });
};
