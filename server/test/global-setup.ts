import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import pg from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
    flavor: "aws" | "supabase";
  }
}

const root = resolve(import.meta.dirname, "../..");

/** Build a fresh test database of the requested flavor, once per run. */
export default async function setup(project: TestProject) {
  const flavor = process.env.TEST_DB_FLAVOR ?? "aws";
  const server = (process.env.TEST_PG_URL ?? "postgresql://postgres@127.0.0.1:5432").replace(/\/$/, "");
  const dbName = `illuxus_api_test_${flavor}`;
  const url = `${server}/${dbName}`;

  if (flavor === "supabase") {
    // Supabase stub + base schema + every SQL migration (RLS, triggers, 111).
    const u = new URL(server);
    execFileSync("bash", ["supabase/tests/run.sh", dbName], {
      cwd: root,
      stdio: "pipe",
      env: { ...process.env, PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: decodeURIComponent(u.username || "postgres"), PGPASSWORD: decodeURIComponent(u.password) },
    });
    // Production baselining: tables already exist, so mark 0_init applied.
    execFileSync("npx", ["prisma", "migrate", "resolve", "--applied", "0_init"], { cwd: root, stdio: "pipe", env: { ...process.env, DIRECT_URL: url } });
  } else {
    const admin = new pg.Client({ connectionString: `${server}/postgres` });
    await admin.connect();
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.query(`create database ${dbName}`);
    await admin.end();
  }
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: root, stdio: "pipe", env: { ...process.env, DIRECT_URL: url } });

  project.provide("dbUrl", url);
  project.provide("flavor", flavor as "aws" | "supabase");
}
