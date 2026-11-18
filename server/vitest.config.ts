import { defineConfig } from "vitest/config";

/**
 * API integration tests against a real Postgres. TEST_DB_FLAVOR picks the
 * database shape:
 *   aws      (default) fresh DB built only by `prisma migrate deploy`,
 *            AUTH_PROVIDER=local
 *   supabase the Supabase-shaped DB (supabase/migrations 100-111 incl. RLS
 *            and triggers) baselined for Prisma, AUTH_PROVIDER=supabase
 * Connection: TEST_PG_URL (server URL without database), default
 * postgresql://postgres@127.0.0.1:5432
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["server/test/**/*.test.ts"],
    globalSetup: ["server/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
