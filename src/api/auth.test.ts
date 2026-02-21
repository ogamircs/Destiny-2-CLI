import { describe, expect, test, mock } from "bun:test";
import { TOKEN_URL } from "../utils/constants.ts";

async function setupAuthTest() {
  const getConfigMock = mock(() => ({
    apiKey: "api-key",
    clientId: "client-id",
    clientSecret: "client-secret",
    configDir: "",
    cacheDir: "",
    tokenPath: "",
    manifestDir: "",
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

  const mod = await import(`./auth.ts?test=${Date.now()}-${Math.random()}`);
  return {
    ...mod,
    getConfigMock,
    cleanup: () => mock.restore(),
  };
}

describe("auth API", () => {
  test("exchanges auth code for tokens", async () => {
    const ctx = await setupAuthTest();
    const fetchMock = mock(async () => {
      return new Response(
        JSON.stringify({
          access_token: "new-access",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "new-refresh",
          refresh_expires_in: 7_776_000,
          membership_id: "123",
        }),
        { status: 200 }
      );
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await ctx.exchangeCode("auth-code");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(TOKEN_URL);
      expect((init as RequestInit).method).toBe("POST");
      expect((init as RequestInit).headers).toEqual({
        "Content-Type": "application/x-www-form-urlencoded",
      });

      const body = String((init as RequestInit).body);
      const params = new URLSearchParams(body);
      expect(params.get("grant_type")).toBe("authorization_code");
      expect(params.get("code")).toBe("auth-code");
      expect(params.get("client_id")).toBe("client-id");
      expect(params.get("client_secret")).toBe("client-secret");
      expect(result.access_token).toBe("new-access");
    } finally {
      globalThis.fetch = originalFetch;
      ctx.cleanup();
    }
  });

  test("throws useful error when exchange fails", async () => {
    const ctx = await setupAuthTest();
    const fetchMock = mock(async () => new Response("invalid code", { status: 401 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(ctx.exchangeCode("bad-code")).rejects.toThrow(
        "Token exchange failed (401): invalid code"
      );
    } finally {
      globalThis.fetch = originalFetch;
      ctx.cleanup();
    }
  });

  test("throws re-login guidance when refresh fails", async () => {
    const ctx = await setupAuthTest();
    const fetchMock = mock(async () => new Response("denied", { status: 400 }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(ctx.refreshAccessToken("refresh-token")).rejects.toThrow(
        "Token refresh failed (400). Please re-login with: destiny auth login"
      );
    } finally {
      globalThis.fetch = originalFetch;
      ctx.cleanup();
    }
  });
});
