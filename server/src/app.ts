import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";

import { createLocalAuth, type LocalAuth } from "./auth/local.js";
import { createSupabaseVerifier } from "./auth/supabase.js";
import { createDb, type Db } from "./db.js";
import { loadEnv, type Env } from "./env.js";
import { createMailer, type Mailer } from "./lib/email.js";
import { errorHandler, notFound } from "./lib/errors.js";
import { jsonReplacer } from "./lib/json.js";
import { createStorage, type Storage } from "./lib/storage.js";
import { createUserDirectory, type UserDirectory } from "./lib/users.js";
import "./plugins/context.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { publicRoutes } from "./routes/public.js";

declare module "fastify" {
  interface FastifyInstance {
    storage: Storage;
    mailer: Mailer;
    users: UserDirectory;
    localAuth: LocalAuth | null;
  }
}

export interface BuildOptions {
  env?: Env;
  db?: Db;
  /** Inject fakes in tests. */
  storage?: Storage;
  mailer?: Mailer;
}

const DEFAULT_ORIGINS = [
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "https://localhost", // Capacitor Android
  "capacitor://localhost", // Capacitor iOS
];

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const env = opts.env ?? loadEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "*.password",
          "*.refresh_token",
          "*.access_token",
        ],
        remove: true,
      },
      ...(env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : {}),
    },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
    keepAliveTimeout: 65_000,
    genReqId: () => crypto.randomUUID(),
    ajv: { customOptions: { removeAdditional: false } },
  });

  const db = opts.db ?? createDb(env);
  app.decorate("env", env);
  app.decorate("db", db);
  app.decorate("storage", opts.storage ?? createStorage(env));
  app.decorate("mailer", opts.mailer ?? createMailer(env, app.log));
  app.decorate("users", createUserDirectory(env, db));

  const localAuth = env.AUTH_PROVIDER === "local" ? createLocalAuth(env, db) : null;
  app.decorate("localAuth", localAuth);
  app.decorate("verifier", localAuth ? localAuth.verifier : createSupabaseVerifier(env));

  // BigInt (minor-unit money) and Decimal must never crash serialization.
  app.setReplySerializer((payload) => JSON.stringify(payload, jsonReplacer));
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request, reply) => errorHandler(notFound("No such endpoint."), request, reply));

  await app.register(helmet, {
    contentSecurityPolicy: false, // JSON API; the web app sets its own CSP
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  const allowed = new Set([...DEFAULT_ORIGINS, ...env.CORS_ORIGINS]);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 600,
  });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_PER_MINUTE,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      code: "rate_limited",
      error: "Too Many Requests",
      message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
    }),
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, { prefix: "/auth" });
      await api.register(publicRoutes, { prefix: "/public" });
      await api.register(meRoutes, { prefix: "/me" });
    },
    { prefix: "/api" },
  );

  app.addHook("onClose", async () => {
    if (!opts.db) await db.$disconnect();
  });

  return app;
}
