import { ApiError } from "@/lib/api";

const MAX_RETRIES = 2;

/**
 * TanStack Query `retry` policy: client errors (400–499: validation, auth,
 * not found, conflict, rate limit) are final; offline / timeout (status 0)
 * and 5xx are retried up to twice.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status >= 400 && error.status < 500) return false;
    return failureCount < MAX_RETRIES;
  }
  return failureCount < MAX_RETRIES;
}
