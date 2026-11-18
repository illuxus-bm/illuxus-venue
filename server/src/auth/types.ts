export interface AuthUser {
  /** auth.users.id (Supabase) or app_users.id (local). */
  id: string;
  email: string | null;
}

/** Verifies a bearer access token and returns its user, or null if invalid. */
export interface TokenVerifier {
  verify(token: string): Promise<AuthUser | null>;
}
