/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  readonly VITE_ILLUXUS_ORIGIN?: string;
  /** Comma-separated vendor portal invite list (UX gate; the DB enforces it). */
  readonly VITE_VENDOR_ALLOWED_EMAILS?: string;
  /** Optional endpoint that receives client error reports (JSON POST). */
  readonly VITE_ERROR_REPORT_URL?: string;
  /** Release identifier attached to error reports. */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
