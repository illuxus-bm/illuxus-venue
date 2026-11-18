import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("vercel.json CSP", () => {
  it("allows exactly the inline scripts in index.html", () => {
    const html = readFileSync(resolve(root, "index.html"), "utf8");
    const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
    const csp: string = vercel.headers
      .flatMap((h: { headers: Array<{ key: string; value: string }> }) => h.headers)
      .find((h: { key: string }) => h.key === "Content-Security-Policy").value;

    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    for (const body of inline) {
      const hash = createHash("sha256").update(body).digest("base64");
      // If this fails you edited the inline theme script: update the hash in vercel.json.
      expect(csp).toContain(`'sha256-${hash}'`);
    }
  });
});
