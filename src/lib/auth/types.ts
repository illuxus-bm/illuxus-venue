/** The signed-in account, independent of which auth backend issued it. */
export interface AuthUser {
  id: string;
  email: string | null;
}

export type AuthProviderKind = "supabase" | "local";

/**
 * What the rest of the app needs from an auth backend. Implementations:
 * `supabase.ts` (supabase-js, auth only) and `local.ts` (the API's own
 * /api/auth endpoints).
 */
export interface AuthProvider {
  readonly kind: AuthProviderKind;
  /** Resolves once the persisted session (if any) has been restored. */
  ready(): Promise<void>;
  /** A currently valid access token, refreshing first if it is about to
   *  expire. Null when signed out. Never throws. */
  getAccessToken(): Promise<string | null>;
  /** Exchange the refresh token for a new access token. Concurrent calls
   *  share one in-flight attempt. True when a fresh token is available.
   *  Never throws. */
  refresh(): Promise<boolean>;
  signIn(email: string, password: string): Promise<{ error: Error | null }>;
  /** Drops the local session even if the server-side revoke fails. */
  signOut(): Promise<void>;
  /** The current user (valid after ready()). */
  getUser(): AuthUser | null;
  /** Called whenever the signed-in identity changes (sign in, sign out,
   *  another tab switching accounts). Not called for token refreshes. */
  onChange(cb: (user: AuthUser | null) => void): () => void;
}

export function sameUser(a: AuthUser | null, b: AuthUser | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.email === b.email;
}
