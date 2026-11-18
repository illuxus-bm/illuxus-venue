import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import type { Env } from "../env.js";
import type { AuthUser, TokenVerifier } from "./types.js";

/**
 * Accepts access tokens issued by Supabase Auth, so the web and native apps
 * keep signing in with supabase-js while every data call goes through this
 * API. Asymmetric JWT signing keys are verified against the project's JWKS
 * (cached, rotated automatically); legacy HS256 projects use the JWT secret.
 */
export function createSupabaseVerifier(env: Env): TokenVerifier {
  const audience = env.SUPABASE_JWT_AUDIENCE;
  const secret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;
  const jwks = env.SUPABASE_URL
    ? createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL), {
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
        timeoutDuration: 5_000,
      })
    : null;
  const issuer = env.SUPABASE_URL ? new URL("/auth/v1", env.SUPABASE_URL).toString() : undefined;

  const toUser = (payload: JWTPayload): AuthUser | null => {
    if (!payload.sub || payload.role === "anon") return null;
    return { id: payload.sub, email: typeof payload.email === "string" ? payload.email.toLowerCase() : null };
  };

  return {
    async verify(token) {
      try {
        // HS256 projects: verify with the shared secret.
        if (secret) {
          try {
            const { payload } = await jwtVerify(token, secret, { audience, algorithms: ["HS256"] });
            return toUser(payload);
          } catch (err) {
            if (!jwks) throw err;
          }
        }
        if (jwks) {
          const { payload } = await jwtVerify(token, jwks, {
            audience,
            ...(issuer ? { issuer } : {}),
            algorithms: ["ES256", "RS256", "EdDSA"],
          });
          return toUser(payload);
        }
        return null;
      } catch {
        return null;
      }
    },
  };
}
