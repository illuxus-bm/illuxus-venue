/**
 * Polling cadence for data that used to arrive over Supabase Realtime
 * (inbox + KPI tiles). TanStack Query pauses the interval while the document
 * is hidden (refetchIntervalInBackground: false) and refetches on focus; the
 * native shells also invalidate everything when the app resumes.
 */
export const INBOX_POLL_MS = 30_000;
