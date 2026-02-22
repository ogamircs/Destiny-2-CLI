import { afterAll, afterEach, beforeEach, describe, expect, test, mock } from "bun:test";
import { AuthError } from "../../src/utils/errors.ts";

mock.module("../../src/services/config.ts", () => ({
  getConfig: () => ({
    apiKey: "api-key",
    clientId: "client-id",
    clientSecret: "client-secret",
  }),
}));

const { exchangeCode, refreshAccessToken } = await import(
  "../../src/api/auth.ts"
);

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  mock.restore();
});

describe("api/auth", () => {
  test("exchangeCode posts form data and returns token response", async () => {
    let calledUrl = "";
    let calledInit: RequestInit | undefined;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calledUrl = String(url);
      calledInit = init;
      return new Response(
        JSON.stringify({
          access_token: "a",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "r",
          refresh_expires_in: 7200,
          membership_id: "123",
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const res = await exchangeCode("auth-code");
    expect(calledUrl).toContain("/Platform/App/OAuth/Token/");
    expect(calledInit?.method).toBe("POST");
    expect(calledInit?.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(String(calledInit?.body)).toContain("grant_type=authorization_code");
    expect(String(calledInit?.body)).toContain("code=auth-code");
    expect(String(calledInit?.body)).toContain("client_id=client-id");
    expect(res.access_token).toBe("a");
  });

  test("exchangeCode throws AuthError on non-200", async () => {
    globalThis.fetch = (async () => {
      return new Response("denied", { status: 400 });
    }) as typeof fetch;

    await expect(exchangeCode("bad-code")).rejects.toBeInstanceOf(AuthError);
  });

  test("refreshAccessToken posts refresh token and returns data", async () => {
    let body = "";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(
        JSON.stringify({
          access_token: "new-a",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "new-r",
          refresh_expires_in: 7200,
          membership_id: "123",
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const res = await refreshAccessToken("refresh-1");
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=refresh-1");
    expect(res.refresh_token).toBe("new-r");
  });

  test("refreshAccessToken throws AuthError on non-200", async () => {
    globalThis.fetch = (async () => {
      return new Response("expired", { status: 401 });
    }) as typeof fetch;

    await expect(refreshAccessToken("bad-refresh")).rejects.toBeInstanceOf(
      AuthError
    );
  });
});
