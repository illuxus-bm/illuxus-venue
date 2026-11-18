import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  /** Liveness: the process is up (no dependencies). */
  app.get("/health", { config: { rateLimit: false } }, async () => ({ ok: true }));

  /** Readiness: the database answers. Load balancers route only when ready. */
  app.get("/ready", { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await app.db.$queryRaw`select 1`;
      return { ok: true, db: "up", auth: app.env.AUTH_PROVIDER, storage: app.storage.enabled, email: app.mailer.enabled };
    } catch {
      return reply.status(503).send({ ok: false, db: "down" });
    }
  });
};
