import type { IncomingMessage, ServerResponse } from "node:http";

import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";

/**
 * Serverless adapter (Vercel Functions). The app is built once per warm
 * instance and reused. Point DATABASE_URL at a pooler (Supabase :6543, or RDS
 * Proxy) and keep DB_POOL_MAX small (1-3).
 */
let ready: Promise<FastifyInstance> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    ready ??= buildApp().then(async (app) => {
      await app.ready();
      return app;
    });
    const app = await ready;
    app.server.emit("request", req, res);
  } catch (err) {
    ready = null; // retry the build on the next request
    console.error(err);
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { code: "unavailable", message: "The service is starting up. Please try again." } }));
  }
}
