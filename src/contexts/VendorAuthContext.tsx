import * as React from "react";

import { ApiError, get } from "@/lib/api";
import { auth, type AuthUser } from "@/lib/auth";
import { reportError } from "@/lib/monitoring";

export type VerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected";

/** The caller's vendor business, as returned by GET /api/me. */
export interface Vendor {
  id: string;
  business_name: string;
  tagline: string | null;
  bio: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  logo_url: string | null;
  cover_url: string | null;
  years_experience: number | null;
  response_time_hours: number | null;
  socials: Record<string, string> | null;
  notify_email: boolean;
  auto_reply: string | null;
  default_currency: string;
  rating_avg: number | null;
  rating_count: number;
  verification_status: VerificationStatus;
  commission_rate: number;
  created_at: string;
  updated_at: string;
}

export interface MeResponse {
  user: { id: string; email: string | null };
  vendor: Vendor | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email allowlist — vendor portal is invite-only.
// ─────────────────────────────────────────────────────────────────────────────
// Anyone with an account in the shared auth backend could otherwise try to
// sign in here, so sign-in is gated behind an explicit email allowlist. The
// default list ships one address so the portal works out of the box for the
// seed vendor; deployments override it with `VITE_VENDOR_ALLOWED_EMAILS`
// (comma-separated) without a code change.
//
// This is a UX gate, not a security boundary: the API scopes every /me route
// to the caller's vendor membership (403 not_a_vendor otherwise). The
// allowlist just shortens the failure path and shows a clean message.
// No built-in addresses: the server decides who is a vendor. Set the env
// var only to show the "not authorized" message before a network round trip.
const VENDOR_EMAIL_ALLOWLIST: ReadonlySet<string> = new Set(
  ((import.meta.env.VITE_VENDOR_ALLOWED_EMAILS as string | undefined) ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0),
);

function isEmailAllowlisted(email: string): boolean {
  // Empty allowlist === explicitly opt-out (falls back to the server's
  // vendor-membership check). Non-empty === strict allowlist.
  if (VENDOR_EMAIL_ALLOWLIST.size === 0) return true;
  return VENDOR_EMAIL_ALLOWLIST.has(email.trim().toLowerCase());
}

const ALLOWLIST_REJECTION_MESSAGE =
  "This email isn't authorized to access the vendor portal. Contact support if you should have access.";

const NOT_A_VENDOR_MESSAGE =
  "This email isn't registered as a vendor. Sign up to create a vendor business.";

interface VendorAuthState {
  /** True until the persisted session has been restored. */
  loading: boolean;
  /** True while we're fetching (or refetching, non-silently) the vendor. */
  vendorLoading: boolean;
  user: AuthUser | null;
  vendor: Vendor | null;
  /** Set when loading the vendor failed for a reason other than "no
   *  membership" (network, 5xx). The gate shows a retry instead of the
   *  misleading "not authorized" screen. */
  vendorError: Error | null;
  /**
   * Signs the user in with email + password and enforces vendor membership
   * (GET /api/me must return a vendor). If the auth backend reports "Email
   * not confirmed", surfaces a clear message so the login page can tell the
   * user to check their inbox.
   */
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /** Re-reads the vendor without flipping vendorLoading (no unmounts). */
  refreshVendor: () => Promise<void>;
}

const VendorAuthContext = React.createContext<VendorAuthState | undefined>(
  undefined,
);

/** Detects Supabase's "Email not confirmed" AuthApiError so we can render
 *  the "confirmation not done" hint instead of the raw error string. */
function isEmailNotConfirmed(msg: string | undefined | null): boolean {
  if (!msg) return false;
  return /email\s*(is|has|)\s*not\s*(been\s*)?confirmed/i.test(msg)
    || /confirm your email/i.test(msg);
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Central auth + vendor provider. Every /vendor/* route lives inside this so
 * the auth session and the linked vendor business are one source of truth.
 */
export function VendorAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [vendor, setVendor] = React.useState<Vendor | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [vendorLoading, setVendorLoading] = React.useState(false);
  const [vendorError, setVendorError] = React.useState<Error | null>(null);

  // Monotonic counter: only the latest loadVendor call may write state, so a
  // slow response can't resurrect a vendor after sign-out or account switch.
  const loadSeq = React.useRef(0);
  // The user whose vendor is loaded (or loading). Identity events that don't
  // change the user id must not reload the vendor.
  const loadedUid = React.useRef<string | null>(null);
  // signIn() fetches /me itself; skip the duplicate auto-load meanwhile.
  const signingIn = React.useRef(false);

  const loadVendor = React.useCallback(
    async (uid: string, opts: { silent?: boolean } = {}) => {
      const seq = ++loadSeq.current;
      loadedUid.current = uid;
      if (!opts.silent) setVendorLoading(true);
      try {
        const me = await get<MeResponse>("/me");
        if (seq !== loadSeq.current) return;
        setVendor(me.vendor ?? null);
        setVendorError(null);
      } catch (e) {
        if (seq !== loadSeq.current) return;
        if (e instanceof ApiError && e.status === 403) {
          // Signed in but not allowed: same as "not a vendor".
          setVendor(null);
          setVendorError(null);
          return;
        }
        // 401s already signed the user out (which bumps loadSeq). Anything
        // else (offline, 5xx): keep any previously loaded vendor and surface
        // the failure so the gate can offer a retry.
        setVendorError(asError(e));
        reportError(e, { source: "loadVendor" });
      } finally {
        if (seq === loadSeq.current) setVendorLoading(false);
      }
    },
    [],
  );

  const clearVendor = React.useCallback(() => {
    loadSeq.current += 1; // invalidate in-flight loads
    loadedUid.current = null;
    setVendor(null);
    setVendorError(null);
    setVendorLoading(false);
  }, []);

  const applyUser = React.useCallback(
    (next: AuthUser | null) => {
      setUser((prev) =>
        prev && next && prev.id === next.id && prev.email === next.email ? prev : next,
      );
      if (!next) {
        clearVendor();
      } else if (!signingIn.current && next.id !== loadedUid.current) {
        void loadVendor(next.id);
      }
    },
    [clearVendor, loadVendor],
  );

  React.useEffect(() => {
    let active = true;
    const unsubscribe = auth.onChange((u) => {
      if (active) applyUser(u);
    });

    auth
      .ready()
      .catch((e) => reportError(e, { source: "auth.ready" }))
      .finally(() => {
        if (!active) return;
        applyUser(auth.getUser());
        setLoading(false);
      });

    // Safety net: if the session restore never settles (storage blocked,
    // auth chunk failed to load) don't leave the app on a spinner forever.
    const fallback = window.setTimeout(() => {
      if (active) setLoading(false);
    }, 8000);

    return () => {
      active = false;
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, [applyUser]);

  const signIn = React.useCallback(
    async (email: string, password: string): Promise<{ error: Error | null }> => {
      const normalizedEmail = email.trim().toLowerCase();

      // Allowlist gate — short-circuit before we hit the auth backend so a
      // non-allowlisted email never gets a real login attempt (and doesn't
      // count against auth rate limits).
      if (!isEmailAllowlisted(normalizedEmail)) {
        return { error: new Error(ALLOWLIST_REJECTION_MESSAGE) };
      }

      signingIn.current = true;
      try {
        const { error } = await auth.signIn(normalizedEmail, password);
        if (error) {
          if (isEmailNotConfirmed(error.message)) {
            return {
              error: new Error(
                "Confirmation not done. Check your inbox for the confirmation link and click it before signing in.",
              ),
            };
          }
          return { error };
        }

        // A valid credential does NOT automatically grant access to the
        // vendor portal. Enforce vendor membership explicitly and undo the
        // session if the account isn't a vendor.
        let me: MeResponse;
        try {
          me = await get<MeResponse>("/me");
        } catch (e) {
          await auth.signOut();
          if (e instanceof ApiError && e.status === 403) {
            return { error: new Error(NOT_A_VENDOR_MESSAGE) };
          }
          return { error: asError(e) };
        }

        if (!me.vendor) {
          await auth.signOut();
          return { error: new Error(NOT_A_VENDOR_MESSAGE) };
        }

        // Prime the vendor so the dashboard doesn't fetch /me again.
        loadSeq.current += 1;
        loadedUid.current = me.user.id;
        setVendor(me.vendor);
        setVendorError(null);
        setVendorLoading(false);
        return { error: null };
      } finally {
        signingIn.current = false;
        // Catch up on anything skipped while signing in.
        const current = auth.getUser();
        applyUser(current);
      }
    },
    [applyUser],
  );

  const signOut = React.useCallback(async () => {
    try {
      await auth.signOut();
    } catch (e) {
      reportError(e, { source: "signOut" });
    }
    setUser(null);
    clearVendor();
  }, [clearVendor]);

  // Silent: refreshing after a profile save must not unmount the dashboard.
  const refreshVendor = React.useCallback(async () => {
    if (user?.id) await loadVendor(user.id, { silent: true });
  }, [user?.id, loadVendor]);

  const value = React.useMemo<VendorAuthState>(
    () => ({
      loading,
      vendorLoading,
      user,
      vendor,
      vendorError,
      signIn,
      signOut,
      refreshVendor,
    }),
    [loading, vendorLoading, user, vendor, vendorError, signIn, signOut, refreshVendor],
  );

  return (
    <VendorAuthContext.Provider value={value}>
      {children}
    </VendorAuthContext.Provider>
  );
}

export function useVendorAuth(): VendorAuthState {
  const ctx = React.useContext(VendorAuthContext);
  if (!ctx) {
    throw new Error("useVendorAuth must be used inside <VendorAuthProvider>");
  }
  return ctx;
}
