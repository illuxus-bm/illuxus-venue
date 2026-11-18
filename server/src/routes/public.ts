import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { dateOnly, iso, serviceDto, venueDto, venueMediaDto } from "../lib/dto.js";
import { notFound } from "../lib/errors.js";
import { ratingFor } from "../lib/ratings.js";
import { idParam } from "../lib/validate.js";

const IMAGE = /\.(png|jpe?g|webp|avif|gif)(\?|$)/i;

const cache = (reply: FastifyReply) =>
  reply.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

const publicService = (s: Parameters<typeof serviceDto>[0]) => {
  const { is_instant_book: _i, quote_on_request: _q, is_active: _a, ...rest } = serviceDto(s);
  return rest;
};

export const publicRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  /** Landing page: every listed venue with a photo cover. */
  app.get("/venues", async (_req, reply) => {
    const venues = await db.venues.findMany({
      where: { is_active: true },
      orderBy: { created_at: "asc" },
      take: 500,
      include: {
        venue_media: {
          where: { media_kind: { not: "video" } },
          orderBy: [{ is_cover: "desc" }, { sort_order: "asc" }, { created_at: "asc" }],
          select: { url: true },
          take: 5,
        },
      },
    });
    cache(reply);
    return venues.map((v) => {
      const caps = [v.capacity_floating, v.capacity_theater, v.capacity_banquet, v.capacity_ushape, v.capacity_classroom]
        .filter((n): n is number => typeof n === "number");
      return {
        id: v.id,
        vendor_id: v.vendor_id,
        name: v.name,
        description: v.description,
        space_type: v.space_type,
        city: v.city,
        area_sqft: v.area_sqft,
        max_capacity: caps.length ? Math.max(...caps) : null,
        cover_url: v.venue_media.find((m) => IMAGE.test(m.url))?.url ?? null,
      };
    });
  });

  /** One listed venue: details, gallery, its business and add-on services. */
  app.get("/venues/:id", async (req, reply) => {
    const id = idParam(req.params);
    const venue = await db.venues.findFirst({ where: { id, is_active: true } });
    if (!venue) throw notFound("Venue not found");

    const [media, vendor, services, rating] = await Promise.all([
      db.venue_media.findMany({
        where: { venue_id: id },
        orderBy: [{ is_cover: "desc" }, { sort_order: "asc" }, { created_at: "asc" }],
      }),
      db.vendors.findUnique({
        where: { id: venue.vendor_id },
        select: { id: true, business_name: true, logo_url: true, verification_status: true },
      }),
      db.vendor_services.findMany({
        where: { vendor_id: venue.vendor_id, is_active: true, OR: [{ venue_id: null }, { venue_id: id }] },
        orderBy: { created_at: "asc" },
      }),
      ratingFor(db, venue.vendor_id),
    ]);

    cache(reply);
    return {
      venue: venueDto(venue),
      media: media.map(venueMediaDto),
      vendor: vendor
        ? { ...vendor, ...rating }
        : { id: venue.vendor_id, business_name: "Venue partner", logo_url: null, verification_status: null, ...rating },
      services: services.map(publicService),
    };
  });

  /** A venue business's public profile. Commercial terms stay private. */
  app.get("/vendors/:id", async (req, reply) => {
    const id = idParam(req.params);
    const vendor = await db.vendors.findUnique({
      where: { id },
      select: {
        id: true,
        business_name: true,
        tagline: true,
        bio: true,
        website: true,
        city: true,
        country: true,
        logo_url: true,
        cover_url: true,
        years_experience: true,
        response_time_hours: true,
        socials: true,
        verification_status: true,
      },
    });
    if (!vendor) throw notFound("Profile not found");

    const [services, portfolio, reviews, areas, rating] = await Promise.all([
      db.vendor_services.findMany({ where: { vendor_id: id, is_active: true }, orderBy: { created_at: "asc" } }),
      db.vendor_portfolio.findMany({
        where: { vendor_id: id },
        orderBy: [{ is_cover: "desc" }, { sort_order: "asc" }],
        select: { id: true, url: true, media_type: true, caption: true },
      }),
      db.vendor_reviews.findMany({
        where: { reviewer_type: "organizer", vendor_bookings: { vendor_id: id } },
        orderBy: { created_at: "desc" },
        take: 12,
        // No reviewer identity: name, id and booking stay private.
        select: { id: true, rating: true, comment: true, created_at: true, vendor_bookings: { select: { event_date: true } } },
      }),
      db.vendor_service_areas.findMany({ where: { vendor_id: id }, select: { city: true } }),
      ratingFor(db, id),
    ]);

    cache(reply);
    return {
      vendor: { ...vendor, socials: (vendor.socials as Record<string, string> | null) ?? {}, ...rating },
      services: services.map(publicService),
      portfolio,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: iso(r.created_at),
        event_date: dateOnly(r.vendor_bookings?.event_date),
      })),
      serviceAreas: [...new Set(areas.map((a) => a.city.trim()).filter(Boolean))],
    };
  });

};
