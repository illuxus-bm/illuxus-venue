/**
 * Low-level HTTP plumbing shared by the API client (`@/lib/api`) and the
 * local auth adapter (`@/lib/auth/local`). It knows nothing about sessions:
 * callers pass the bearer token explicitly. That split keeps the import graph
 * acyclic (api → auth → http, api → http).
 */

/** Base URL of the REST API, without a trailing slash. Same-origin `/api` on
 *  the web; native builds set an absolute `VITE_API_URL`. */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

export const REQUEST_TIMEOUT_MS = 20_000;

export const NETWORK_ERROR_MESSAGE = "You're offline or the server can't be reached.";

/** Every failure from the API helpers is one of these. `status` 0 means the
 *  request never got an HTTP response (offline, DNS, CORS, timeout). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** No HTTP response at all (network down, timeout, CORS). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RawRequestOptions {
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Bearer token; omitted → no Authorization header. */
  token?: string | null;
  headers?: Record<string, string>;
  /** Caller cancellation (TanStack Query passes one to every queryFn). */
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  let url = `${API_BASE_URL}${p}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `${url.includes("?") ? "&" : "?"}${s}`;
  }
  return url;
}

const FALLBACK_CODE: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "payload_too_large",
  422: "bad_request",
  429: "rate_limited",
  503: "unavailable",
};

function fallbackMessage(status: number): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You don't have access to this.";
  if (status === 404) return "Not found.";
  if (status === 409) return "That conflicts with the current state. Refresh and try again.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "The server had a problem. Please try again.";
  return `Request failed (HTTP ${status}).`;
}

/** Turn a non-2xx response into an ApiError, using the documented envelope
 *  `{ error: { code, message, details, requestId } }` when present. */
export async function errorFromResponse(res: Response): Promise<ApiError> {
  const headerRequestId = res.headers.get("x-request-id") ?? undefined;
  let text = "";
  try {
    text = await res.text();
  } catch {
    // Body unreadable: fall through to the status-based fallback.
  }
  let envelope: unknown = null;
  if (text) {
    try {
      envelope = JSON.parse(text);
    } catch {
      envelope = null;
    }
  }
  const err =
    envelope && typeof envelope === "object" && "error" in envelope
      ? ((envelope as { error: unknown }).error as Record<string, unknown> | null)
      : null;
  const code =
    err && typeof err.code === "string" && err.code
      ? err.code
      : (FALLBACK_CODE[res.status] ?? (res.status >= 500 ? "server_error" : "error"));
  const message =
    err && typeof err.message === "string" && err.message
      ? err.message
      : fallbackMessage(res.status);
  const requestId =
    err && typeof err.requestId === "string" ? err.requestId : headerRequestId;
  return new ApiError(res.status, code, message, err?.details, requestId);
}

/**
 * One HTTP round-trip to the API. Resolves with the parsed JSON body
 * (`undefined` for 204 / empty bodies) and rejects ONLY with ApiError.
 */
export async function rawRequest<T>(
  method: string,
  path: string,
  opts: RawRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);

  const onCallerAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  try {
    let res: Response;
    try {
      res = await fetch(buildUrl(path, opts.query), {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch {
      if (opts.signal?.aborted && !timedOut) {
        throw new ApiError(0, "aborted", "The request was cancelled.");
      }
      throw new ApiError(0, "network", NETWORK_ERROR_MESSAGE);
    }

    if (!res.ok) throw await errorFromResponse(res);
    if (res.status === 204) return undefined as T;

    let text: string;
    try {
      text = await res.text();
    } catch {
      // Connection dropped (or timed out) mid-body.
      throw new ApiError(0, "network", NETWORK_ERROR_MESSAGE);
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(
        res.status,
        "bad_response",
        "Unexpected response from the server.",
        undefined,
        res.headers.get("x-request-id") ?? undefined,
      );
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, "network", NETWORK_ERROR_MESSAGE);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}
