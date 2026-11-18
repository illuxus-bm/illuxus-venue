import type { Session } from "@supabase/supabase-js";

import { reportError } from "@/lib/monitoring";
import { sameUser, type AuthProvider, type AuthUser } from "./types";

type SupabaseClient = (typeof import("@/integrations/supabase/client"))["supabase"];

/**
 * Supabase-backed auth (VITE_AUTH_PROVIDER=supabase, the default).
 * supabase-js is used ONLY for auth here: sign-in, sign-out, session
 * persistence/refresh. All data goes through the REST API with the session's
 * access token as the bearer.
 *
 * The client is imported lazily so a `local` build never downloads
 * supabase-js.
 */
export function createSupabaseAuth(): AuthProvider {
  let user: AuthUser | null = null;
  const listeners = new Set<(u: AuthUser | null) => void>();
  let clientPromise: Promise<SupabaseClient> | null = null;
  let refreshing: Promise<boolean> | null = null;

  let resolveReady!: () => void;
  const readyPromise = new Promise<void>((r) => {
    resolveReady = r;
  });

  const setUser = (next: AuthUser | null) => {
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

  const toUser = (s: Session | null): AuthUser | null =>
    s?.user ? { id: s.user.id, email: s.user.email ?? null } : null;

  const client = (): Promise<SupabaseClient> => {
    if (!clientPromise) {
      clientPromise = import("@/integrations/supabase/client").then(({ supabase }) => {
        // INITIAL_SESSION carries the restored session. Never await supabase
        // calls inside this callback (auth lock deadlock).
        supabase.auth.onAuthStateChange((event, session) => {
          setUser(toUser(session));
          if (event === "INITIAL_SESSION") resolveReady();
        });
        return supabase;
      });
      clientPromise.catch((e) => {
        // Chunk failed to load (offline first visit): don't hang the app.
        reportError(e, { source: "auth.supabase.load" });
        clientPromise = null;
        resolveReady();
      });
    }
    return clientPromise;
  };

  return {
    kind: "supabase",

    ready() {
      void client().catch(() => undefined);
      return readyPromise;
    },

    async getAccessToken() {
      try {
        const sb = await client();
        await readyPromise;
        // getSession() refreshes an expired access token itself.
        const { data } = await sb.auth.getSession();
        return data.session?.access_token ?? null;
      } catch (e) {
        reportError(e, { source: "auth.supabase.getAccessToken" });
        return null;
      }
    },

    refresh() {
      if (!refreshing) {
        refreshing = (async () => {
          try {
            const sb = await client();
            const { data, error } = await sb.auth.refreshSession();
            return !error && !!data.session;
          } catch {
            return false;
          } finally {
            refreshing = null;
          }
        })();
      }
      return refreshing;
    },

    async signIn(email, password) {
      try {
        const sb = await client();
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return { error };
        // onAuthStateChange fires too, but make getUser() correct right away.
        setUser(toUser(data.session));
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },

    async signOut() {
      try {
        const sb = await client();
        const { error } = await sb.auth.signOut();
        if (error) {
          // Server-side revoke failed (offline, etc.). Still drop the local
          // session so the device is signed out and a reload can't restore it.
          reportError(error, { source: "signOut" });
          await sb.auth.signOut({ scope: "local" });
        }
      } catch (e) {
        reportError(e, { source: "signOut" });
      } finally {
        setUser(null);
      }
    },

    getUser() {
      return user;
    },

    onChange(cb) {
      listeners.add(cb);
      void client().catch(() => undefined);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
