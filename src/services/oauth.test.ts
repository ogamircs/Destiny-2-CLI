import { describe, expect, test } from "bun:test";
import { AUTH_URL } from "../utils/constants.ts";
import { AuthError } from "../utils/errors.ts";
import { assertOAuthState, buildAuthorizeUrl, escapeHtml } from "./oauth.ts";

describe("oauth helpers", () => {
  test("buildAuthorizeUrl includes the client id and state", () => {
    const url = new URL(buildAuthorizeUrl("client-1", "state-1"));
    expect(url.origin + url.pathname).toBe(AUTH_URL);
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  test("assertOAuthState rejects a missing or different state", () => {
    expect(() => assertOAuthState("expected", "expected")).not.toThrow();
    expect(() => assertOAuthState("expected", null)).toThrow(AuthError);
    expect(() => assertOAuthState("expected", "other")).toThrow(
      "OAuth state mismatch"
    );
  });

  test("escapeHtml encodes markup in display names", () => {
    expect(escapeHtml(`<b>"A&B"</b>`)).toBe("&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;");
  });
});
