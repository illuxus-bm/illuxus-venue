import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { dateOnly, iso, moneyOrNull, num, quoteDto, toDbDate } from "../../lib/dto.js";
import { esc } from "../../lib/email.js";
import { conflict, forbidden, HttpError, notFound } from "../../lib/errors.js";
import { currency, idParam, isoDate, optText, parse, uuid } from "../../lib/validate.js";
import { vendorId } from "../../plugins/context.js";

const respondBody = z.object({ status: z.enum(["accepted", "declined"]) }).strict();

const createQuote = z
  .object({
    rfq_id: uuid,
    total: z.number().int().positive("Total must be greater than zero").max(1_000_000_000_00),
    currency,
    valid_until: isoDate,
    inclusions: optText(1000),
    notes: optText(1000),
  })
  .strict();

export const inboxRoutes: FastifyPluginAsync = async (app) => {
  const { db, users, mailer, env } = app;

  // ── RFQs the vendor was invited to ────────────────────────────────────
  app.get("/inbox/rfqs", async (req) => {
    const rows = await db.rfq_invitees.findMany({
      where: { vendor_id: vendorId(req) },
      orderBy: { invited_at: "desc" },
      include: { rfqs: { include: { vendor_categories: { select: { slug: true, name: true } } } } },
    });
    return rows.map((r) => ({
      invitee_id: r.id,
      rfq_id: r.rfqs.id,
      requirements: r.rfqs.requirements ?? "",
      event_city: r.rfqs.event_city,
      event_date: dateOnly(r.rfqs.event_date),
      expected_guests: r.rfqs.expected_guests,
      budget_min: moneyOrNull(r.rfqs.budget_min),
      budget_max: moneyOrNull(r.rfqs.budget_max),
      currency: r.rfqs.currency,
      status: r.rfqs.status,
      invited_at: iso(r.invited_at),
      responded_at: iso(r.responded_at),
      declined: r.declined,
      category_slug: r.rfqs.vendor_categories?.slug ?? null,
      category_name: r.rfqs.vendor_categories?.name ?? null,
    }));
  });

  app.post("/inbox/rfqs/:rfqId/decline", async (req, reply) => {
    const rfqId = idParam(req.params, "rfqId");
    const { count } = await db.rfq_invitees.updateMany({
      where: { rfq_id: rfqId, vendor_id: vendorId(req) },
      data: { declined: true, responded_at: new Date() },
    });
    if (count === 0) throw notFound("Request not found");
    return reply.status(204).send();
  });

  // ── Direct venue picks from the main app (event_venue_selections) ─────
  app.get("/inbox/venue-requests", async (req) => {
    const vid = vendorId(req);
    const rows = await db.event_venue_selections.findMany({
      where: { vendor_id: vid },
      orderBy: { created_at: "desc" },
      take: 500,
      include: { events: { include: { organizations: { select: { name: true } } } } },
    });

    const venueIds = [...new Set(rows.map((r) => r.venue_id).filter((v): v is string => !!v))];
    const serviceIds = [...new Set(rows.flatMap((r) => r.selected_service_ids ?? []))];
    const organizerIds = [...new Set(rows.map((r) => r.events.user_id).filter((v): v is string => !!v))];

    const [venues, services, profiles, contacts] = await Promise.all([
      venueIds.length
        ? db.venues.findMany({ where: { id: { in: venueIds }, vendor_id: vid }, select: { id: true, name: true } })
        : [],
      serviceIds.length
        ? db.vendor_services.findMany({
            where: { id: { in: serviceIds }, vendor_id: vid },
            select: { id: true, title: true, category: true },
          })
        : [],
      organizerIds.length ? db.profiles.findMany({ where: { user_id: { in: organizerIds } } }) : [],
      users.contacts(organizerIds),
    ]);
    const venueName = new Map(venues.map((v) => [v.id, v.name]));
    const serviceById = new Map(services.map((s) => [s.id, s]));
    const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));

    return rows.map((s) => {
      const e = s.events;
      const p = e.user_id ? profileByUser.get(e.user_id) : undefined;
      const c = e.user_id ? contacts.get(e.user_id) : undefined;
      const fullName = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
      // Contact details are only shared while the request is live.
      const live = s.status === "contacted" || s.status === "accepted";
      const phone = [p?.mobile_country_code, p?.mobile_number].filter(Boolean).join(" ").trim();
      return {
        selection_id: s.id,
        status: s.status,
        notes: s.notes,
        created_at: iso(s.created_at),
        responded_at: iso(s.responded_at),

        event_type: s.event_type,
        event_duration_hours: num(s.event_duration_hours),
        expected_attendees: s.expected_attendees,
        seating_capacity: s.seating_capacity,
        seating_arrangement: s.seating_arrangement,
        needs_pre_function_area: s.needs_pre_function_area,
        needs_vip_area: s.needs_vip_area,
        needs_additional_rooms: s.needs_additional_rooms,
        venue_link: s.venue_link,

        event_id: e.id,
        event_title: e.title,
        event_description: e.description,
        event_date: iso(e.date),
        event_end_date: iso(e.end_date),
        event_timezone: e.timezone,
        event_city: e.location,
        event_venue: e.venue,
        event_capacity: e.capacity,
        event_format: e.event_format,
        event_banner_url: e.banner_landscape_url ?? e.banner_portrait_url ?? e.image_url,

        venue_id: s.venue_id,
        venue_name: s.venue_id ? (venueName.get(s.venue_id) ?? null) : null,

        org_name: e.organizations?.name ?? null,
        organizer_name: p?.display_name?.trim() || fullName || c?.name || c?.email?.split("@")[0] || null,
        organizer_email: live ? (c?.email ?? null) : null,
        organizer_phone: live ? phone || null : null,

        requested_services: (s.selected_service_ids ?? [])
          .map((id) => serviceById.get(id))
          .filter((x): x is { id: string; title: string; category: string | null } => !!x),
      };
    });
  });

  app.post("/inbox/venue-requests/:selectionId/respond", async (req) => {
    const selectionId = idParam(req.params, "selectionId");
    const { status } = parse(respondBody, req.body);
    const vid = vendorId(req);

    // Only a still-open request can be answered (optimistic: no double answers).
    const { count } = await db.event_venue_selections.updateMany({
      where: { id: selectionId, vendor_id: vid, status: "contacted" },
      data: { status, responded_at: new Date() },
    });
    if (count === 0) {
      const exists = await db.event_venue_selections.findFirst({ where: { id: selectionId, vendor_id: vid }, select: { status: true } });
      if (!exists) throw notFound("Request not found");
      throw conflict(`This request was already ${exists.status}.`);
    }

    const sel = await db.event_venue_selections.findUniqueOrThrow({
      where: { id: selectionId },
      include: { events: true, vendors: { select: { business_name: true } } },
    });
    const venue = sel.venue_id ? await db.venues.findUnique({ where: { id: sel.venue_id }, select: { name: true } }) : null;
    const to = sel.events.user_id ? await users.email(sel.events.user_id) : null;

    let emailed = false;
    if (to && sel.response_notified_status !== status) {
      const accepted = status === "accepted";
      const place = venue?.name ?? sel.vendors.business_name;
      const subject = accepted
        ? `${place} accepted your venue request for ${sel.events.title}`
        : `${place} can't host ${sel.events.title}`;
      const link = `${env.ILLUXUS_ORIGIN.replace(/\/$/, "")}/dashboard/events/${sel.events.id}`;
      const text = accepted
        ? `Good news: ${place} (${sel.vendors.business_name}) accepted your request for "${sel.events.title}". Open your event to continue: ${link}`
        : `${place} (${sel.vendors.business_name}) declined your request for "${sel.events.title}". You can pick another venue from your event: ${link}`;
      emailed = await mailer.send({
        to,
        subject,
        text,
        html: `<p>${esc(text).replace(esc(link), `<a href="${esc(link)}">${esc(link)}</a>`)}</p>`,
      });
      if (emailed) {
        await db.event_venue_selections.update({ where: { id: selectionId }, data: { response_notified_status: status } });
      }
    }
    return { status, emailed };
  });

  // ── Quotes ────────────────────────────────────────────────────────────
  app.get("/quotes", async (req) => {
    const rows = await db.quotes.findMany({
      where: { vendor_id: vendorId(req) },
      orderBy: { created_at: "desc" },
      include: { rfqs: { select: { requirements: true } } },
    });
    return rows.map(quoteDto);
  });

  app.post("/quotes", async (req, reply) => {
    const input = parse(createQuote, req.body);
    const vid = vendorId(req);

    // Today in the earliest timezone, so no one is blocked by UTC midnight.
    const earliestToday = new Date(Date.now() - 14 * 3_600_000).toISOString().slice(0, 10);
    if (input.valid_until < earliestToday) {
      throw new HttpError(409, "The validity date can't be in the past.", "invalid_validity");
    }

    const invite = await db.rfq_invitees.findFirst({
      where: { rfq_id: input.rfq_id, vendor_id: vid },
      include: { rfqs: { select: { status: true } } },
    });
    if (!invite) throw forbidden("You weren't invited to quote on this request.");
    if (invite.declined) throw new HttpError(409, "You declined this request.", "rfq_declined");
    if (invite.rfqs.status !== "open") throw new HttpError(409, "This request is no longer accepting quotes.", "rfq_closed");

    const existing = await db.quotes.findFirst({ where: { rfq_id: input.rfq_id, vendor_id: vid }, select: { id: true } });
    if (existing) throw new HttpError(409, "You've already sent a quote for this request.", "quote_exists");

    const created = await db.$transaction(async (tx) => {
      const q = await tx.quotes.create({
        data: {
          rfq_id: input.rfq_id,
          vendor_id: vid,
          total: BigInt(input.total),
          currency: input.currency,
          valid_until: toDbDate(input.valid_until),
          inclusions: input.inclusions,
          notes: input.notes,
          status: "sent",
        },
        include: { rfqs: { select: { requirements: true } } },
      });
      await tx.rfq_invitees.updateMany({
        where: { id: invite.id, responded_at: null },
        data: { responded_at: new Date() },
      });
      return q;
    });
    return reply.status(201).send(quoteDto(created));
  });
};
