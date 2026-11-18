import { AlertTriangle } from "lucide-react";

import { AUTH_PROVIDER } from "@/lib/auth";

// Only the Supabase auth adapter needs these; with VITE_AUTH_PROVIDER=local
// sign-in goes through the API and Supabase isn't used at all. Checked here
// (not imported from the Supabase client) so local builds never load
// supabase-js.
const SUPABASE_ENV_MISSING =
  AUTH_PROVIDER === "supabase" &&
  (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

/**
 * Rendered at the top of every page when the app uses Supabase auth but the
 * Supabase env vars aren't set. Prevents the "nothing works and I don't know
 * why" experience the first time someone clones the repo without copying
 * `.env.example` → `.env`.
 */
export function EnvMissingBanner() {
  if (!SUPABASE_ENV_MISSING) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-2 px-4 py-2 text-xs sm:px-6">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <strong>Supabase auth not configured.</strong>{" "}
          Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
          <code className="rounded bg-amber-100 px-1">.env</code> and paste{" "}
          <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> from the main illuxus
          project, or set <code>VITE_AUTH_PROVIDER=local</code>. The app will
          keep running but sign-in won't work.
        </div>
      </div>
    </div>
  );
}
