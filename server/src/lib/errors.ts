import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { Prisma } from "../generated/prisma/client.js";

/** An error that is safe to show the client as-is. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "error",
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, "bad_request", details);
export const unauthorized = (msg = "Sign in to continue.") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "You don't have access to this.") => new HttpError(403, msg, "forbidden");
export const notFound = (what = "Not found") => new HttpError(404, what, "not_found");
export const conflict = (msg: string) => new HttpError(409, msg, "conflict");
export const unavailable = (msg: string) => new HttpError(503, msg, "unavailable");

interface Body {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

/** Postgres SQLSTATE for errors surfaced through the driver adapter. */
function pgCode(err: unknown): string | undefined {
  const anyErr = err as {
    code?: unknown;
    cause?: { code?: unknown; originalCode?: unknown };
    meta?: { code?: unknown; driverAdapterError?: { cause?: { code?: unknown; originalCode?: unknown } } };
  };
  const adapter = anyErr?.meta?.driverAdapterError?.cause;
  for (const c of [adapter?.originalCode, adapter?.code, anyErr?.cause?.originalCode, anyErr?.cause?.code, anyErr?.meta?.code, anyErr?.code]) {
    if (typeof c === "string" && /^[0-9A-Z]{5}$/.test(c)) return c;
  }
  return undefined;
}

/** Driver-adapter error kinds that mean "database unavailable". */
function adapterUnavailable(err: unknown): boolean {
  const kind = (err as { meta?: { driverAdapterError?: { cause?: { kind?: unknown } } } })?.meta?.driverAdapterError?.cause?.kind;
  return (
    typeof kind === "string" &&
    ["DatabaseNotReachable", "DatabaseDoesNotExist", "SocketTimeout", "ConnectionClosed", "TooManyConnections", "TlsConnectionError", "AuthenticationFailed"].includes(kind)
  );
}

/**
 * Translate anything thrown in a handler into a stable JSON error. Known
 * failures (validation, constraints, not found, DB down) get a precise
 * status; everything else becomes a generic 500 with the request id, and the
 * real error goes only to the logs.
 */
export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;

  if (err instanceof ZodError) {
    return badRequest(
      "Some fields are invalid.",
      err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P1xxx = connection / server problems; P2024 = pool timeout.
    if (err.code.startsWith("P1") || err.code === "P2024" || adapterUnavailable(err)) {
      return unavailable("The service is temporarily unavailable. Please try again.");
    }
    if (err.code === "P2034") return conflict("This changed at the same time somewhere else. Please try again.");
    switch (err.code) {
      case "P2002":
        return conflict("That already exists.");
      case "P2025":
      case "P2001":
        return notFound();
      case "P2003":
        return conflict("This is linked to something that doesn't exist or is still in use.");
      case "P2000":
        return badRequest("A value is too long.");
      case "P2004":
        return badRequest("That change isn't allowed.");
      default:
        break;
    }
    const code = pgCode(err);
    if (code === "23514") return badRequest("A value is outside the allowed range.");
    if (code === "42501") return new HttpError(403, "That change isn't allowed.", "forbidden");
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return badRequest("The request couldn't be processed.");
  }

  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    return unavailable("The service is temporarily unavailable. Please try again.");
  }

  const code = pgCode(err);
  if (code === "23505") return conflict("That already exists.");
  if (code === "23514") return badRequest("A value is outside the allowed range.");
  if (code === "23503") return conflict("This is linked to something that doesn't exist or is still in use.");
  if (code === "57014") return unavailable("The request took too long. Please try again.");
  if (code?.startsWith("08") || code === "53300" || code === "57P01") {
    return unavailable("The service is temporarily unavailable. Please try again.");
  }
  const sys = (err as { code?: string })?.code;
  if (sys === "ECONNREFUSED" || sys === "ETIMEDOUT" || sys === "ENOTFOUND") {
    return unavailable("The service is temporarily unavailable. Please try again.");
  }

  const fe = err as FastifyError;
  if (typeof fe?.statusCode === "number" && fe.statusCode >= 400 && fe.statusCode < 500) {
    const codes: Record<number, string> = { 401: "unauthorized", 403: "forbidden", 404: "not_found", 413: "payload_too_large", 415: "unsupported_media_type", 429: "rate_limited" };
    const message =
      fe.code === "FST_ERR_CTP_INVALID_JSON_BODY" || fe.code === "FST_ERR_CTP_EMPTY_JSON_BODY"
        ? "The request body isn't valid JSON."
        : fe.statusCode === 413
          ? "The request is too large."
          : fe.message;
    return new HttpError(fe.statusCode, message, codes[fe.statusCode] ?? "bad_request");
  }

  return new HttpError(500, "Something went wrong on our side. Please try again.", "internal");
}

export function errorHandler(err: unknown, request: FastifyRequest, reply: FastifyReply) {
  const http = toHttpError(err);
  if (http.statusCode >= 500) {
    request.log.error({ err }, "request failed");
  } else {
    request.log.info({ code: http.code, status: http.statusCode, msg: http.message }, "request rejected");
  }
  const body: Body = {
    error: {
      code: http.code,
      message: http.message,
      ...(http.details !== undefined ? { details: http.details } : {}),
      requestId: request.id,
    },
  };
  void reply.status(http.statusCode).send(body);
}
