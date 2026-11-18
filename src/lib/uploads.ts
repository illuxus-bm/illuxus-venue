import { ApiError, NETWORK_ERROR_MESSAGE, post } from "@/lib/api";

/**
 * Direct-to-storage uploads, brokered by the API (docs/API.md → Uploads):
 *
 *   1. POST /api/me/uploads { kind, content_type, size[, venue_id] }
 *        → { key, uploadUrl, publicUrl, headers }
 *   2. PUT the raw file to `uploadUrl` with exactly `headers`.
 *   3. The caller references `key` in the create call (venue media,
 *      portfolio item, logo / cover). The API builds the public URL from the
 *      key and owns cleanup of replaced / deleted / orphaned files.
 *
 * The type / size prechecks below mirror the server's limits so a bad file
 * fails instantly instead of after a long upload.
 */

export const VENDOR_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const VENDOR_MEDIA_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const VENUE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
] as const;
export const VENUE_MEDIA_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/** Generous cap on the storage PUT itself (large videos on slow links). */
const UPLOAD_PUT_TIMEOUT_MS = 10 * 60_000;

export type UploadTarget =
  | { kind: "vendor-media" }
  | { kind: "venue-media"; venueId: string };

export interface UploadTicket {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  headers: Record<string, string>;
}

export interface UploadOk {
  ok: true;
  /** Storage key to pass to the create endpoint. */
  key: string;
  /** Where the file will be served from (for optimistic previews). */
  publicUrl: string;
}

export interface UploadErr {
  ok: false;
  error: string;
}

export type UploadResult = UploadOk | UploadErr;

/** Client-side precheck for logo / cover / portfolio images. */
export function validateVendorImage(file: File): string | null {
  if (!(VENDOR_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return "Only JPG, PNG, or WEBP images are supported";
  }
  if (file.size > VENDOR_MEDIA_MAX_BYTES) {
    return "File must be under 5 MB";
  }
  return null;
}

/** Client-side precheck for venue photos / videos / floor plans. */
export function validateVenueMedia(file: File): string | null {
  if (file.size > VENUE_MEDIA_MAX_BYTES) return "larger than 50 MB";
  if (!(VENUE_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return "unsupported file type";
  }
  return null;
}

/** Steps 1 + 2. Never throws. */
export async function uploadFile(file: File, target: UploadTarget): Promise<UploadResult> {
  let ticket: UploadTicket;
  try {
    ticket = await post<UploadTicket>(
      "/me/uploads",
      target.kind === "venue-media"
        ? { kind: "venue-media", venue_id: target.venueId, content_type: file.type, size: file.size }
        : { kind: "vendor-media", content_type: file.type, size: file.size },
    );
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : "Upload failed" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_PUT_TIMEOUT_MS);
  try {
    const res = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: ticket.headers ?? {},
      body: file,
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `Upload failed (HTTP ${res.status}). Please try again.` };
    }
  } catch {
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  } finally {
    clearTimeout(timer);
  }

  return { ok: true, key: ticket.key, publicUrl: ticket.publicUrl };
}

/** Validate + upload a logo / cover / portfolio image to vendor-media. */
export async function uploadVendorImage(file: File): Promise<UploadResult> {
  const validationErr = validateVendorImage(file);
  if (validationErr) return { ok: false, error: validationErr };
  return uploadFile(file, { kind: "vendor-media" });
}
