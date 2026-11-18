/**
 * Date-only helpers. SQL `date` columns ("2026-11-01") must be handled as
 * calendar days in the viewer's local time:
 *  - `new Date("2026-11-01")` parses as UTC midnight, so west of UTC it
 *    renders as Oct 31.
 *  - `date.toISOString().slice(0, 10)` converts to UTC first, so east of UTC
 *    (e.g. IST before 05:30) it yields yesterday.
 */

/** Local calendar day as "YYYY-MM-DD". */
export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today (local) as "YYYY-MM-DD". */
export function todayDateOnly(): string {
  return toDateOnly(new Date());
}

/**
 * Parse "YYYY-MM-DD" (or a full timestamp) into a local Date. Date-only
 * strings become local midnight on that day.
 */
export function parseDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** Add whole days to a local date. */
export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}
