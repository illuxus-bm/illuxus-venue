import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { as, harness, makeVendor, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterAll(async () => h?.close());

const draft = { name: "Grand Hall", city: "Mumbai", capacity_theater: 300, length_ft: 80.5, music_curfew_time: "22:30" };

describe("venues", () => {
  it("CRUD with validation", async () => {
    const { user } = await makeVendor(h);
    const api = as(h, user);

    const created = await api.post("/me/venues", draft);
    expect(created.statusCode).toBe(201);
    const v = created.json();
    expect(v).toMatchObject({ name: "Grand Hall", city: "Mumbai", length_ft: 80.5, music_curfew_time: "22:30:00", is_active: true });

    expect((await api.post("/me/venues", { name: "No city" })).statusCode).toBe(400);
    expect((await api.post("/me/venues", { ...draft, capacity_theater: -5 })).statusCode).toBe(400);
    expect((await api.post("/me/venues", { ...draft, capacity_theater: 1.5 })).statusCode).toBe(400);
    expect((await api.post("/me/venues", { ...draft, map_url: "javascript:alert(1)" })).statusCode).toBe(400);
    expect((await api.post("/me/venues", { ...draft, vendor_id: v.vendor_id })).statusCode).toBe(400);

    const patched = await api.patch(`/me/venues/${v.id}`, { is_active: false, map_url: "https://maps.app.goo.gl/x" });
    expect(patched.json()).toMatchObject({ is_active: false, map_url: "https://maps.app.goo.gl/x" });

    expect((await api.get("/me/venues")).json()).toHaveLength(1);
    expect((await api.del(`/me/venues/${v.id}`)).statusCode).toBe(204);
    expect((await api.get("/me/venues")).json()).toHaveLength(0);
  });

  it("isolates vendors from each other", async () => {
    const a = await makeVendor(h, "A");
    const b = await makeVendor(h, "B");
    const v = (await as(h, a.user).post("/me/venues", draft)).json();
    const rival = as(h, b.user);
    expect((await rival.get(`/me/venues/${v.id}/media`)).statusCode).toBe(404);
    expect((await rival.patch(`/me/venues/${v.id}`, { name: "Hijacked" })).statusCode).toBe(404);
    expect((await rival.del(`/me/venues/${v.id}`)).statusCode).toBe(404);
    expect((await rival.post("/me/uploads", { kind: "venue-media", venue_id: v.id, content_type: "image/png", size: 10 })).statusCode).toBe(404);
    expect((await rival.get("/me/venues")).json()).toHaveLength(0);
    expect((await as(h, a.user).get("/me/venues")).json()[0].name).toBe("Grand Hall");
  });

  it("media: kinds follow the file, one cover at a time, cleanup on delete", async () => {
    const { user } = await makeVendor(h);
    const api = as(h, user);
    const v = (await api.post("/me/venues", draft)).json();

    const img1 = (await api.post(`/me/venues/${v.id}/media`, { key: `${v.id}/1.jpg`, media_kind: "setup", is_cover: true })).json();
    const img2 = (await api.post(`/me/venues/${v.id}/media`, { key: `${v.id}/2.jpg`, media_kind: "video" })).json();
    const vid = (await api.post(`/me/venues/${v.id}/media`, { key: `${v.id}/3.mp4`, media_kind: "setup", is_cover: true })).json();
    expect(img1).toMatchObject({ is_cover: true, media_kind: "setup" });
    expect(img2.media_kind).toBe("other"); // an image filed as video is corrected
    expect(vid).toMatchObject({ media_kind: "video", is_cover: false }); // videos never cover
    expect(img1.url).toBe(`https://cdn.test/storage/v1/object/public/venue-media/${v.id}/1.jpg`);

    expect((await api.post(`/me/venues/${v.id}/media`, { key: "other-venue/x.jpg" })).statusCode).toBe(400);
    expect((await api.post(`/me/venues/${v.id}/media`, { key: `${v.id}/x.jpg`, url: "javascript:x" })).statusCode).toBe(400);

    await api.patch(`/me/venue-media/${img2.id}`, { is_cover: true });
    const media = (await api.get(`/me/venues/${v.id}/media`)).json();
    expect(media.filter((m: { is_cover: boolean }) => m.is_cover).map((m: { id: string }) => m.id)).toEqual([img2.id]);
    expect(media[0].id).toBe(img2.id);
    expect((await api.patch(`/me/venue-media/${vid.id}`, { is_cover: true })).statusCode).toBe(400);

    expect((await api.del(`/me/venue-media/${img1.id}`)).statusCode).toBe(204);
    expect(h.removed).toContain(`${v.id}/1.jpg`);
    await api.del(`/me/venues/${v.id}`);
    await new Promise((r) => setTimeout(r, 20));
    expect(h.removed).toEqual(expect.arrayContaining([`${v.id}/2.jpg`, `${v.id}/3.mp4`]));
  });

  it("services: own venues only, money in minor units", async () => {
    const a = await makeVendor(h);
    const b = await makeVendor(h);
    const vb = (await as(h, b.user).post("/me/venues", draft)).json();
    const api = as(h, a.user);
    const base = { title: "Photography", base_price: 2500000, currency: "INR", unit: "per_event" };

    const s = await api.post("/me/services", base);
    expect(s.statusCode).toBe(201);
    expect(s.json()).toMatchObject({ base_price: 2500000, venue_id: null });
    expect((await api.post("/me/services", { ...base, venue_id: vb.id })).statusCode).toBe(400);
    expect((await api.post("/me/services", { ...base, base_price: -1 })).statusCode).toBe(400);
    expect((await api.patch(`/me/services/${s.json().id}`, { base_price: 100 })).json().base_price).toBe(100);
    expect((await as(h, b.user).del(`/me/services/${s.json().id}`)).statusCode).toBe(404);
    expect((await api.del(`/me/services/${s.json().id}`)).statusCode).toBe(204);
  });

  it("availability: block, duplicate, release", async () => {
    const { user } = await makeVendor(h);
    const api = as(h, user);
    const b = await api.post("/me/availability", { date: "2027-03-01", note: "Private event" });
    expect(b.statusCode).toBe(201);
    expect(b.json()).toMatchObject({ date: "2027-03-01", status: "held", venue_id: null });
    expect((await api.post("/me/availability", { date: "2027-03-01" })).statusCode).toBe(409);
    expect((await api.post("/me/availability", { date: "2027-02-30" })).statusCode).toBe(400);
    expect((await api.get("/me/availability")).json()).toHaveLength(1);
    expect((await api.del(`/me/availability/${b.json().id}`)).statusCode).toBe(204);
  });

  it("portfolio: own uploads only", async () => {
    const { user, vendor } = await makeVendor(h);
    const api = as(h, user);
    const p = await api.post("/me/portfolio", { key: `${vendor.id}/p.jpg`, caption: "Wedding" });
    expect(p.statusCode).toBe(201);
    expect(p.json()).toMatchObject({ media_type: "image", caption: "Wedding", sort_order: 0 });
    expect((await api.post("/me/portfolio", { key: "elsewhere/p.jpg" })).statusCode).toBe(400);
    expect((await api.del(`/me/portfolio/${p.json().id}`)).statusCode).toBe(204);
    expect(h.removed).toContain(`${vendor.id}/p.jpg`);
  });

  it("malformed ids are 404, not 500", async () => {
    const { user } = await makeVendor(h);
    expect((await as(h, user).patch("/me/venues/not-a-uuid", { name: "x" })).statusCode).toBe(404);
    expect((await as(h).get("/public/venues/not-a-uuid")).statusCode).toBe(404);
    expect((await as(h).get("/public/vendors/123")).statusCode).toBe(404);
  });
});
