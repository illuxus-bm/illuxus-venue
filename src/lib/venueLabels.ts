/**
 * Display labels for venue fields on the public pages. The stored values are
 * the ones VenueEditorDialog offers (and migration 106's CHECK constraints
 * allow); keep these in step when an option is added there.
 */

export const SPACE_TYPE_LABEL: Record<string, string> = {
  indoor_hall: "Indoor hall",
  outdoor_lawn: "Outdoor lawn",
  terrace: "Terrace",
  poolside: "Poolside",
  conference_room: "Conference room",
  ballroom: "Ballroom",
  banquet_hall: "Banquet hall",
  rooftop: "Rooftop",
  other: "Event space",
};

export const CLIMATE_LABEL: Record<string, string> = {
  central_ac: "Central AC",
  split_ac: "Split AC",
  non_ac: "Non-AC",
};

export const CATERING_LABEL: Record<string, string> = {
  in_house_only: "In-house catering only",
  outside_permitted: "Outside caterers permitted",
  both: "In-house or outside caterers",
};

export const DECOR_LABEL: Record<string, string> = {
  empanelled_only: "Empanelled decorators only",
  client_choice: "Bring your own decorator",
  both: "Empanelled or your own decorator",
};

export const ALCOHOL_LABEL: Record<string, string> = {
  in_house_only: "In-house bar only",
  outside_with_license: "Outside alcohol with a licence",
  prohibited: "No alcohol",
  both: "In-house or outside with a licence",
};

export const CAPACITY_LAYOUTS = [
  { key: "capacity_floating", label: "Floating / reception" },
  { key: "capacity_theater", label: "Theater" },
  { key: "capacity_banquet", label: "Banquet" },
  { key: "capacity_classroom", label: "Classroom" },
  { key: "capacity_ushape", label: "U-shape" },
] as const;

export const UNIT_LABEL: Record<string, string> = {
  per_hour: "per hour",
  per_event: "per event",
  per_person: "per person",
  per_day: "per day",
  flat: "flat",
};

export function spaceTypeLabel(value: string | null | undefined): string {
  return (value && SPACE_TYPE_LABEL[value]) || "Event space";
}

/** "22:00:00" → "10:00 pm". */
export function formatTimeOfDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h)) return null;
  const d = new Date(2000, 0, 1, h, Number.isFinite(m) ? m : 0);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
