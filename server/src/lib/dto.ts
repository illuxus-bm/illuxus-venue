/**
 * Database row → API JSON. Converts Prisma's runtime types to what the web
 * and native apps expect: Decimal → number, BigInt → number (minor units),
 * @db.Date → "YYYY-MM-DD", @db.Time → "HH:MM:SS", timestamps → ISO strings.
 */
import type { Prisma } from "../generated/prisma/client.js";

type Dec = Prisma.Decimal | null | undefined;

export const num = (v: Dec | number | bigint): number | null =>
  v === null || v === undefined ? null : typeof v === "number" ? v : Number(v.toString());

export const money = (v: bigint | number | null | undefined): number => (v == null ? 0 : Number(v));

export const moneyOrNull = (v: bigint | number | null | undefined): number | null => (v == null ? null : Number(v));

/** @db.Date values are UTC midnight; read the calendar day in UTC. */
export const dateOnly = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export const timeOnly = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(11, 19) : null);

/** "YYYY-MM-DD" → Date at UTC midnight (for @db.Date writes). */
export const toDbDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

/** "HH:MM" | "HH:MM:SS" → Date on 1970-01-01 UTC (for @db.Time writes). */
export const toDbTime = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const [h, m, sec = "00"] = s.split(":");
  return new Date(`1970-01-01T${h!.padStart(2, "0")}:${m!.padStart(2, "0")}:${sec.padStart(2, "0")}.000Z`);
};

export function vendorDto(v: Prisma.vendorsGetPayload<object>) {
  return {
    id: v.id,
    business_name: v.business_name,
    tagline: v.tagline,
    bio: v.bio,
    website: v.website,
    city: v.city,
    country: v.country,
    logo_url: v.logo_url,
    cover_url: v.cover_url,
    years_experience: v.years_experience,
    response_time_hours: v.response_time_hours,
    socials: (v.socials as Record<string, string> | null) ?? {},
    notify_email: v.notify_email,
    auto_reply: v.auto_reply,
    default_currency: v.default_currency,
    rating_avg: num(v.rating_avg),
    rating_count: v.rating_count,
    verification_status: v.verification_status,
    commission_rate: num(v.commission_rate) ?? 0,
    created_at: iso(v.created_at)!,
    updated_at: iso(v.updated_at)!,
  };
}

export function venueDto(v: Prisma.venuesGetPayload<object>) {
  return {
    ...v,
    length_ft: num(v.length_ft),
    width_ft: num(v.width_ft),
    ceiling_height_ft: num(v.ceiling_height_ft),
    music_curfew_time: timeOnly(v.music_curfew_time),
    created_at: iso(v.created_at)!,
    updated_at: iso(v.updated_at)!,
  };
}

export function venueMediaDto(m: Prisma.venue_mediaGetPayload<object>) {
  return { ...m, created_at: iso(m.created_at)! };
}

export function serviceDto(s: Prisma.vendor_servicesGetPayload<object>) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    base_price: money(s.base_price),
    currency: s.currency,
    unit: s.unit,
    duration: s.duration,
    is_instant_book: s.is_instant_book,
    quote_on_request: s.quote_on_request,
    is_active: s.is_active,
    venue_id: s.venue_id,
    category: s.category,
  };
}

export function availabilityDto(a: Prisma.vendor_availabilityGetPayload<object>) {
  return {
    id: a.id,
    vendor_id: a.vendor_id,
    date: dateOnly(a.date)!,
    status: a.status,
    note: a.note,
    booking_id: a.booking_id,
    venue_id: a.venue_id,
  };
}

export function portfolioDto(p: Prisma.vendor_portfolioGetPayload<object>) {
  return {
    id: p.id,
    url: p.url,
    media_type: p.media_type as "image" | "video",
    caption: p.caption,
    is_cover: p.is_cover,
    sort_order: p.sort_order,
  };
}

export function bookingDto(
  b: Prisma.vendor_bookingsGetPayload<{ include: { rfqs: { select: { requirements: true } } } }>,
) {
  return {
    id: b.id,
    summary: (b.rfqs?.requirements ?? "").slice(0, 120) || "Booking",
    total: money(b.total),
    currency: b.currency,
    status: b.status,
    event_date: dateOnly(b.event_date),
    deposit_status: b.deposit_status,
    created_at: iso(b.created_at)!,
  };
}

export function quoteDto(q: Prisma.quotesGetPayload<{ include: { rfqs: { select: { requirements: true } } } }>) {
  return {
    id: q.id,
    rfq_id: q.rfq_id,
    rfq_summary: (q.rfqs?.requirements ?? "").slice(0, 120),
    total: money(q.total),
    currency: q.currency,
    status: q.status,
    valid_until: dateOnly(q.valid_until),
    created_at: iso(q.created_at)!,
  };
}
