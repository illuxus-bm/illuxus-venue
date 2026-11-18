import type { FastifyPluginAsync } from "fastify";

import { vendorDto } from "../lib/dto.js";
import { ratingFor } from "../lib/ratings.js";
import { authenticate, requireVendor } from "../plugins/context.js";
import { bookingRoutes } from "./me/bookings.js";
import { inboxRoutes } from "./me/inbox.js";
import { insightRoutes } from "./me/insights.js";
import { listingRoutes } from "./me/listings.js";
import { profileRoutes } from "./me/profile.js";
import { venueRoutes } from "./me/venues.js";

export const meRoutes: FastifyPluginAsync = async (app) => {
  /** Session bootstrap: who am I, and which business (if any). */
  app.get("/", { preHandler: authenticate }, async (req) => {
    const user = req.user!;
    const allow = app.env.VENDOR_ALLOWED_EMAILS;
    const allowed = allow.length === 0 || (!!user.email && allow.includes(user.email.toLowerCase()));

    const member = allowed
      ? await app.db.vendor_members.findFirst({
          where: { user_id: user.id },
          orderBy: { created_at: "asc" },
          include: { vendors: true },
        })
      : null;

    if (!member) return { user, vendor: null };
    const rating = await ratingFor(app.db, member.vendor_id);
    return { user, vendor: { ...vendorDto(member.vendors), ...rating }, role: member.role };
  });

  // Everything else needs a vendor membership and is scoped to it.
  await app.register(async (scoped) => {
    scoped.addHook("preHandler", requireVendor);
    await scoped.register(profileRoutes);
    await scoped.register(venueRoutes);
    await scoped.register(listingRoutes);
    await scoped.register(inboxRoutes);
    await scoped.register(bookingRoutes);
    await scoped.register(insightRoutes);
  });
};
