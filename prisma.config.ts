import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (migrate / db pull / studio).
 *
 * The CLI needs a DIRECT (non-pooled) connection: migrations take advisory
 * locks and run DDL that transaction poolers (Supabase's port 6543 /
 * PgBouncer, RDS Proxy) don't support. The running API uses DATABASE_URL
 * through the pg driver adapter instead (see server/src/db.ts).
 *
 *   Supabase: DIRECT_URL = postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres
 *   AWS RDS:  DIRECT_URL = postgresql://<user>:<pw>@<instance>.<region>.rds.amazonaws.com:5432/<db>?sslmode=require
 */
export default defineConfig({
  schema: "server/prisma/schema.prisma",
  migrations: {
    path: "server/prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
