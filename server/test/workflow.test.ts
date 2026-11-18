import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, harness, makeOrganizer, makeVendor, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterAll(async () => h?.close());

async function rfqFor(vendorId: string, orgId: string, status = "open") {
  const rfq = await h.db.rfqs.create({
    data: { org_id: orgId, requirements: "Product launch for 200 guests", event_city: "Mumbai", status, budget_min: 100000n, budget_max: 900000n, event_date: new Date("2027-02-10T00:00:00Z") },
  });
  await h.db.rfq_invitees.create({ data: { rfq_id: rfq.id, vendor_id: vendorId } });
  return rfq;
}

describe("inbox + quotes", () => {
  it("lists invites, quotes once, rejects uninvited and closed", async () => {
    const { user, vendor } = await makeVendor(h);
    const org = await makeOrganizer(h);
    const rfq = await rfqFor(vendor.id, org.org.id);
    const api = as(h, user);

    const inbox = (await api.get("/me/inbox/rfqs")).json();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ rfq_id: rfq.id, budget_max: 900000, event_date: "2027-02-10", responded_at: null, declined: false });

    const quote = { rfq_id: rfq.id, total: 450000, currency: "INR", valid_until: "2099-01-01", inclusions: "Hall + AV" };
    const q = await api.post("/me/quotes", quote);
    expect(q.statusCode).toBe(201);
    expect(q.json()).toMatchObject({ total: 450000, status: "sent", valid_until: "2099-01-01" });
    expect((await api.post("/me/quotes", quote)).statusCode).toBe(409);
    expect((await api.get("/me/inbox/rfqs")).json()[0].responded_at).toBeTruthy();
    expect((await api.get("/me/quotes")).json()).toHaveLength(1);

    const other = await makeVendor(h);
    expect((await as(h, other.user).post("/me/quotes", quote)).statusCode).toBe(403);

    const closed = await rfqFor(vendor.id, org.org.id, "cancelled");
    expect((await api.post("/me/quotes", { ...quote, rfq_id: closed.id })).statusCode).toBe(409);
    const open2 = await rfqFor(vendor.id, org.org.id);
    expect((await api.post("/me/quotes", { ...quote, rfq_id: open2.id, valid_until: "2000-01-01" })).statusCode).toBe(409);
    expect((await api.post("/me/quotes", { ...quote, rfq_id: open2.id, total: 0 })).statusCode).toBe(400);

    expect((await api.post(`/me/inbox/rfqs/${open2.id}/decline`)).statusCode).toBe(204);
    expect((await as(h, other.user).post(`/me/inbox/rfqs/${open2.id}/decline`)).statusCode).toBe(404);
  });

  it("venue requests: details, respond once, organizer emailed", async () => {
    const { user, vendor } = await makeVendor(h, "Sea View Halls");
    const org = await makeOrganizer(h);
    const venue = (await as(h, user).post("/me/venues", { name: "Rooftop", city: "Mumbai" })).json();
    const svc = (await as(h, user).post("/me/services", { title: "Catering", base_price: 1000, currency: "INR", unit: "per_person" })).json();
    const sel = await h.db.event_venue_selections.create({
      data: {
        event_id: org.event.id,
        org_id: org.org.id,
        vendor_id: vendor.id,
        venue_id: venue.id,
        selected_service_ids: [svc.id],
        event_duration_hours: 4.5,
        venue_link: "https://example.com/brief",
      },
    });

    const list = (await as(h, user).get("/me/inbox/venue-requests")).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      selection_id: sel.id,
      status: "contacted",
      venue_name: "Rooftop",
      event_title: "Launch Night",
      event_city: "Mumbai",
      org_name: "Acme Events",
      organizer_name: "Priya Planner",
      organizer_email: org.user.email,
      organizer_phone: "+91 9800000000",
      event_duration_hours: 4.5,
      requested_services: [{ id: svc.id, title: "Catering" }],
    });

    const res = await as(h, user).post(`/me/inbox/venue-requests/${sel.id}/respond`, { status: "accepted" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "accepted", emailed: true });
    expect(h.sent.at(-1)).toMatchObject({ to: org.user.email });
    expect(h.sent.at(-1)!.subject).toContain("accepted");

    expect((await as(h, user).post(`/me/inbox/venue-requests/${sel.id}/respond`, { status: "declined" })).statusCode).toBe(409);
    const other = await makeVendor(h);
    expect((await as(h, other.user).post(`/me/inbox/venue-requests/${sel.id}/respond`, { status: "declined" })).statusCode).toBe(404);
  });
});

describe("bookings", () => {
  it("follows the status flow and keeps the calendar in sync", async () => {
    const { user, vendor } = await makeVendor(h);
    const org = await makeOrganizer(h);
    const api = as(h, user);
    const booking = await h.db.vendor_bookings.create({
      data: { org_id: org.org.id, vendor_id: vendor.id, total: 9_000_000n, currency: "INR", event_date: new Date("2027-04-01T00:00:00Z") },
    });
    // A manual block on the same day must not make confirming fail.
    await api.post("/me/availability", { date: "2027-04-01", note: "manual" });

    const list = (await api.get("/me/bookings")).json();
    expect(list[0]).toMatchObject({ id: booking.id, total: 9_000_000, event_date: "2027-04-01", status: "pending", summary: "Booking" });

    expect((await api.patch(`/me/bookings/${booking.id}`, { status: "completed" })).statusCode).toBe(409);
    expect((await api.patch(`/me/bookings/${booking.id}`, { status: "confirmed" })).json().status).toBe("confirmed");
    expect((await api.patch(`/me/bookings/${booking.id}`, { status: "in_progress" })).json().status).toBe("in_progress");
    expect((await api.patch(`/me/bookings/${booking.id}`, { deposit_status: "refunded" })).statusCode).toBe(409);
    expect((await api.patch(`/me/bookings/${booking.id}`, { deposit_status: "received" })).json().deposit_status).toBe("received");
    expect((await api.patch(`/me/bookings/${booking.id}`, { status: "confirmed", deposit_status: "received" })).statusCode).toBe(400);
    expect((await api.patch(`/me/bookings/${booking.id}`, { total: 1 })).statusCode).toBe(400);

    // Cancelling from in_progress releases the auto-block.
    expect((await api.patch(`/me/bookings/${booking.id}`, { status: "cancelled" })).json().status).toBe("cancelled");
    const booked = await h.db.vendor_availability.count({ where: { booking_id: booking.id } });
    expect(booked).toBe(0);
    expect((await api.patch(`/me/bookings/${booking.id}`, { status: "confirmed" })).statusCode).toBe(409);

    const rival = await makeVendor(h);
    expect((await as(h, rival.user).patch(`/me/bookings/${booking.id}`, { status: "cancelled" })).statusCode).toBe(404);
  });

  it("confirming an unblocked date blocks it", async () => {
    const { user, vendor } = await makeVendor(h);
    const org = await makeOrganizer(h);
    const b = await h.db.vendor_bookings.create({
      data: { org_id: org.org.id, vendor_id: vendor.id, total: 1n, currency: "INR", event_date: new Date("2027-05-05T00:00:00Z") },
    });
    await as(h, user).patch(`/me/bookings/${b.id}`, { status: "confirmed" });
    const days = (await as(h, user).get("/me/availability")).json();
    expect(days).toEqual([expect.objectContaining({ date: "2027-05-05", status: "booked", booking_id: b.id })]);
    // Booked (not manual) blocks can't be removed directly.
    expect((await as(h, user).del(`/me/availability/${days[0].id}`)).statusCode).toBe(409);
  });
});

describe("reviews, stats and public pages", () => {
  it("aggregates and exposes only public data", async () => {
    const { user, vendor } = await makeVendor(h, "Public Co");
    const org = await makeOrganizer(h);
    const api = as(h, user);
    const venue = (await api.post("/me/venues", { name: "Lawn", city: "Pune", capacity_banquet: 500, capacity_theater: 300 })).json();
    await api.post(`/me/venues/${venue.id}/media`, { key: `${venue.id}/c.jpg`, is_cover: true });
    const hidden = (await api.post("/me/venues", { name: "Draft", city: "Pune", is_active: false })).json();
    await api.post("/me/services", { title: "Decor", base_price: 500, currency: "INR", unit: "flat" });

    const done = await h.db.vendor_bookings.create({
      data: { org_id: org.org.id, vendor_id: vendor.id, total: 700_000n, currency: "INR", status: "completed", event_date: new Date("2026-01-01T00:00:00Z") },
    });
    await h.db.vendor_reviews.create({ data: { booking_id: done.id, reviewer_id: org.user.id, reviewer_type: "organizer", rating: 4, comment: "Lovely" } });

    const reviews = (await api.get("/me/reviews")).json();
    expect(reviews).toEqual([expect.objectContaining({ rating: 4, booking_event_date: "2026-01-01" })]);

    const stats = (await api.get("/me/stats?tz_offset_minutes=-330")).json();
    expect(stats).toMatchObject({ bookings: 1, revenueThisMonth: 700_000, currency: "INR" });
    expect((await api.get("/me/stats?tz_offset_minutes=9999")).statusCode).toBe(400);

    const pub = as(h);
    const venues = (await pub.get("/public/venues")).json();
    const listed = venues.find((v: { id: string }) => v.id === venue.id);
    expect(listed).toMatchObject({ max_capacity: 500, cover_url: expect.stringContaining("/c.jpg") });
    expect(venues.find((v: { id: string }) => v.id === hidden.id)).toBeUndefined();
    expect((await pub.get(`/public/venues/${hidden.id}`)).statusCode).toBe(404);

    const detail = await pub.get(`/public/venues/${venue.id}`);
    expect(detail.headers["cache-control"]).toContain("max-age=60");
    expect(detail.json().vendor).toMatchObject({ business_name: "Public Co", rating_avg: 4, rating_count: 1 });

    const profile = (await pub.get(`/public/vendors/${vendor.id}`)).json();
    expect(profile.vendor).toMatchObject({ business_name: "Public Co", rating_avg: 4 });
    expect(profile.vendor.commission_rate).toBeUndefined();
    expect(profile.vendor.notify_email).toBeUndefined();
    expect(profile.reviews[0]).toEqual({ id: expect.any(String), rating: 4, comment: "Lovely", created_at: expect.any(String), event_date: "2026-01-01" });
    expect(profile.services).toHaveLength(1);
    expect(profile.services[0].is_active).toBeUndefined();
  });
});
