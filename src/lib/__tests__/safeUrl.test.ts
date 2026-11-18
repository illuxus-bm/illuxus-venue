import { describe, expect, it } from "vitest";

import { safeExternalUrl, safeHttpUrl, safeInternalPath } from "@/lib/safeUrl";

describe("safeHttpUrl", () => {
  it("accepts http(s) URLs", () => {
    expect(safeHttpUrl("https://maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(safeHttpUrl("  http://example.com/x ")).toBe("http://example.com/x");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "/relative/path",
    "not a url",
    "",
    null,
    undefined,
  ])("rejects %s", (value) => {
    expect(safeHttpUrl(value as string | null | undefined)).toBeNull();
  });
});

describe("safeExternalUrl", () => {
  it("adds https to bare domains", () => {
    expect(safeExternalUrl("example.com")).toBe("https://example.com/");
  });
  it("still rejects dangerous schemes", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("safeInternalPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeInternalPath("/vendor?tab=inbox#x", "/vendor")).toBe("/vendor?tab=inbox#x");
  });

  it.each(["//evil.com", "/\\evil.com", "/\\t/evil.com", "https://evil.com", "evil.com", "", null])(
    "rejects %s",
    (value) => {
      expect(safeInternalPath(value as string | null, "/vendor")).toBe("/vendor");
    },
  );
});
