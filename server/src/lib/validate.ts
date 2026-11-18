import { z } from "zod";

import { badRequest, notFound } from "./errors.js";

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid id");

/** Parse with a schema; ZodError is turned into a 400 by the error handler. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(value ?? {});
}

/** `:id` route params: a malformed id is simply "not found". */
export function idParam(params: unknown, name = "id"): string {
  const raw = (params as Record<string, unknown> | undefined)?.[name];
  const ok = uuid.safeParse(raw);
  if (!ok.success) throw notFound();
  return ok.data;
}

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  // Round-trip: rejects impossible days like 2027-02-30 that Date would roll over.
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid date");

export const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => {
    try {
      const p = new URL(u);
      return p.protocol === "https:" || p.protocol === "http:";
    } catch {
      return false;
    }
  }, "Must be an http(s) link");

/** Optional text: trims, "" → null, length-capped. */
export const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const nonNegInt = (max = 2_000_000_000) => z.number().int().min(0).max(max).nullish();
export const nonNegDec = (max: number) => z.number().min(0).max(max).nullish();

export const currency = z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code");

export function assertFound<T>(v: T | null | undefined, what = "Not found"): T {
  if (v === null || v === undefined) throw notFound(what);
  return v;
}

export { badRequest };
