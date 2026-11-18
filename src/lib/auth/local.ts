import { ApiError, rawRequest } from "@/lib/http";
import { reportError } from "@/lib/monitoring";
import { sameUser, type AuthProvider, type AuthUser } from "./types";

/**
 * Local auth (VITE_AUTH_PROVIDER=local): the API's own
 * POST /api/auth/login | refresh | logout, which return a TokenPair.
 *
 * - The session lives in localStorage under STORAGE_KEY (memory-only when
 *   storage is blocked, e.g. some private modes).
 * - The access token is refreshed ~60s before it expires, and on demand by
 *   getAccessToken() if a timer was throttled in a background tab.
 * - Refresh tokens rotate (the old one is revoked), so concurrent refreshes
 *   are deduped within a tab (one in-flight promise) and across tabs (Web
 *   Locks when available, plus re-reading storage to adopt a token another
 *   tab already rotated).
 * - Other tabs signing in / out / refreshing are picked up via `storage`.
 */

export const STORAGE_KEY = "illuxus-venues.session";
const LOCK_NAME = "illuxus-venues.auth-refresh";
/** Refresh this long before the access token expires. */
export const REFRESH_MARGIN_MS = 60_000;
/** After a refresh that failed for a transient reason (offline, 5xx). */
const RETRY_AFTER_FAILURE_MS = 30_000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export interface TokenPair {
  access_token: string;
  token_type: "bearer";
  /** Seconds. */
  expires_in: number;
  refresh_token: string;
  user: { id: string; email: string | null };
}

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  /** Epoch milliseconds, computed from the local clock at receipt. */
  expires_at: number;
  user: AuthUser;
}

export interface LocalAuthOptions {
  storage?: Storage | null;
  now?: () => number;
  /** Max random head-start (ms) for the proactive refresh, so several tabs
   *  don't all fire at the same instant. */
  jitterMs?: number;
}

function defaultStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function parseStored(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredSession> | null;
    if (
      v &&
      typeof v.access_token === "string" &&
      typeof v.refresh_token === "string" &&
      typeof v.expires_at === "number" &&
      v.user &&
      typeof v.user.id === "string"
    ) {
      return {
        access_token: v.access_token,
        refresh_token: v.refresh_token,
        expires_at: v.expires_at,
        user: { id: v.user.id, email: v.user.email ?? null },
      };
    }
  } catch {
    // Corrupt entry: treat as signed out.
  }
  return null;
}

export function createLocalAuth(opts: LocalAuthOptions = {}): AuthProvider {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? (() => Date.now());
  const jitterMs = opts.jitterMs ?? 5_000;

  const readStored = (): StoredSession | null => {
    try {
      return parseStored(storage?.getItem(STORAGE_KEY) ?? null);
    } catch {
      return null;
    }
  };
  const writeStored = (s: StoredSession | null) => {
    try {
      if (s) storage?.setItem(STORAGE_KEY, JSON.stringify(s));
      else storage?.removeItem(STORAGE_KEY);
    } catch {
      // Quota / blocked storage: the session stays in memory for this tab.
    }
  };

  let session: StoredSession | null = readStored();
  let user: AuthUser | null = session?.user ?? null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<boolean> | null = null;
  const listeners = new Set<(u: AuthUser | null) => void>();

  const emitIfChanged = (next: AuthUser | null) => {
    if (sameUser(user, next)) return;
    user = next;
    for (const cb of Array.from(listeners)) {
      try {
        cb(next);
      } catch (e) {
        reportError(e, { source: "auth.onChange" });
      }
    }
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const scheduleIn = (ms: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void refresh();
    }, Math.min(Math.max(0, ms), MAX_TIMEOUT_MS));
  };

  const schedule = () => {
    if (!session) {
      clearTimer();
      return;
    }
    const jitter = Math.random() * jitterMs;
    scheduleIn(session.expires_at - REFRESH_MARGIN_MS - now() - jitter);
  };

  const setSession = (next: StoredSession | null, persist = true) => {
    session = next;
    if (persist) writeStored(next);
    schedule();
    emitIfChanged(next?.user ?? null);
  };

  const fromPair = (pair: TokenPair): StoredSession => ({
    access_token: pair.access_token,
    refresh_token: pair.refresh_token,
    expires_at: now() + (Number(pair.expires_in) > 0 ? Number(pair.expires_in) : 900) * 1000,
    user: { id: pair.user.id, email: pair.user.email ?? null },
  });

  const isFresh = (s: StoredSession) => s.expires_at - REFRESH_MARGIN_MS > now();

  const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const locks = (typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined);
    if (locks?.request) {
      try {
        return (await locks.request(LOCK_NAME, fn)) as T;
      } catch {
        // Lock manager unavailable (e.g. opaque origin): run unlocked.
      }
    }
    return fn();
  };

  const doRefresh = async (): Promise<boolean> => {
    // Another tab may have rotated the token while we waited for the lock.
    const stored = readStored();
    if (stored && session && stored.refresh_token !== session.refresh_token) {
      setSession(stored, false);
      if (isFresh(stored)) return true;
    }
    const rt = session?.refresh_token;
    if (!rt) return false;
    try {
      const pair = await rawRequest<TokenPair>("POST", "/auth/refresh", {
        body: { refresh_token: rt },
      });
      // Signed out (or switched account) while the request was in flight.
      if (session?.refresh_token !== rt) return !!session;
      setSession(fromPair(pair));
      return true;
    } catch (e) {
      const rejected =
        e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429;
      if (rejected) {
        // Without Web Locks two tabs can race; if the other one won, its
        // rotated token is already in storage.
        const latest = readStored();
        if (latest && latest.refresh_token !== rt) {
          setSession(latest, false);
          return true;
        }
        if (session?.refresh_token === rt) setSession(null);
        return false;
      }
      // Offline / 5xx / rate limited: keep the session and try again later.
      if (session) scheduleIn(RETRY_AFTER_FAILURE_MS);
      return false;
    }
  };

  function refresh(): Promise<boolean> {
    if (!inflight) {
      inflight = withLock(doRefresh)
        .catch(() => false)
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      // key === null means storage.clear().
      if (e.key !== null && e.key !== STORAGE_KEY) return;
      if (e.storageArea && storage && e.storageArea !== storage) return;
      session = readStored();
      schedule();
      emitIfChanged(session?.user ?? null);
    });
  }

  schedule();

  return {
    kind: "local",

    ready() {
      return Promise.resolve();
    },

    async getAccessToken() {
      if (!session) return null;
      if (!isFresh(session)) await refresh();
      return session?.access_token ?? null;
    },

    refresh,

    async signIn(email, password) {
      try {
        const pair = await rawRequest<TokenPair>("POST", "/auth/login", {
          body: { email, password },
        });
        setSession(fromPair(pair));
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },

    async signOut() {
      const rt = session?.refresh_token;
      setSession(null);
      if (!rt) return;
      try {
        await rawRequest<void>("POST", "/auth/logout", { body: { refresh_token: rt } });
      } catch {
        // Best effort: the local session is already gone and the refresh
        // token expires on its own.
      }
    },

    getUser() {
      return user;
    },

    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
