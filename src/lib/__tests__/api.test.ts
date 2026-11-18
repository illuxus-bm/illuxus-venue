import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  getAccessToken: vi.fn<() => Promise<string | null>>(),
  refresh: vi.fn<() => Promise<boolean>>(),
  signOut: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock, AUTH_PROVIDER: "local" }));

import { ApiError, del, get, patch, post, put, NETWORK_ERROR_MESSAGE } from "@/lib/api";
import { shouldRetryQuery } from "@/lib/queryRetry";

const fetchMock = vi.fn<typeof fetch>();

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function sentAuthHeader(call: number): string | undefined {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  authMock.getAccessToken.mockReset().mockResolvedValue("tok-1");
  authMock.refresh.mockReset().mockResolvedValue(false);
  authMock.signOut.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("api client: requests", () => {
  it("prefixes /api, attaches the bearer token and serialises query + body", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: "v1" }));
    const res = await post<{ id: string }>("/me/venues", { name: "Hall" }, {
      query: { a: 1, skip: undefined },
    });
    expect(res).toEqual({ id: "v1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/me/venues?a=1");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Hall" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(sentAuthHeader(0)).toBe("Bearer tok-1");
  });

  it("uses the right verbs for the helpers", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    await get("/x");
    await patch("/x", {});
    await put("/x", {});
    await del("/x");
    expect(fetchMock.mock.calls.map((c) => (c[1] as RequestInit).method)).toEqual([
      "GET",
      "PATCH",
      "PUT",
      "DELETE",
    ]);
  });

  it("omits the token for public reads (auth: false)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, []));
    await get("/public/venues", { auth: false });
    expect(sentAuthHeader(0)).toBeUndefined();
    expect(authMock.getAccessToken).not.toHaveBeenCalled();
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(del("/me/venues/1")).resolves.toBeUndefined();
  });

  it("returns undefined for an empty 200 body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
    await expect(post("/me/inbox/rfqs/1/decline")).resolves.toBeUndefined();
  });
});

describe("api client: errors", () => {
  it("parses the error envelope into an ApiError", async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        error: {
          code: "bad_request",
          message: "City is required",
          details: [{ path: "city", message: "Required" }],
          requestId: "req-42",
        },
      }),
    );
    const err = await get("/me/venues").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: "bad_request",
      message: "City is required",
      details: [{ path: "city", message: "Required" }],
      requestId: "req-42",
    });
  });

  it("falls back to a status-based code/message when the body isn't the envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>Bad gateway</html>", {
        status: 502,
        headers: { "x-request-id": "edge-1" },
      }),
    );
    const err = (await get("/me").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("server_error");
    expect(err.message).toMatch(/try again/i);
    expect(err.requestId).toBe("edge-1");
  });

  it("maps 409 without an envelope to code conflict", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 409 }));
    const err = (await post("/me/quotes", {}).catch((e) => e)) as ApiError;
    expect(err.status).toBe(409);
    expect(err.code).toBe("conflict");
  });

  it("maps a network failure to status 0 / code network with a friendly message", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = (await get("/me").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe("network");
    expect(err.message).toBe(NETWORK_ERROR_MESSAGE);
    expect(err.message).toBe("You're offline or the server can't be reached.");
  });

  it("times out after 20s as a network error", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const pending = get("/me").catch((e) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    const err = (await pending) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe("network");
  });

  it("maps an invalid JSON success body to an ApiError", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    const err = (await get("/me").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("bad_response");
  });

  it("never throws a non-ApiError, even if the auth layer throws", async () => {
    authMock.getAccessToken.mockRejectedValueOnce(new Error("boom"));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await expect(get("/me")).resolves.toEqual({ ok: true });
    expect(sentAuthHeader(0)).toBeUndefined();
  });
});

describe("api client: 401 handling", () => {
  const unauthorized = () =>
    json(401, { error: { code: "unauthorized", message: "Token expired", requestId: "r" } });

  it("refreshes once and retries with the new token", async () => {
    authMock.getAccessToken.mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    authMock.refresh.mockResolvedValueOnce(true);
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json(200, { ok: 1 }));

    await expect(get("/me")).resolves.toEqual({ ok: 1 });
    expect(authMock.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentAuthHeader(0)).toBe("Bearer old");
    expect(sentAuthHeader(1)).toBe("Bearer new");
    expect(authMock.signOut).not.toHaveBeenCalled();
  });

  it("signs out when the refresh fails", async () => {
    authMock.refresh.mockResolvedValueOnce(false);
    fetchMock.mockResolvedValueOnce(unauthorized());

    const err = (await get("/me").catch((e) => e)) as ApiError;
    expect(err.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authMock.signOut).toHaveBeenCalledTimes(1);
  });

  it("signs out when the retry is still 401 (and retries only once)", async () => {
    authMock.getAccessToken.mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    authMock.refresh.mockResolvedValueOnce(true);
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized());

    const err = (await get("/me").catch((e) => e)) as ApiError;
    expect(err.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authMock.refresh).toHaveBeenCalledTimes(1);
    expect(authMock.signOut).toHaveBeenCalledTimes(1);
  });

  it("doesn't refresh or sign out when no token was sent", async () => {
    authMock.getAccessToken.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValueOnce(unauthorized());
    const err = (await get("/me").catch((e) => e)) as ApiError;
    expect(err.status).toBe(401);
    expect(authMock.refresh).not.toHaveBeenCalled();
    expect(authMock.signOut).not.toHaveBeenCalled();
  });

  it("doesn't touch the session on other 4xx errors", async () => {
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: "not_a_vendor", message: "No" } }));
    const err = (await get("/me/venues").catch((e) => e)) as ApiError;
    expect(err.code).toBe("not_a_vendor");
    expect(authMock.refresh).not.toHaveBeenCalled();
    expect(authMock.signOut).not.toHaveBeenCalled();
  });
});

describe("query retry policy", () => {
  it("never retries 4xx ApiErrors", () => {
    for (const status of [400, 401, 403, 404, 409, 429, 499]) {
      expect(shouldRetryQuery(0, new ApiError(status, "x", "x"))).toBe(false);
    }
  });

  it("retries network and 5xx errors up to twice", () => {
    for (const status of [0, 500, 503]) {
      const err = new ApiError(status, "x", "x");
      expect(shouldRetryQuery(0, err)).toBe(true);
      expect(shouldRetryQuery(1, err)).toBe(true);
      expect(shouldRetryQuery(2, err)).toBe(false);
    }
  });
});
