import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { storageConfigured, type Env } from "../env.js";
import { badRequest, unavailable } from "./errors.js";

/**
 * Object storage over the S3 API, so the same code runs on AWS S3 and on
 * Supabase Storage (which exposes an S3-compatible endpoint). Clients upload
 * straight to the bucket with a short-lived presigned PUT; the API never
 * proxies file bytes. Type and size are part of the signature, so the client
 * can't upload anything other than what was approved.
 */
export const UPLOAD_RULES = {
  "venue-media": {
    maxBytes: 50 * 1024 * 1024,
    types: {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/avif": "avif",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
      "application/pdf": "pdf",
    } as Record<string, string>,
  },
  "vendor-media": {
    maxBytes: 5 * 1024 * 1024,
    types: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>,
  },
} as const;

export type UploadKind = keyof typeof UPLOAD_RULES;

export function createStorage(env: Env) {
  const enabled = storageConfigured(env);
  const client = enabled
    ? new S3Client({
        region: env.STORAGE_REGION,
        ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
        forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: env.STORAGE_ACCESS_KEY_ID!,
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY!,
        },
        maxAttempts: 3,
      })
    : null;

  const bucketFor = (kind: UploadKind) => (kind === "venue-media" ? env.BUCKET_VENUE_MEDIA : env.BUCKET_VENDOR_MEDIA);
  const base = env.STORAGE_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? "";

  function requireClient(): S3Client {
    if (!client) throw unavailable("File uploads aren't configured on this server yet.");
    return client;
  }

  return {
    enabled,

    /** Validate and presign one upload into `<folder>/<uuid>.<ext>`. */
    async presign(kind: UploadKind, folder: string, contentType: string, size: number) {
      const rules = UPLOAD_RULES[kind];
      const ext = rules.types[contentType];
      if (!ext) throw badRequest("That file type isn't supported.");
      if (!Number.isInteger(size) || size <= 0) throw badRequest("The file is empty.");
      if (size > rules.maxBytes) {
        throw badRequest(`Files must be under ${Math.round(rules.maxBytes / 1024 / 1024)} MB.`);
      }
      const key = `${folder}/${randomUUID()}.${ext}`;
      const bucket = bucketFor(kind);
      const uploadUrl = await getSignedUrl(
        requireClient(),
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: size,
          CacheControl: "public, max-age=31536000, immutable",
        }),
        { expiresIn: 300, signableHeaders: new Set(["content-type", "content-length"]) },
      );
      return { key, uploadUrl, publicUrl: this.publicUrl(kind, key), headers: { "Content-Type": contentType } };
    },

    publicUrl(kind: UploadKind, key: string): string {
      return `${base}/${bucketFor(kind)}/${key}`;
    },

    /** Object key from one of our public URLs, or null if it isn't ours. */
    keyFromUrl(kind: UploadKind, url: string | null | undefined): string | null {
      if (!url || !base) return null;
      const prefix = `${base}/${bucketFor(kind)}/`;
      return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
    },

    /** Best-effort delete: a leftover file must never fail the user's action. */
    async remove(kind: UploadKind, key: string | null, log?: { warn: (o: object, m: string) => void }) {
      if (!key || !client) return;
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucketFor(kind), Key: key }));
      } catch (err) {
        log?.warn({ err, key }, "storage cleanup failed");
      }
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
