/**
 * Minimal, dependency-free error reporting.
 *
 * Errors are always logged to the console. If `VITE_ERROR_REPORT_URL` is set,
 * they're also POSTed (fire-and-forget, via `sendBeacon` when available) to
 * that endpoint, e.g. a Sentry tunnel, a Supabase Edge Function or any log
 * collector, so production failures on web and in the native apps are seen.
 *
 * No PII is attached beyond what's in the error message itself.
 */
type Context = Record<string, unknown>;

const ENDPOINT = import.meta.env.VITE_ERROR_REPORT_URL as string | undefined;
const RELEASE = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";

let recent = 0;
let windowStart = Date.now();

function rateLimited(): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    recent = 0;
  }
  recent += 1;
  return recent > 20;
}

export function reportError(error: unknown, context: Context = {}): void {
  console.error(error, context);
  if (!ENDPOINT || typeof window === "undefined" || rateLimited()) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const payload = JSON.stringify({
    message: err.message.slice(0, 2000),
    name: err.name,
    stack: err.stack?.slice(0, 8000),
    context,
    release: RELEASE,
    url: window.location.pathname,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
    } else {
      void fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // Reporting must never throw.
  }
}

/** Capture errors that escape React (async handlers, promise rejections). */
export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, { source: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { source: "unhandledrejection" });
  });
}
