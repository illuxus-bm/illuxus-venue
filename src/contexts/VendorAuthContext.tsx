import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { reportError } from "@/lib/monitoring";

type Vendor = Database["public"]["Tables"]["vendors"]["Row"];

// ─────────────────────────────────────────────────────────────────────────────
// Email allowlist — vendor portal is invite-only.
// ─────────────────────────────────────────────────────────────────────────────
// The vendor portal shares its Supabase project with the main Illuxus app, so
// anyone with an auth.users row could otherwise try to sign in here. We gate
// every entry point (sign-in, sign-up, existing-account link) behind an
// explicit email allowlist. The default list ships one address so the portal
// works out of the box for the seed vendor; production deployments can
// override with `VITE_VENDOR_ALLOWED_EMAILS` (comma-separated) without a
// code change.
//
// This is a UX gate, not a security boundary. RLS on vendor_* tables is what
// actually protects the data; a determined attacker with valid credentials
// could hit the REST API directly. But that user still wouldn't have a
// vendor_members row and would see nothing — the allowlist just shortens
// the failure path and shows a clean message instead of the misleading
// "This email isn't registered as a vendor" that we surface for members-
// missing accounts.
const DEFAULT_ALLOWLIST = ["aman@bizmillennium.com"];

const VENDOR_EMAIL_ALLOWLIST: ReadonlySet<string> = new Set(
  (
    (import.meta.env.VITE_VENDOR_ALLOWED_EMAILS as string | undefined) ??
    DEFAULT_ALLOWLIST.join(",")
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0),
);

function isEmailAllowlisted(email: string): boolean {
  // Empty allowlist === explicitly opt-out (falls back to the vendor_members
  // check). Non-empty === strict allowlist.
  if (VENDOR_EMAIL_ALLOWLIST.size === 0) return true;
  return VENDOR_EMAIL_ALLOWLIST.has(email.trim().toLowerCase());
}

const ALLOWLIST_REJECTION = new Error(
  "This email isn't authorized to access the vendor portal. Contact support if you should have access.",
);

interface SignUpResult {
  error: Error | null;
  /** True when Supabase returned no session — the user must click the
   *  confirmation link in their inbox before signing in. */
  needsConfirmation?: boolean;
}

interface VendorAuthState {
  /** True until the first session probe finishes. */
  loading: boolean;
  /** True while we're fetching (or refetching) the vendor row. */
  vendorLoading: boolean;
  session: Session | null;
  user: User | null;
  vendor: Vendor | null;
  /** Set when loading the vendor row failed for a reason other than "no
   *  membership" (network, 5xx). The gate shows a retry instead of the
   *  misleading "not authorized" screen. */
  vendorError: Error | null;
  /**
   * Signs the user in with email + password and enforces vendor-membership.
   * If Supabase reports "Email not confirmed", surfaces a clear message so
   * the login page can tell the user to check their inbox.
   */
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null }>;
  /**
   * Creates the auth user, stashes `business_name` in raw_user_meta_data,
   * and Supabase sends a confirmation email using the project's SMTP.
   *
   * The corresponding vendors + vendor_members rows are created later by
   * the on_vendor_email_confirmed() DB trigger, the moment the user clicks
   * the link. Nothing to do client-side after this call.
   */
  signUp: (
    email: string,
    password: string,
    businessName: string,
  ) => Promise<SignUpResult>;
  /** Resend the "confirm signup" email if the user lost the first one. */
  resendConfirmation: (email: string) => Promise<{ error: Error | null }>;
  /**
   * "Existing Illuxus account" path — signs in with the given creds
   * (bypassing the vendor-membership check) then immediately creates the
   * vendor row. Only usable for accounts that are already email-confirmed.
   */
  linkExistingAccount: (
    email: string,
    password: string,
    businessName: string,
  ) => Promise<{ error: Error | null }>;
  /** Explicit business-creation path used when the user is already signed in
   *  but has no vendor row (e.g. after clicking through from the "Not a
   *  vendor" consent screen). */
  createBusiness: (
    businessName: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
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

function confirmationRedirectUrl(): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/vendor/login?confirmed=1`;
}

/**
 * Central auth + vendor-row provider. Every /vendor/* route lives inside
 * this so the auth session and the linked vendor business are one source
 * of truth.
 */
export function VendorAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [vendor, setVendor] = React.useState<Vendor | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [vendorLoading, setVendorLoading] = React.useState(false);
  const [vendorError, setVendorError] = React.useState<Error | null>(null);

  // Monotonic counter: only the latest loadVendor call may write state, so a
  // slow response can't resurrect a vendor after sign-out or account switch.
  const loadSeq = React.useRef(0);
  // The user whose vendor row is loaded (or loading). Auth fires SIGNED_IN on
  // tab refocus and TOKEN_REFRESHED hourly; neither should reload the vendor.
  const loadedUid = React.useRef<string | null>(null);

  const loadVendor = React.useCallback(
    async (uid: string, opts: { silent?: boolean } = {}) => {
      const seq = ++loadSeq.current;
      loadedUid.current = uid;
      if (!opts.silent) setVendorLoading(true);
      try {
        const { data: memberRow, error: memberErr } = await supabase
          .from("vendor_members")
          .select("vendor_id")
          .eq("user_id", uid)
          .limit(1)
          .maybeSingle();
        if (memberErr) throw memberErr;

        let row: Vendor | null = null;
        if (memberRow?.vendor_id) {
          const { data: vendorRow, error: vendorErr } = await supabase
            .from("vendors")
            .select("*")
            .eq("id", memberRow.vendor_id)
            .maybeSingle();
          if (vendorErr) throw vendorErr;
          row = (vendorRow as Vendor | null) ?? null;
        }

        if (seq !== loadSeq.current) return;
        setVendor(row);
        setVendorError(null);
      } catch (e) {
        if (seq !== loadSeq.current) return;
        // Keep any previously loaded vendor; surface the failure.
        setVendorError(e instanceof Error ? e : new Error(String(e)));
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

  // Boot + subscribe. INITIAL_SESSION carries the restored session, so no
  // separate getSession() probe is needed (that used to load the vendor
  // twice on every boot). When the user clicks the confirmation link,
  // detectSessionInUrl parses the tokens and SIGNED_IN fires here.
  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      const uid = sess?.user?.id ?? null;
      if (!uid) {
        clearVendor();
      } else if (uid !== loadedUid.current) {
        // Never await Supabase calls inside this callback (auth lock deadlock).
        void loadVendor(uid);
      }
      if (event === "INITIAL_SESSION") setLoading(false);
    });

    // Safety net: if INITIAL_SESSION never arrives (storage blocked, etc.)
    // don't leave the app on a spinner forever.
    const fallback = window.setTimeout(() => setLoading(false), 8000);

    return () => {
      window.clearTimeout(fallback);
      sub.subscription.unsubscribe();
    };
  }, [loadVendor, clearVendor]);

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = email.trim().toLowerCase();

      // Allowlist gate — short-circuit before we hit Supabase Auth so a
      // non-allowlisted email never gets a real login attempt (and so we
      // don't count against auth rate limits for people we're going to
      // reject anyway).
      if (!isEmailAllowlisted(normalizedEmail)) {
        return { error: ALLOWLIST_REJECTION };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

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

      // auth.users is shared with the main Illuxus app, so a valid credential
      // does NOT automatically grant access to the vendor portal. Enforce
      // vendor membership explicitly and undo the session if the user isn't
      // registered as a vendor.
      const uid = data.user?.id;
      if (!uid) {
        await supabase.auth.signOut();
        return { error: new Error("Sign-in failed. Please try again.") };
      }

      const { data: member, error: memberErr } = await supabase
        .from("vendor_members")
        .select("vendor_id")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();

      if (memberErr) {
        await supabase.auth.signOut();
        return { error: memberErr };
      }

      if (!member) {
        await supabase.auth.signOut();
        return {
          error: new Error(
            "This email isn't registered as a vendor. Sign up to create a vendor business.",
          ),
        };
      }

      return { error: null };
    },
    [],
  );

  const signUp = React.useCallback(
    async (email: string, password: string, businessName: string) => {
      const normalizedEmail = email.trim().toLowerCase();

      // Signup is disabled for anyone not on the invite list. The DB
      // trigger on auth.users would happily provision a vendor row
      // otherwise (see migration 103); this gate is what makes the
      // portal actually invite-only.
      if (!isEmailAllowlisted(normalizedEmail)) {
        return { error: ALLOWLIST_REJECTION };
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { business_name: businessName.trim() },
          emailRedirectTo: confirmationRedirectUrl(),
        },
      });
      if (error) return { error };
      // When email confirmation is required, Supabase returns { user, session: null }.
      // The on_vendor_email_confirmed() trigger runs the moment the user clicks
      // the confirmation link, so we don't need any client-side follow-up.
      return { error: null, needsConfirmation: !data.session };
    },
    [],
  );

  const resendConfirmation = React.useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: confirmationRedirectUrl(),
      },
    });
    return { error };
  }, []);

  const createBusiness = React.useCallback(
    async (businessName: string) => {
      const { error } = await supabase.rpc("create_vendor_business", {
        p_business_name: businessName,
      });
      if (error) return { error };
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) await loadVendor(data.user.id);
      return { error: null };
    },
    [loadVendor],
  );

  const linkExistingAccount = React.useCallback(
    async (email: string, password: string, businessName: string) => {
      const normalizedEmail = email.trim().toLowerCase();

      // Same allowlist gate as signIn / signUp — the "link existing Illuxus
      // account" path would otherwise let any main-app user claim a vendor
      // profile just by knowing their own password.
      if (!isEmailAllowlisted(normalizedEmail)) {
        return { error: ALLOWLIST_REJECTION };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        if (isEmailNotConfirmed(error.message)) {
          return {
            error: new Error(
              "This Illuxus account hasn't confirmed its email yet. Confirm it from the main Illuxus app first, then come back.",
            ),
          };
        }
        return { error };
      }
      const uid = data.user?.id;
      if (!uid) {
        await supabase.auth.signOut();
        return { error: new Error("Sign-in failed") };
      }
      const { error: rpcErr } = await supabase.rpc(
        "create_vendor_business",
        { p_business_name: businessName },
      );
      if (rpcErr) {
        await supabase.auth.signOut();
        return { error: rpcErr };
      }
      await loadVendor(uid);
      return { error: null };
    },
    [loadVendor],
  );

  const signOut = React.useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Server-side revoke failed (offline, etc.). Still drop the local
      // session so the device is signed out and a reload can't restore it.
      reportError(error, { source: "signOut" });
      await supabase.auth.signOut({ scope: "local" });
    }
    setSession(null);
    setUser(null);
    clearVendor();
  }, [clearVendor]);

  // Silent: refreshing after a profile save must not unmount the dashboard.
  const refreshVendor = React.useCallback(async () => {
    if (user?.id) await loadVendor(user.id, { silent: true });
  }, [user?.id, loadVendor]);

  const value: VendorAuthState = {
    loading,
    vendorLoading,
    session,
    user,
    vendor,
    vendorError,
    signIn,
    signUp,
    resendConfirmation,
    linkExistingAccount,
    createBusiness,
    signOut,
    refreshVendor,
  };

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
