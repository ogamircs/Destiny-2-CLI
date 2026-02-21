import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { StoredTokens } from "./token-store.ts";

const FIXED_NOW = new Date("2025-01-01T00:00:00.000Z").getTime();
const realDateNow = Date.now;

function makeTokens(
  accessTokenExpiresAt: number,
  refreshTokenExpiresAt: number
): StoredTokens {
  return {
    accessToken: "access",
    refreshToken: "refresh",
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    membershipId: "1",
    bungieMembershipType: 3,
    destinyMembershipId: "2",
    destinyMembershipType: 3,
    displayName: "Guardian",
  };
}

beforeEach(() => {
  Date.now = () => FIXED_NOW;
});

afterEach(() => {
  Date.now = realDateNow;
});

async function importFreshTokenStore() {
  return import(`./token-store.ts?test=${Date.now()}-${Math.random()}`);
}

describe("token expiry checks", () => {
  test("marks access token expired when within 60s safety margin", async () => {
    const { isTokenExpired } = await importFreshTokenStore();
    const tokens = makeTokens(FIXED_NOW + 59_000, FIXED_NOW + 600_000);
    expect(isTokenExpired(tokens)).toBe(true);
  });

  test("does not mark access token expired when outside safety margin", async () => {
    const { isTokenExpired } = await importFreshTokenStore();
    const tokens = makeTokens(FIXED_NOW + 61_000, FIXED_NOW + 600_000);
    expect(isTokenExpired(tokens)).toBe(false);
  });

  test("marks refresh token expired when within 60s safety margin", async () => {
    const { isRefreshTokenExpired } = await importFreshTokenStore();
    const tokens = makeTokens(FIXED_NOW + 600_000, FIXED_NOW + 30_000);
    expect(isRefreshTokenExpired(tokens)).toBe(true);
  });

  test("does not mark refresh token expired when outside safety margin", async () => {
    const { isRefreshTokenExpired } = await importFreshTokenStore();
    const tokens = makeTokens(FIXED_NOW + 600_000, FIXED_NOW + 120_000);
    expect(isRefreshTokenExpired(tokens)).toBe(false);
  });
});
