import * as React from "react";
import {
  Building2,
  CalendarDays,
  Clock,
  Globe,
  Mail,
  MapPin,
  Phone,
  User,
  Users,
} from "lucide-react";

import type { InboxVenueRequest } from "@/hooks/useInboxVenueRequests";

/**
 * Event + organizer facts for one venue request: which of the vendor's
 * venues was asked for, the event dates and times, head count, location,
 * format, and how to reach the organizer. Rows with no data are skipped.
 *
 * The organizer's own brief (seating, event type, extra areas) renders
 * separately in VenueBriefSummary.
 */
export function VenueRequestDetails({ request }: { request: InboxVenueRequest }) {
  const [showDescription, setShowDescription] = React.useState(false);
  const when = formatWhen(request.event_date, request.event_end_date, request.event_timezone);
  const people = request.expected_attendees ?? request.event_capacity;

  const rows: Array<{ icon: typeof Users; label: string; value: React.ReactNode }> = [];
  if (request.venue_name) {
    rows.push({ icon: Building2, label: "Requested venue", value: request.venue_name });
  }
  rows.push({ icon: CalendarDays, label: "Dates", value: when.dates });
  if (when.time) rows.push({ icon: Clock, label: "Time", value: when.time });
  if (people != null) {
    rows.push({
      icon: Users,
      label: "People",
      value: `${people.toLocaleString("en-IN")} ${request.expected_attendees != null ? "expected" : "capacity"}`,
    });
  }
  if (request.event_city) {
    rows.push({ icon: MapPin, label: "Location", value: request.event_city });
  }
  if (request.event_format) {
    rows.push({ icon: Globe, label: "Format", value: titleCase(request.event_format) });
  }

  const hasContact =
    request.organizer_name || request.organizer_email || request.organizer_phone;

  return (
    <div className="mt-3 space-y-3">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-2">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="min-w-0">
            <dt className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Icon className="h-3 w-3" />
              {label}
            </dt>
            <dd className="font-medium text-foreground break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {request.event_description ? (
        <div className="text-[12px]">
          <p
            className={
              showDescription
                ? "whitespace-pre-line text-muted-foreground"
                : "line-clamp-2 text-muted-foreground"
            }
          >
            {request.event_description}
          </p>
          {request.event_description.length > 140 ? (
            <button
              type="button"
              className="mt-0.5 text-[11px] text-primary hover:underline"
              onClick={() => setShowDescription((v) => !v)}
            >
              {showDescription ? "Show less" : "Read more"}
            </button>
          ) : null}
        </div>
      ) : null}

      {hasContact ? (
        <div className="rounded-md border border-border/70 p-3 space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Organizer
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            {request.organizer_name ? (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <User className="h-3 w-3 text-muted-foreground" />
                {request.organizer_name}
                {request.org_name ? (
                  <span className="font-normal text-muted-foreground">· {request.org_name}</span>
                ) : null}
              </span>
            ) : null}
            {request.organizer_email ? (
              <a
                href={`mailto:${request.organizer_email}`}
                className="inline-flex items-center gap-1 text-primary hover:underline break-all"
              >
                <Mail className="h-3 w-3" />
                {request.organizer_email}
              </a>
            ) : null}
            {request.organizer_phone ? (
              <a
                href={`tel:${request.organizer_phone.replace(/\s+/g, "")}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Phone className="h-3 w-3" />
                {request.organizer_phone}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** "Fri, 20 Nov 2026" or "Fri, 20 Nov – Sun, 22 Nov 2026", plus the
 *  start–end time, shown in the event's timezone (IST when unset). */
function formatWhen(
  start: string | null,
  end: string | null,
  timezone: string | null,
): { dates: string; time: string | null } {
  if (!start) return { dates: "Date to be confirmed", time: null };
  let tz = "Asia/Kolkata";
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      tz = timezone;
    } catch {
      /* keep IST */
    }
  }
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-IN", { timeZone: tz, ...opts });
  const clock = (d: Date) =>
    d.toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const full: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  const sameDay = !e || day(s, full) === day(e, full);
  const dates = sameDay
    ? day(s, full)
    : `${day(s, { weekday: "short", day: "numeric", month: "short" })} – ${day(e!, full)}`;
  const time = e ? `${clock(s)} – ${clock(e)}` : clock(s);
  return { dates, time: tz === "Asia/Kolkata" ? time : `${time} (${tz})` };
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
