import { afterAll, afterEach, beforeEach, describe, expect, test, mock } from "bun:test";
import { ApiError, AuthError, RateLimitError } from "../../src/utils/errors.ts";

let currentTokens: any = {
  accessToken: "tok-1",
  refreshToken: "refresh-1",
  accessTokenExpiresAt: 0,
  refreshTokenExpiresAt: 0,
};
let tokenExpired = false;
let refreshExpired = false;
const savedTokens: any[] = [];

const refreshAccessTokenMock = mock(async () => ({
  access_token: "tok-2",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "refresh-2",
  refresh_expires_in: 7200,
  membership_id: "m",
}));

mock.module("../../src/services/config.ts", () => ({
  getConfig: () => ({ apiKey: "api-key" }),
}));

mock.module("../../src/services/token-store.ts", () => ({
  loadTokens: () => currentTokens,
  saveTokens: async (tokens: any) => {
    savedTokens.push(tokens);
  },
  isTokenExpired: () => tokenExpired,
  isRefreshTokenExpired: () => refreshExpired,
}));

mock.module("../../src/api/auth.ts", () => ({
  refreshAccessToken: refreshAccessTokenMock,
}));

const { apiRequest } = await import("../../src/api/client.ts");

const originalFetch = globalThis.fetch;

beforeEach(() => {
  currentTokens = {
    accessToken: "tok-1",
    refreshToken: "refresh-1",
    accessTokenExpiresAt: Date.now() + 10_000,
    refreshTokenExpiresAt: Date.now() + 20_000,
  };
  tokenExpired = false;
  refreshExpired = false;
  savedTokens.length = 0;
  refreshAccessTokenMock.mockClear();
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  mock.restore();
});

describe("api/client apiRequest", () => {
  test("sends unauthenticated request when auth=false", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, reqInit?: RequestInit) => {
      init = reqInit;
      return new Response(
        JSON.stringify({
          Response: { ok: true },
          ErrorCode: 1,
          ThrottleSeconds: 0,
          ErrorStatus: "Success",
          Message: "OK",
          MessageData: {},
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const res = await apiRequest<{ ok: boolean }>("/Destiny2/Manifest/", {
      auth: false,
    });
    expect(res.ok).toBe(true);
    expect(init?.headers).toEqual({ "X-API-Key": "api-key" });
  });

  test("throws when auth is required but no tokens exist", async () => {
    currentTokens = null;
    await expect(apiRequest("/foo")).rejects.toBeInstanceOf(AuthError);
  });

  test("adds bearer token when authenticated", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, reqInit?: RequestInit) => {
      init = reqInit;
      return new Response(
        JSON.stringify({
          Response: { ok: true },
          ErrorCode: 1,
          ThrottleSeconds: 0,
          ErrorStatus: "Success",
          Message: "OK",
          MessageData: {},
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    await apiRequest("/foo");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok-1");
  });

  test("refreshes tokens when access token is expired", async () => {
    tokenExpired = true;
    refreshExpired = false;

    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, reqInit?: RequestInit) => {
      init = reqInit;
      return new Response(
        JSON.stringify({
          Response: { ok: true },
          ErrorCode: 1,
          ThrottleSeconds: 0,
          ErrorStatus: "Success",
          Message: "OK",
          MessageData: {},
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    await apiRequest("/foo");

    expect(refreshAccessTokenMock).toHaveBeenCalledWith("refresh-1");
    expect(savedTokens.length).toBe(1);
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok-2");
  });

  test("throws when both access and refresh tokens are expired", async () => {
    tokenExpired = true;
    refreshExpired = true;
    await expect(apiRequest("/foo")).rejects.toBeInstanceOf(AuthError);
  });

  test("throws RateLimitError on 429 response", async () => {
    globalThis.fetch = (async () => {
      return new Response("Too many requests", {
        status: 429,
        headers: { "Retry-After": "12" },
      });
    }) as typeof fetch;

    await expect(apiRequest("/foo")).rejects.toBeInstanceOf(RateLimitError);
  });

  test("throws ApiError on non-ok response", async () => {
    globalThis.fetch = (async () => new Response("Bad gateway", { status: 502 })) as typeof fetch;
    await expect(apiRequest("/foo")).rejects.toBeInstanceOf(ApiError);
  });

  test("throws RateLimitError when Bungie payload includes throttle", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          Response: {},
          ErrorCode: 99,
          ThrottleSeconds: 3,
          ErrorStatus: "Throttled",
          Message: "slow down",
          MessageData: {},
        }),
        { status: 200 }
      )) as typeof fetch;

    await expect(apiRequest("/foo")).rejects.toBeInstanceOf(RateLimitError);
  });

  test("throws ApiError when Bungie payload ErrorCode is not success", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          Response: {},
          ErrorCode: 50,
          ThrottleSeconds: 0,
          ErrorStatus: "Failed",
          Message: "nope",
          MessageData: {},
        }),
        { status: 200 }
      )) as typeof fetch;

    await expect(apiRequest("/foo")).rejects.toBeInstanceOf(ApiError);
  });
});
