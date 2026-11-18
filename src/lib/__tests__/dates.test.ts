import { describe, expect, it } from "vitest";

import { addDays, parseDateOnly, toDateOnly } from "@/lib/dates";

describe("date-only helpers", () => {
  it("parses SQL dates as local calendar days", () => {
    const d = parseDateOnly("2026-11-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(1);
  });

  it("formats local days without UTC shifting", () => {
    // 00:30 local on Nov 1: toISOString() would say Oct 31 east of UTC.
    expect(toDateOnly(new Date(2026, 10, 1, 0, 30))).toBe("2026-11-01");
  });

  it("round-trips and adds days across month ends", () => {
    expect(toDateOnly(addDays(parseDateOnly("2026-01-31"), 1))).toBe("2026-02-01");
    expect(toDateOnly(parseDateOnly("2026-12-31"))).toBe("2026-12-31");
  });
});
