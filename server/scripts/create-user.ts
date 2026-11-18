/**
 * Invite a portal user when AUTH_PROVIDER=local (self-hosted auth, e.g. AWS).
 *
 *   npm run user:create -- --email owner@venue.com --business "Sea View Halls"
 *   npm run user:create -- --email staff@venue.com --join <vendor-id> --role staff
 *
 * The password is read from USER_PASSWORD, or generated and printed once.
 * Also adds the email to vendor_email_allowlist and creates the membership.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import "dotenv/config";

import { hashPassword } from "../src/auth/local.js";
import { createDb } from "../src/db.js";
import { loadEnv } from "../src/env.js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    business: { type: "string" },
    join: { type: "string" },
    role: { type: "string", default: "owner" },
  },
});

async function main() {
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("--email is required");
  if (!values.business && !values.join) throw new Error("Pass --business <name> (new business) or --join <vendor-id>");
  if (!["owner", "manager", "staff"].includes(values.role!)) throw new Error("--role must be owner, manager or staff");

  const env = loadEnv({ ...process.env, AUTH_PROVIDER: "local", JWT_SECRET: process.env.JWT_SECRET ?? "x".repeat(32) });
  const db = createDb(env);
  const generated = !process.env.USER_PASSWORD;
  const password = process.env.USER_PASSWORD ?? randomBytes(12).toString("base64url");
  if (password.length < 10) throw new Error("USER_PASSWORD must be at least 10 characters");

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.vendor_email_allowlist.upsert({ where: { email }, create: { email, notes: "user:create" }, update: {} });
      const user = await tx.app_users.upsert({
        where: { email },
        create: { email, password_hash: await hashPassword(password), display_name: values.name ?? null, email_verified_at: new Date() },
        update: { password_hash: await hashPassword(password), disabled_at: null, failed_logins: 0, locked_until: null },
      });
      const vendorId =
        values.join ?? (await tx.vendors.create({ data: { business_name: values.business! }, select: { id: true } })).id;
      await tx.vendor_members.upsert({
        where: { user_id: user.id },
        create: { user_id: user.id, vendor_id: vendorId, role: values.role! },
        update: { vendor_id: vendorId, role: values.role! },
      });
      return { userId: user.id, vendorId };
    });
    console.log(`User ${email} (${result.userId}) can sign in to vendor ${result.vendorId}.`);
    if (generated) console.log(`Temporary password (shown once): ${password}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
