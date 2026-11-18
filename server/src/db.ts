import { PrismaPg } from "@prisma/adapter-pg";

import type { Env } from "./env.js";
import { PrismaClient } from "./generated/prisma/client.js";

export type Db = PrismaClient;

/**
 * One PrismaClient per process, over node-postgres via the driver adapter.
 * Works with Supabase (direct or pooled) and AWS RDS / Aurora / RDS Proxy.
 */
export function createDb(env: Env): Db {
  const ssl =
    env.DATABASE_SSL === "disable"
      ? undefined
      : env.DATABASE_SSL === "require"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true, ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT } : {}) };

  // Transaction poolers (Supabase :6543 / PgBouncer / RDS Proxy) reject
  // `statement_timeout` as a startup parameter, so only send it on direct
  // connections. The client-side query_timeout below always applies.
  const pooled = /:6543\b|pgbouncer|pooler.*:6543|\.proxy-/i.test(env.DATABASE_URL);

  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    ssl,
    // Fail fast instead of hanging requests when the database is unreachable.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    ...(pooled ? {} : { statement_timeout: env.DB_STATEMENT_TIMEOUT_MS }),
    query_timeout: env.DB_STATEMENT_TIMEOUT_MS + 2_000,
    application_name: "illuxus-venues-api",
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}
