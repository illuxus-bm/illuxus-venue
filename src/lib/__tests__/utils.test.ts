import { describe, expect, it } from "vitest";

import { formatMoneyCents, initials } from "@/lib/utils";
import { mediaKindFromUrl } from "@/lib/media";

describe("formatMoneyCents", () => {
  it("formats minor units", () => {
    expect(formatMoneyCents(150000, "INR")).toMatch(/1,500/);
  });

  it("never throws on bad currency or amount", () => {
    expect(() => formatMoneyCents(100, null)).not.toThrow();
    expect(() => formatMoneyCents(100, "NOT-A-CODE")).not.toThrow();
    expect(() => formatMoneyCents("abc", "USD")).not.toThrow();
    expect(formatMoneyCents(null, "USD")).toMatch(/0/);
  });
});

describe("initials", () => {
  it("takes up to two initials", () => {
    expect(initials("Biz Millennium Venues")).toBe("BM");
    expect(initials("  solo ")).toBe("S");
  });
});

describe("mediaKindFromUrl", () => {
  it("lets the file extension win over a wrong hint", () => {
    expect(mediaKindFromUrl("https://x.supabase.co/a/b.jpg", "video")).toBe("image");
    expect(mediaKindFromUrl("https://x.supabase.co/a/b.mp4", "empty_hall")).toBe("video");
    expect(mediaKindFromUrl("https://x.supabase.co/a/plan.pdf", null)).toBe("file");
  });

  it("never renders SVG inline", () => {
    expect(mediaKindFromUrl("https://x.supabase.co/a/b.svg")).toBe("file");
  });
});
