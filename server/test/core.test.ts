import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { as, flavor, harness, makeUser, makeVendor, PASSWORD, testEnv, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterAll(async () => h?.close());

describe("health", () => {
  it("is live and ready", async () => {
    expect((await as(h).get("/health")).json()).toEqual({ ok: true });
    const ready = await as(h).get("/ready");
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ ok: true, db: "up" });
  });

  it("unknown endpoints return the JSON error envelope", async () => {
    const res = await as(h).get("/nope");
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: "not_found" });
    expect(res.json().error.requestId).toBeTruthy();
  });
});

describe("database outage", () => {
  it("reports not-ready and 503s instead of crashing", async () => {
    const app = await buildApp({ env: testEnv({ DATABASE_URL: "postgresql://postgres@127.0.0.1:1/none" }) });
    await app.ready();
    try {
      expect((await app.inject({ url: "/api/ready" })).statusCode).toBe(503);
      const pub = await app.inject({ url: "/api/public/venues" });
      expect(pub.statusCode).toBe(503);
      expect(pub.json().error.code).toBe("unavailable");
      // The process keeps serving.
      expect((await app.inject({ url: "/api/health" })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe("authentication", () => {
  it("rejects missing and forged tokens", async () => {
    expect((await as(h).get("/me")).statusCode).toBe(401);
    expect((await as(h, { token: "not.a.jwt" }).get("/me")).statusCode).toBe(401);
  });

  it("non-vendors get vendor:null and 403 on vendor routes", async () => {
    const u = await makeUser(h);
    const me = await as(h, u).get("/me");
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { id: u.id }, vendor: null });
    const venues = await as(h, u).get("/me/venues");
    expect(venues.statusCode).toBe(403);
    expect(venues.json().error.code).toBe("not_a_vendor");
  });

  it("returns the vendor with numeric money/rating fields", async () => {
    const { user, vendor } = await makeVendor(h, "Sea View Halls");
    const me = (await as(h, user).get("/me")).json();
    expect(me.vendor).toMatchObject({ id: vendor.id, business_name: "Sea View Halls", rating_count: 0 });
    expect(typeof me.vendor.commission_rate).toBe("number");
  });

  it.runIf(flavor === "aws")("local auth: login, refresh rotation, reuse detection, logout", async () => {
    const u = await makeUser(h, "rotate@test.dev");
    const login = await as(h).post("/auth/login", { email: "ROTATE@test.dev", password: PASSWORD });
    expect(login.statusCode).toBe(200);
    const first = login.json();
    expect(first).toMatchObject({ token_type: "bearer", user: { id: u.id } });

    const r1 = await as(h).post("/auth/refresh", { refresh_token: first.refresh_token });
    expect(r1.statusCode).toBe(200);
    const second = r1.json();
    expect(second.refresh_token).not.toBe(first.refresh_token);

    // Replaying the rotated token revokes the whole family.
    expect((await as(h).post("/auth/refresh", { refresh_token: first.refresh_token })).statusCode).toBe(401);
    expect((await as(h).post("/auth/refresh", { refresh_token: second.refresh_token })).statusCode).toBe(401);

    const again = (await as(h).post("/auth/login", { email: u.email, password: PASSWORD })).json();
    expect((await as(h).post("/auth/logout", { refresh_token: again.refresh_token })).statusCode).toBe(204);
    expect((await as(h).post("/auth/refresh", { refresh_token: again.refresh_token })).statusCode).toBe(401);
  });

  it.runIf(flavor === "aws")("local auth: wrong passwords lock the account", async () => {
    const u = await makeUser(h, "lock@test.dev");
    for (let i = 0; i < 5; i++) {
      expect((await as(h).post("/auth/login", { email: u.email, password: "wrong" })).statusCode).toBe(401);
    }
    const locked = await as(h).post("/auth/login", { email: u.email, password: PASSWORD });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe("locked");
    // Unknown emails give the same answer as wrong passwords.
    const unknown = await as(h).post("/auth/login", { email: "ghost@test.dev", password: "x" });
    expect(unknown.statusCode).toBe(401);
  });

  it.runIf(flavor === "supabase")("supabase mode has no local auth routes", async () => {
    expect((await as(h).post("/auth/login", { email: "a@b.co", password: "x" })).statusCode).toBe(404);
  });

  it("VENDOR_ALLOWED_EMAILS gates vendor access", async () => {
    const gated = await harness({ VENDOR_ALLOWED_EMAILS: "someone-else@test.dev" });
    try {
      const { user } = await makeVendor(gated);
      expect((await as(gated, user).get("/me")).json().vendor).toBeNull();
      expect((await as(gated, user).get("/me/venues")).statusCode).toBe(403);
    } finally {
      await gated.close();
    }
  });
});

describe("profile", () => {
  it("updates editable fields only", async () => {
    const { user } = await makeVendor(h);
    const ok = await as(h, user).patch("/me/vendor", {
      tagline: "Rooftops and ballrooms",
      website: "https://example.com",
      socials: { instagram: "https://instagram.com/x" },
      years_experience: 7,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ tagline: "Rooftops and ballrooms", years_experience: 7 });

    for (const forbidden of [{ verification_status: "verified" }, { commission_rate: 0 }, { rating_avg: 5 }, { id: "x" }]) {
      const res = await as(h, user).patch("/me/vendor", forbidden);
      expect(res.statusCode, JSON.stringify(forbidden)).toBe(400);
    }
    expect((await as(h, user).patch("/me/vendor", { website: "javascript:alert(1)" })).statusCode).toBe(400);
    expect((await as(h, user).patch("/me/vendor", { years_experience: -1 })).statusCode).toBe(400);
  });

  it("presigns uploads with type/size limits", async () => {
    const { user, vendor } = await makeVendor(h);
    const res = await as(h, user).post("/me/uploads", { kind: "vendor-media", content_type: "image/png", size: 1000 });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.key).toMatch(new RegExp(`^${vendor.id}/[0-9a-f-]+\\.png$`));
    expect(body.uploadUrl).toContain("X-Amz-Signature");
    expect(body.publicUrl).toBe(`https://cdn.test/storage/v1/object/public/vendor-media/${body.key}`);

    expect((await as(h, user).post("/me/uploads", { kind: "vendor-media", content_type: "image/svg+xml", size: 10 })).statusCode).toBe(400);
    expect((await as(h, user).post("/me/uploads", { kind: "vendor-media", content_type: "image/png", size: 6 * 1024 * 1024 })).statusCode).toBe(400);
  });

  it("sets logo from own upload and cleans the old file", async () => {
    const { user, vendor } = await makeVendor(h);
    const a = await as(h, user).put("/me/vendor/image", { kind: "logo", key: `${vendor.id}/a.png` });
    expect(a.json().logo_url).toBe(`https://cdn.test/storage/v1/object/public/vendor-media/${vendor.id}/a.png`);
    await as(h, user).put("/me/vendor/image", { kind: "logo", key: `${vendor.id}/b.png` });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.removed).toContain(`${vendor.id}/a.png`);
    expect((await as(h, user).put("/me/vendor/image", { kind: "logo", key: "someone-else/x.png" })).statusCode).toBe(400);
  });
});
