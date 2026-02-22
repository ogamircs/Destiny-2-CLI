import { afterAll, beforeAll, beforeEach, describe, expect, test, mock } from "bun:test";
import { existsSync } from "fs";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import type { StoredTokens } from "../../src/services/token-store.ts";

const tempRoot = `/tmp/d2cli-token-test-${process.pid}`;
const tokenPath = join(tempRoot, "tokens.json");

mock.module("../../src/services/config.ts", () => ({
  getLocalPaths: () => ({
    configDir: tempRoot,
    cacheDir: tempRoot,
    tokenPath,
    manifestDir: tempRoot,
  }),
}));

const {
  clearTokens,
  isRefreshTokenExpired,
  isTokenExpired,
  loadTokens,
  saveTokens,
} = await import("../../src/services/token-store.ts");

const sampleTokens: StoredTokens = {
  accessToken: "access",
  refreshToken: "refresh",
  accessTokenExpiresAt: Date.now() + 3600_000,
  refreshTokenExpiresAt: Date.now() + 7200_000,
  membershipId: "member",
  bungieMembershipType: 1,
  destinyMembershipId: "destiny-member",
  destinyMembershipType: 3,
  displayName: "Guardian",
};

beforeAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
  mock.restore();
});

beforeEach(async () => {
  await rm(tokenPath, { force: true });
});

describe("services/token-store", () => {
  test("returns null when token file is missing", () => {
    expect(loadTokens()).toBeNull();
  });

  test("saves and loads token payload", async () => {
    await saveTokens(sampleTokens);
    expect(existsSync(tokenPath)).toBe(true);

    const loaded = loadTokens();
    expect(loaded).not.toBeNull();
    expect(loaded?.accessToken).toBe("access");
    expect(loaded?.displayName).toBe("Guardian");
  });

  test("returns null when token file cannot be parsed", async () => {
    await Bun.write(tokenPath, "not-valid-obfuscated-content");
    expect(loadTokens()).toBeNull();
  });

  test("clearTokens removes token file", async () => {
    await saveTokens(sampleTokens);
    expect(existsSync(tokenPath)).toBe(true);
    await clearTokens();
    expect(existsSync(tokenPath)).toBe(false);
  });

  test("token expiry helpers use 60s safety margin", () => {
    const now = Date.now();
    const nearExpiry: StoredTokens = {
      ...sampleTokens,
      accessTokenExpiresAt: now + 59_000,
      refreshTokenExpiresAt: now + 59_000,
    };
    const healthy: StoredTokens = {
      ...sampleTokens,
      accessTokenExpiresAt: now + 180_000,
      refreshTokenExpiresAt: now + 180_000,
    };

    expect(isTokenExpired(nearExpiry)).toBe(true);
    expect(isRefreshTokenExpired(nearExpiry)).toBe(true);
    expect(isTokenExpired(healthy)).toBe(false);
    expect(isRefreshTokenExpired(healthy)).toBe(false);
  });
});
