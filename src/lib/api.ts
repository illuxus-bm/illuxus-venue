import { auth } from "@/lib/auth";
import { ApiError, rawRequest, type QueryValue } from "@/lib/http";
import { reportError } from "@/lib/monitoring";

/**
 * Typed fetch client for the Illuxus Venues REST API (docs/API.md).
 *
 * - Base URL: VITE_API_URL, else same-origin `/api`.
 * - Attaches `Authorization: Bearer <token>` from the auth layer.
 * - 20s timeout; offline / timeout → ApiError status 0, code "network".
 * - 401 → ask the auth layer to refresh once and retry once; still 401
 *   (or the refresh fails) → sign the user out.
 * - 204 / empty body → undefined.
 * - Every helper rejects ONLY with ApiError.
 */

export {
  API_BASE_URL,
  ApiError,
  isApiError,
  NETWORK_ERROR_MESSAGE,
} from "@/lib/http";

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** false → don't send the bearer token (public endpoints). Default true. */
  auth?: boolean;
}

async function tokenOrNull(): Promise<string | null> {
  try {
    return await auth.getAccessToken();
  } catch {
    return null;
  }
}

async function signOutAfterAuthFailure(): Promise<void> {
  try {
    await auth.signOut();
  } catch (e) {
    reportError(e, { source: "api.signOut" });
  }
}

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError(
    0,
    "unknown",
    e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.",
  );
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const useAuth = opts.auth !== false;
  const send = (token: string | null) =>
    rawRequest<T>(method, path, {
      body,
      query: opts.query,
      signal: opts.signal,
      headers: opts.headers,
      token,
    });

  try {
    const token = useAuth ? await tokenOrNull() : null;
    try {
      return await send(token);
    } catch (e) {
      const err = toApiError(e);
      // Only a request that carried a session can be rescued by a refresh.
      if (err.status !== 401 || !useAuth || !token) throw err;

      const refreshed = await auth.refresh().catch(() => false);
      const nextToken = refreshed ? await tokenOrNull() : null;
      if (!nextToken) {
        await signOutAfterAuthFailure();
        throw err;
      }
      try {
        return await send(nextToken);
      } catch (e2) {
        const err2 = toApiError(e2);
        if (err2.status === 401) await signOutAfterAuthFailure();
        throw err2;
      }
    }
  } catch (e) {
    throw toApiError(e);
  }
}

export function get<T>(path: string, opts?: RequestOptions): Promise<T> {
  return request<T>("GET", path, undefined, opts);
}

export function post<T = void>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>("POST", path, body, opts);
}

export function patch<T = void>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>("PATCH", path, body, opts);
}

export function put<T = void>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>("PUT", path, body, opts);
}

export function del<T = void>(path: string, opts?: RequestOptions): Promise<T> {
  return request<T>("DELETE", path, undefined, opts);
}

/** Path segment encoder for ids in URLs. */
export function seg(id: string): string {
  return encodeURIComponent(id);
}
