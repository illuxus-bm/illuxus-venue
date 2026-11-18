import { z } from "zod";

/**
 * Every setting the API reads, validated once at boot. A misconfigured
 * deployment fails immediately with a readable list of problems instead of
 * crashing later on the first request that touches the missing value.
 */
const bool = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .transform((v) => v === "true" || v === "1" || v === "yes");

const list = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().positive().default(8787),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    TRUST_PROXY: bool.default(true),

    // ── Database ────────────────────────────────────────────────────────
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    // TLS to Postgres. Keep `sslmode` OUT of DATABASE_URL and set this instead.
    // "require": encrypted, server cert not verified (Supabase pooler default)
    // "verify-full": encrypted + verified (RDS with DATABASE_CA_CERT)
    DATABASE_SSL: z.enum(["disable", "require", "verify-full"]).default("disable"),
    DATABASE_CA_CERT: z.string().optional(),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15_000),

    // ── Auth ────────────────────────────────────────────────────────────
    AUTH_PROVIDER: z.enum(["supabase", "local"]).default("supabase"),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_JWT_SECRET: z.string().min(16).optional(),
    SUPABASE_JWT_AUDIENCE: z.string().default("authenticated"),
    JWT_SECRET: z.string().min(32).optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    // Optional extra gate on top of the vendor_email_allowlist table.
    VENDOR_ALLOWED_EMAILS: list,

    // ── HTTP ────────────────────────────────────────────────────────────
    // Browser origins allowed to call the API. Capacitor apps use
    // https://localhost (Android) and capacitor://localhost (iOS).
    CORS_ORIGINS: list,
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).default(300),

    // ── Object storage (S3 API: AWS S3, or Supabase Storage's S3 endpoint) ─
    STORAGE_ENDPOINT: z.string().url().optional(),
    STORAGE_REGION: z.string().default("us-east-1"),
    STORAGE_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
    STORAGE_FORCE_PATH_STYLE: bool.default(false),
    // Public base for objects, without trailing slash. URL = <base>/<bucket>/<key>
    //   Supabase: https://<ref>.supabase.co/storage/v1/object/public
    //   AWS:      https://<cloudfront-domain>  (or https://s3.<region>.amazonaws.com)
    STORAGE_PUBLIC_BASE_URL: z.string().url().optional(),
    BUCKET_VENUE_MEDIA: z.string().default("venue-media"),
    BUCKET_VENDOR_MEDIA: z.string().default("vendor-media"),

    // ── Email (any SMTP: AWS SES, Postmark, Resend, ...) ────────────────
    SMTP_URL: z.string().optional(),
    EMAIL_FROM: z.string().default("Illuxus Venues <no-reply@illuxus.com>"),
    ILLUXUS_ORIGIN: z.string().url().default("https://illuxus.com"),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_PROVIDER === "supabase" && !env.SUPABASE_JWT_SECRET && !env.SUPABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_URL"],
        message: "AUTH_PROVIDER=supabase needs SUPABASE_URL (JWKS) or SUPABASE_JWT_SECRET",
      });
    }
    if (env.AUTH_PROVIDER === "local" && !env.JWT_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "AUTH_PROVIDER=local needs JWT_SECRET (32+ random characters)",
      });
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid API configuration:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

export function storageConfigured(env: Env): boolean {
  return Boolean(env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY && env.STORAGE_PUBLIC_BASE_URL);
}
