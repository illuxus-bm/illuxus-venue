/**
 * URL guards for anything that came from the database or the query string.
 *
 * React does not block `javascript:` URLs in href/src (it only warns), and
 * several URLs here are typed by other tenants (organizer venue links,
 * vendor map links, media URLs). Every such value must go through
 * `safeHttpUrl` before it reaches an `href` or `src`.
 */

/** Returns the normalised URL if it is absolute http(s), else null. */
export function safeHttpUrl(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Like safeHttpUrl, but also accepts a bare domain ("example.com") by assuming https. */
export function safeExternalUrl(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  return safeHttpUrl(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
}

/**
 * Same-origin path for post-login redirects. Rejects `//evil.com`,
 * `/\evil.com`, `/\t/evil.com`, absolute URLs, etc. by resolving against the
 * current origin and comparing.
 */
export function safeInternalPath(candidate: string | null | undefined, fallback = "/"): string {
  if (!candidate || !candidate.startsWith("/")) return fallback;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.invalid";
  try {
    const url = new URL(candidate, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
