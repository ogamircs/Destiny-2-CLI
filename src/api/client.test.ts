import { describe, expect, test, mock } from "bun:test";
import { API_BASE } from "../utils/constants.ts";

interface ClientTestContext {
  apiRequest: <T>(
    path: string,
    options?: { method?: string; body?: unknown; auth?: boolean }
  ) => Promise<T>;
  fetchMock: ReturnType<typeof mock>;
  getConfigMock: ReturnType<typeof mock>;
  loadTokensMock: ReturnType<typeof mock>;
  saveTokensMock: ReturnType<typeof mock>;
  isTokenExpiredMock: ReturnType<typeof mock>;
  isRefreshTokenExpiredMock: ReturnType<typeof mock>;
  refreshAccessTokenMock: ReturnType<typeof mock>;
  cleanup: () => void;
}

function bungieEnvelope<T>(response: T) {
  return {
    Response: response,
    ErrorCode: 1,
    ThrottleSeconds: 0,
    ErrorStatus: "Success",
    Message: "Ok",
    MessageData: {},
  };
}

function makeStoredTokens() {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    accessTokenExpiresAt: Date.now() + 3600_000,
    refreshTokenExpiresAt: Date.now() + 86_400_000,
    membershipId: "membership-1",
    bungieMembershipType: 254,
    destinyMembershipId: "destiny-1",
    destinyMembershipType: 3,
    displayName: "Guardian",
  };
}

async function setupClientTest(): Promise<ClientTestContext> {
  const fetchMock = mock(async () =>
    new Response(JSON.stringify(bungieEnvelope({ ok: true })), { status: 200 })
  );
  const getConfigMock = mock(() => ({
    apiKey: "test-api-key",
    clientId: "client-id",
    clientSecret: "client-secret",
    configDir: "",
    cacheDir: "",
    tokenPath: "",
    manifestDir: "",
  }));
  const loadTokensMock = mock(() => makeStoredTokens());
  const saveTokensMock = mock(async () => {});
  const isTokenExpiredMock = mock(() => false);
  const isRefreshTokenExpiredMock = mock(() => false);
  const refreshAccessTokenMock = mock(async () => ({
    access_token: "fresh-access-token",
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: "fresh-refresh-token",
    refresh_expires_in: 7_776_000,
    membership_id: "membership-1",
  }));

  mock.module("../services/config.ts", () => ({
    getConfig: getConfigMock,
    getLocalPaths: () => ({
      configDir: "",
      cacheDir: "",
      tokenPath: "",
      manifestDir: "",
    }),
    ensureDirs: async () => {},
  }));
  mock.module("../services/token-store.ts", () => ({
    loadTokens: loadTokensMock,
    saveTokens: saveTokensMock,
    isTokenExpired: isTokenExpiredMock,
    isRefreshTokenExpired: isRefreshTokenExpiredMock,
  }));
  mock.module("./auth.ts", () => ({
    refreshAccessToken: refreshAccessTokenMock,
  }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const { apiRequest } = await import(
    `./client.ts?test=${Date.now()}-${Math.random()}`
  );

  return {
    apiRequest,
    fetchMock,
    getConfigMock,
    loadTokensMock,
    saveTokensMock,
    isTokenExpiredMock,
    isRefreshTokenExpiredMock,
    refreshAccessTokenMock,
    cleanup: () => {
      globalThis.fetch = originalFetch;
      mock.restore();
    },
  };
}

describe("apiRequest", () => {
  test("sends API key and no auth header when auth=false", async () => {
    const ctx = await setupClientTest();
    try {
      const result = await ctx.apiRequest<{ ok: boolean }>("/Manifest", {
        auth: false,
      });
      expect(result).toEqual({ ok: true });

      const [url, init] = ctx.fetchMock.mock.calls[0]!;
      expect(url).toBe(`${API_BASE}/Manifest`);

      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers["X-API-Key"]).toBe("test-api-key");
      expect(headers["Authorization"]).toBeUndefined();
    } finally {
      ctx.cleanup();
    }
  });

  test("uses bearer token for authenticated requests", async () => {
    const ctx = await setupClientTest();
    try {
      await ctx.apiRequest("/SecurePath");
      const [, init] = ctx.fetchMock.mock.calls[0]!;
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer access-token");
    } finally {
      ctx.cleanup();
    }
  });

  test("refreshes access token and saves it when expired", async () => {
    const ctx = await setupClientTest();
    try {
      ctx.isTokenExpiredMock.mockReturnValue(true);
      ctx.isRefreshTokenExpiredMock.mockReturnValue(false);

      await ctx.apiRequest("/SecurePath");

      expect(ctx.refreshAccessTokenMock).toHaveBeenCalledWith("refresh-token");
      expect(ctx.saveTokensMock).toHaveBeenCalledTimes(1);

      const [savedTokens] = ctx.saveTokensMock.mock.calls[0]!;
      const saved = savedTokens as Record<string, unknown>;
      expect(saved["accessToken"]).toBe("fresh-access-token");
      expect(saved["refreshToken"]).toBe("fresh-refresh-token");

      const [, init] = ctx.fetchMock.mock.calls[0]!;
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer fresh-access-token");
    } finally {
      ctx.cleanup();
    }
  });

  test("throws auth error when no tokens are available", async () => {
    const ctx = await setupClientTest();
    try {
      ctx.loadTokensMock.mockReturnValue(null);
      await expect(ctx.apiRequest("/SecurePath")).rejects.toThrow(
        "Not logged in. Run: destiny auth login"
      );
      expect(ctx.fetchMock).not.toHaveBeenCalled();
    } finally {
      ctx.cleanup();
    }
  });

  test("throws auth error when refresh token is expired", async () => {
    const ctx = await setupClientTest();
    try {
      ctx.isTokenExpiredMock.mockReturnValue(true);
      ctx.isRefreshTokenExpiredMock.mockReturnValue(true);

      await expect(ctx.apiRequest("/SecurePath")).rejects.toThrow(
        "Session expired. Please re-login: destiny auth login"
      );
      expect(ctx.fetchMock).not.toHaveBeenCalled();
    } finally {
      ctx.cleanup();
    }
  });

  test("throws rate limit error for HTTP 429", async () => {
    const ctx = await setupClientTest();
    try {
      ctx.fetchMock.mockResolvedValue(
        new Response("", {
          status: 429,
          headers: { "Retry-After": "9" },
        })
      );

      await expect(ctx.apiRequest("/RateLimited", { auth: false })).rejects.toMatchObject({
        name: "RateLimitError",
        retryAfter: 9,
      });
    } finally {
      ctx.cleanup();
    }
  });

  test("throws API error for non-OK HTTP responses", async () => {
    const ctx = await setupClientTest();
    try {
      ctx.fetchMock.mockResolvedValue(new Response("server exploded", { status: 500 }));

      await expect(ctx.apiRequest("/Broken", { auth: false })).rejects.toMatchObject({
        name: "ApiError",
        statusCode: 500,
      });
    } finally {
      ctx.cleanup();
    }
  });

  test("throws rate limit error when Bungie response has throttle seconds", async () => {
    const ctx = await setupClientTest();
    try {
      ctx.fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            Response: null,
            ErrorCode: 36,
            ThrottleSeconds: 4,
            ErrorStatus: "ThrottleLimitExceeded",
            Message: "Slow down",
            MessageData: {},
          }),
          { status: 200 }
        )
      );

      await expect(ctx.apiRequest("/Throttle", { auth: false })).rejects.toMatchObject({
        name: "RateLimitError",
        retryAfter: 4,
      });
    } finally {
      ctx.cleanup();
    }
  });

  test("throws API error when Bungie returns non-success error code", async () => {
    const ctx = await setupClientTest();
    try {
      ctx.fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            Response: null,
            ErrorCode: 123,
            ThrottleSeconds: 0,
            ErrorStatus: "InvalidParameters",
            Message: "Bad query",
            MessageData: {},
          }),
          { status: 200 }
        )
      );

      await expect(ctx.apiRequest("/Invalid", { auth: false })).rejects.toMatchObject({
        name: "ApiError",
        statusCode: 200,
        errorCode: 123,
      });
    } finally {
      ctx.cleanup();
    }
  });
});
