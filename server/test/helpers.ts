import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { inject } from "vitest";

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/local.js";
import { createDb, type Db } from "../src/db.js";
import { loadEnv, type Env } from "../src/env.js";
import type { Mail, Mailer } from "../src/lib/email.js";
import { createStorage, type Storage } from "../src/lib/storage.js";

export const flavor = inject("flavor");
const SUPABASE_SECRET = "test-supabase-jwt-secret-0123456789";
const LOCAL_SECRET = "test-local-jwt-secret-0123456789abcdef";
export const PASSWORD = "correct horse battery";

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: inject("dbUrl"),
    DB_POOL_MAX: "5",
    AUTH_PROVIDER: flavor === "supabase" ? "supabase" : "local",
    SUPABASE_JWT_SECRET: SUPABASE_SECRET,
    JWT_SECRET: LOCAL_SECRET,
    STORAGE_ACCESS_KEY_ID: "test",
    STORAGE_SECRET_ACCESS_KEY: "test",
    STORAGE_ENDPOINT: "http://127.0.0.1:9",
    STORAGE_FORCE_PATH_STYLE: "true",
    STORAGE_PUBLIC_BASE_URL: "https://cdn.test/storage/v1/object/public",
    RATE_LIMIT_PER_MINUTE: "10000",
    ...overrides,
  });
}

export interface Harness {
  app: FastifyInstance;
  db: Db;
  sent: Mail[];
  removed: string[];
  close: () => Promise<void>;
}

/** Real app + real DB; storage deletes and email are recorded, not sent. */
export async function harness(envOverrides: Record<string, string> = {}): Promise<Harness> {
  const env = testEnv(envOverrides);
  const db = createDb(env);
  const sent: Mail[] = [];
  const removed: string[] = [];
  const real = createStorage(env);
  const storage: Storage = {
    ...real,
    remove: async (_kind, key) => {
      if (key) removed.push(key);
    },
  };
  const mailer: Mailer = {
    enabled: true,
    send: async (m) => {
      sent.push(m);
      return true;
    },
  };
  const app = await buildApp({ env, db, storage, mailer });
  await app.ready();
  return {
    app,
    db,
    sent,
    removed,
    close: async () => {
      await app.close();
      await db.$disconnect();
    },
  };
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

/** Create a user the active auth provider recognises, and an access token. */
export async function makeUser(h: Harness, email = `u-${randomUUID().slice(0, 8)}@test.dev`): Promise<TestUser> {
  email = email.toLowerCase();
  if (flavor === "supabase") {
    const id = randomUUID();
    await h.db.$executeRaw`insert into auth.users (id, email, email_confirmed_at) values (${id}::uuid, ${email}, now())`;
    const token = await new SignJWT({ email, role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(id)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SUPABASE_SECRET));
    return { id, email, token };
  }
  const user = await h.db.app_users.create({ data: { email, password_hash: await hashPassword(PASSWORD) } });
  // Same claims the API issues on login (login itself is rate-limited, and
  // covered by its own tests).
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer("illuxus-venues")
    .setAudience("illuxus-venues")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(LOCAL_SECRET));
  return { id: user.id, email, token };
}

/** A user who owns a vendor business. */
export async function makeVendor(h: Harness, name = "Test Venues") {
  const user = await makeUser(h);
  await h.db.vendor_email_allowlist.upsert({ where: { email: user.email }, create: { email: user.email }, update: {} });
  const vendor = await h.db.vendors.create({ data: { business_name: name, default_currency: "INR" } });
  await h.db.vendor_members.create({ data: { vendor_id: vendor.id, user_id: user.id, role: "owner" } });
  return { user, vendor };
}

/** An organizer with an org + event, for inbox / booking fixtures. */
export async function makeOrganizer(h: Harness) {
  const user = await makeUser(h);
  const tag = randomUUID().slice(0, 8);
  const org = await h.db.organizations.create({ data: { name: "Acme Events", slug: `acme-${tag}`, owner_id: user.id } });
  const event = await h.db.events.create({
    data: {
      title: "Launch Night",
      slug: `launch-${tag}`,
      org_id: org.id,
      user_id: user.id,
      location: "Mumbai",
      date: new Date("2027-02-10T12:00:00Z"),
      event_format: "physical",
    },
  });
  await h.db.profiles.create({ data: { user_id: user.id, display_name: "Priya Planner", mobile_country_code: "+91", mobile_number: "9800000000" } });
  return { user, org, event };
}

/** Request helper bound to a token. */
export function as(h: Harness, user?: { token: string }) {
  const call = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: unknown) =>
    h.app.inject({
      method,
      url: `/api${url}`,
      ...(payload !== undefined ? { payload: payload as object } : {}),
      headers: user ? { authorization: `Bearer ${user.token}` } : {},
    });
  return {
    get: (u: string) => call("GET", u),
    post: (u: string, p?: unknown) => call("POST", u, p ?? {}),
    patch: (u: string, p: unknown) => call("PATCH", u, p),
    put: (u: string, p: unknown) => call("PUT", u, p),
    del: (u: string) => call("DELETE", u),
  };
}
