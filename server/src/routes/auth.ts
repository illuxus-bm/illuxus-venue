import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { notFound } from "../lib/errors.js";
import { parse } from "../lib/validate.js";

const loginBody = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});
const refreshBody = z.object({ refresh_token: z.string().min(20).max(200) });

/** Only mounted behaviour when AUTH_PROVIDER=local; 404s otherwise. */
export const authRoutes: FastifyPluginAsync = async (app) => {
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  const auth = () => {
    if (!app.localAuth) throw notFound("Sign-in is handled by Supabase on this deployment.");
    return app.localAuth;
  };
  const meta = (req: { headers: Record<string, unknown>; ip: string }) => ({
    ua: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
    ip: req.ip,
  });

  app.post("/login", strict, async (req) => {
    const { email, password } = parse(loginBody, req.body);
    return auth().login(email, password, meta(req));
  });

  app.post("/refresh", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const { refresh_token } = parse(refreshBody, req.body);
    return auth().refresh(refresh_token, meta(req));
  });

  app.post("/logout", strict, async (req, reply) => {
    const { refresh_token } = parse(refreshBody, req.body);
    await auth().logout(refresh_token);
    return reply.status(204).send();
  });
};
