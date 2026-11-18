import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthUser, TokenVerifier } from "../auth/types.js";
import type { Db } from "../db.js";
import type { Env } from "../env.js";
import { forbidden, HttpError, unauthorized } from "../lib/errors.js";

export interface VendorScope {
  vendorId: string;
  role: "owner" | "manager" | "staff";
}

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    env: Env;
    verifier: TokenVerifier;
  }
  interface FastifyRequest {
    user?: AuthUser;
    vendor?: VendorScope;
  }
}

function bearer(request: FastifyRequest): string | null {
  const h = request.headers.authorization;
  if (!h) return null;
  const [scheme, token] = h.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/** preHandler: a valid access token is required. */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  const token = bearer(request);
  if (!token) throw unauthorized();
  const user = await request.server.verifier.verify(token);
  if (!user) throw unauthorized("Your session has expired. Please sign in again.");
  request.user = user;
}

/**
 * preHandler: the caller must belong to a vendor business; every /me route
 * is then scoped to that vendor. This is the API-side equivalent of the RLS
 * policies (is_vendor_member) the browser used to rely on.
 */
export async function requireVendor(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) await authenticate(request, reply);
  const user = request.user!;
  const { env, db } = request.server;

  if (env.VENDOR_ALLOWED_EMAILS.length > 0) {
    const email = user.email?.toLowerCase();
    if (!email || !env.VENDOR_ALLOWED_EMAILS.includes(email)) {
      throw forbidden("This account isn't authorized for the vendor portal.");
    }
  }

  const member = await db.vendor_members.findFirst({
    where: { user_id: user.id },
    select: { vendor_id: true, role: true },
    orderBy: { created_at: "asc" },
  });
  if (!member) throw new HttpError(403, "This account isn't registered as a vendor.", "not_a_vendor");
  request.vendor = { vendorId: member.vendor_id, role: member.role as VendorScope["role"] };
}

/** Helpers for handlers that ran requireVendor. */
export const vendorId = (request: FastifyRequest) => request.vendor!.vendorId;
