import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLocalAuth, STORAGE_KEY, type StoredSession, type TokenPair } from "@/lib/auth/local";

const fetchMock = vi.fn<typeof fetch>();

function pair(n: number, expiresIn = 3600): TokenPair {
  return {
    access_token: `access-${n}`,
    token_type: "bearer",
    expires_in: expiresIn,
    refresh_token: `refresh-${n}`,
    user: { id: "u1", email: "v@example.com" },
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stored(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredSession) : null;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("local auth", () => {
  it("signs in, persists the session and notifies listeners", async () => {
    const auth = createLocalAuth({ jitterMs: 0 });
    const seen: Array<string | null> = [];
    auth.onChange((u) => seen.push(u?.id ?? null));
    fetchMock.mockResolvedValueOnce(json(200, pair(1)));

    const { error } = await auth.signIn("v@example.com", "pw");
    expect(error).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/login");
    expect(auth.getUser()).toEqual({ id: "u1", email: "v@example.com" });
    expect(seen).toEqual(["u1"]);
    expect(stored()?.refresh_token).toBe("refresh-1");
    await expect(auth.getAccessToken()).resolves.toBe("access-1");
  });

  it("returns the API's message on a failed sign-in", async () => {
    const auth = createLocalAuth();
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: "unauthorized", message: "Invalid email or password." } }),
    );
    const { error } = await auth.signIn("v@example.com", "bad");
    expect(error?.message).toBe("Invalid email or password.");
    expect(auth.getUser()).toBeNull();
  });

  it("restores a persisted session", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        access_token: "a",
        refresh_token: "r",
        expires_at: Date.now() + 3_600_000,
        user: { id: "u9", email: null },
      }),
    );
    const auth = createLocalAuth();
    await auth.ready();
    expect(auth.getUser()).toEqual({ id: "u9", email: null });
    await expect(auth.getAccessToken()).resolves.toBe("a");
  });

  it("refreshes an expiring token on demand and dedupes concurrent refreshes", async () => {
    vi.useFakeTimers(); // keep the proactive timer out of the race
    const auth = createLocalAuth({ jitterMs: 0 });
    fetchMock.mockResolvedValueOnce(json(200, pair(1, 30))); // expires within the margin
    await auth.signIn("v@example.com", "pw");

    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (release = r)));
    const a = auth.getAccessToken();
    const b = auth.refresh();
    const c = auth.refresh();
    await Promise.resolve();
    release(json(200, pair(2)));

    await expect(a).resolves.toBe("access-2");
    await expect(b).resolves.toBe(true);
    await expect(c).resolves.toBe(true);
    const refreshCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/auth/refresh");
    expect(refreshCalls).toHaveLength(1);
    expect(JSON.parse((refreshCalls[0][1] as RequestInit).body as string)).toEqual({
      refresh_token: "refresh-1",
    });
    expect(stored()?.refresh_token).toBe("refresh-2");
  });

  it("proactively refreshes ~60s before expiry", async () => {
    vi.useFakeTimers();
    const auth = createLocalAuth({ jitterMs: 0 });
    fetchMock.mockResolvedValueOnce(json(200, pair(1, 120)));
    await auth.signIn("v@example.com", "pw");

    fetchMock.mockResolvedValueOnce(json(200, pair(2)));
    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/refresh");
    await expect(auth.getAccessToken()).resolves.toBe("access-2");
    await auth.signOut();
  });

  it("clears the session when the refresh token is rejected", async () => {
    const auth = createLocalAuth({ jitterMs: 0 });
    fetchMock.mockResolvedValueOnce(json(200, pair(1)));
    await auth.signIn("v@example.com", "pw");
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: "unauthorized", message: "x" } }));

    await expect(auth.refresh()).resolves.toBe(false);
    expect(auth.getUser()).toBeNull();
    expect(stored()).toBeNull();
  });

  it("keeps the session when the refresh fails for network reasons", async () => {
    const auth = createLocalAuth({ jitterMs: 0 });
    fetchMock.mockResolvedValueOnce(json(200, pair(1)));
    await auth.signIn("v@example.com", "pw");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(auth.refresh()).resolves.toBe(false);
    expect(auth.getUser()?.id).toBe("u1");
    await auth.signOut();
  });

  it("signs out locally and revokes the refresh token", async () => {
    const auth = createLocalAuth({ jitterMs: 0 });
    fetchMock.mockResolvedValueOnce(json(200, pair(1)));
    await auth.signIn("v@example.com", "pw");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await auth.signOut();
    expect(auth.getUser()).toBeNull();
    expect(stored()).toBeNull();
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/auth/logout");
    expect(JSON.parse(init.body as string)).toEqual({ refresh_token: "refresh-1" });
  });

  it("follows sign-in / sign-out in other tabs via the storage event", () => {
    const auth = createLocalAuth({ jitterMs: 0 });
    const seen: Array<string | null> = [];
    auth.onChange((u) => seen.push(u?.id ?? null));

    const other: StoredSession = {
      access_token: "a",
      refresh_token: "r",
      expires_at: Date.now() + 3_600_000,
      user: { id: "u2", email: "o@example.com" },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(other));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    expect(auth.getUser()?.id).toBe("u2");

    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    expect(auth.getUser()).toBeNull();
    expect(seen).toEqual(["u2", null]);
  });
});
