import { buildApp } from "./app.js";

/**
 * Long-running entry point (Docker / AWS ECS / App Runner / EC2 / Fly / Render).
 * Shuts down gracefully on SIGTERM so in-flight requests finish and DB
 * connections are released during deploys.
 */
async function main() {
  let app;
  try {
    app = await buildApp();
  } catch (err) {
    // Bad configuration: fail at boot with a clear message, not at runtime.
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const { HOST, PORT } = app.env;
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "shutting down");
    const force = setTimeout(() => process.exit(1), 25_000);
    force.unref();
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // A stray rejection is logged, not fatal: one bad request must not take the
  // whole API down. Truly unknown state (uncaught exception) restarts cleanly.
  process.on("unhandledRejection", (reason) => app.log.error({ err: reason }, "unhandled rejection"));
  process.on("uncaughtException", (err) => {
    app.log.fatal({ err }, "uncaught exception; restarting");
    void shutdown("uncaughtException");
  });

  await app.listen({ host: HOST, port: PORT });
}

void main();
