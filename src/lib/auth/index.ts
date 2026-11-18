import { createLocalAuth } from "./local";
import { createSupabaseAuth } from "./supabase";
import type { AuthProvider, AuthProviderKind } from "./types";

export type { AuthProvider, AuthProviderKind, AuthUser } from "./types";

/** Which auth backend this build talks to (VITE_AUTH_PROVIDER). Must match
 *  the API's AUTH_PROVIDER. */
export const AUTH_PROVIDER: AuthProviderKind =
  import.meta.env.VITE_AUTH_PROVIDER === "local" ? "local" : "supabase";

/** The app-wide auth provider singleton. */
export const auth: AuthProvider =
  AUTH_PROVIDER === "local" ? createLocalAuth() : createSupabaseAuth();
