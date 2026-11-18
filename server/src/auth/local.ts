import { createHash, randomBytes, randomUUID } from "node:crypto";

import { hash, verify as verifyHash } from "@node-rs/argon2";
import { jwtVerify, SignJWT } from "jose";

import type { Db } from "../db.js";
import type { Env } from "../env.js";
import { HttpError, unauthorized } from "../lib/errors.js";
import type { AuthUser, TokenVerifier } from "./types.js";

const ISSUER = "illuxus-venues";
const AUDIENCE = "illuxus-venues";
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations).
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, ARGON);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface TokenPair {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  refresh_token: string;
  user: AuthUser;
}

/**
 * Self-hosted auth for deployments without Supabase (e.g. AWS): argon2id
 * passwords, short-lived HS256 access JWTs, and rotating refresh tokens
 * stored only as hashes. Reusing an already-rotated refresh token is treated
 * as theft and revokes that whole session family.
 */
export function createLocalAuth(env: Env, db: Db) {
  const key = new TextEncoder().encode(env.JWT_SECRET);
  const ttl = env.ACCESS_TOKEN_TTL_SECONDS;
  // Spend the same time on unknown emails as on real ones (no user enumeration).
  const dummyHash = hashPassword(randomBytes(16).toString("hex"));

  async function issue(user: AuthUser, familyId: string, meta: { ua?: string; ip?: string }): Promise<TokenPair> {
    const access = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(user.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(key);
    const refresh = randomBytes(32).toString("base64url");
    await db.auth_sessions.create({
      data: {
        user_id: user.id,
        family_id: familyId,
        token_hash: sha256(refresh),
        user_agent: meta.ua?.slice(0, 300) ?? null,
        ip: meta.ip ?? null,
        expires_at: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      },
    });
    return { access_token: access, token_type: "bearer", expires_in: ttl, refresh_token: refresh, user };
  }

  const verifier: TokenVerifier = {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
        if (!payload.sub) return null;
        return { id: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
      } catch {
        return null;
      }
    },
  };

  async function login(emailRaw: string, password: string, meta: { ua?: string; ip?: string }): Promise<TokenPair> {
    const email = emailRaw.trim().toLowerCase();
    const user = await db.app_users.findUnique({ where: { email } });
    if (!user || user.disabled_at) {
      await verifyHash(await dummyHash, password).catch(() => false);
      throw unauthorized("Incorrect email or password.");
    }
    if (user.locked_until && user.locked_until > new Date()) {
      throw new HttpError(429, "Too many failed attempts. Try again in a few minutes.", "locked");
    }
    const ok = await verifyHash(user.password_hash, password).catch(() => false);
    if (!ok) {
      const failed = user.failed_logins + 1;
      await db.app_users.update({
        where: { id: user.id },
        data: {
          failed_logins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          locked_until: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw unauthorized("Incorrect email or password.");
    }
    await db.app_users.update({
      where: { id: user.id },
      data: { failed_logins: 0, locked_until: null, last_login_at: new Date() },
    });
    return issue({ id: user.id, email: user.email }, randomUUID(), meta);
  }

  async function refresh(token: string, meta: { ua?: string; ip?: string }): Promise<TokenPair> {
    const session = await db.auth_sessions.findUnique({
      where: { token_hash: sha256(token) },
      include: { app_users: true },
    });
    if (!session) throw unauthorized("Your session has ended. Please sign in again.");

    if (session.revoked_at) {
      // A rotated token came back: assume it was stolen; end the family.
      await db.auth_sessions.updateMany({
        where: { family_id: session.family_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      throw unauthorized("Your session has ended. Please sign in again.");
    }
    if (session.expires_at < new Date() || session.app_users.disabled_at) {
      throw unauthorized("Your session has ended. Please sign in again.");
    }

    // Rotate atomically: only one concurrent refresh can win the revoke.
    const revoked = await db.auth_sessions.updateMany({
      where: { id: session.id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    if (revoked.count === 0) throw unauthorized("Your session has ended. Please sign in again.");

    return issue({ id: session.app_users.id, email: session.app_users.email }, session.family_id, meta);
  }

  async function logout(token: string): Promise<void> {
    const session = await db.auth_sessions.findUnique({ where: { token_hash: sha256(token) } });
    if (!session) return;
    await db.auth_sessions.updateMany({
      where: { family_id: session.family_id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  return { verifier, login, refresh, logout };
}

export type LocalAuth = ReturnType<typeof createLocalAuth>;
