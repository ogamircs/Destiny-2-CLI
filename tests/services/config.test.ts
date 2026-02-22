import { afterAll, beforeAll, describe, expect, test, mock } from "bun:test";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import { join } from "path";

const fakeHome = `/tmp/d2cli-config-test-${process.pid}`;

mock.module("os", () => ({
  homedir: () => fakeHome,
}));

const { ensureDirs, getConfig, getLocalPaths } = await import(
  "../../src/services/config.ts"
);

const originalEnv = {
  apiKey: process.env.BUNGIE_API_KEY,
  clientId: process.env.BUNGIE_CLIENT_ID,
  clientSecret: process.env.BUNGIE_CLIENT_SECRET,
};

beforeAll(async () => {
  await rm(fakeHome, { recursive: true, force: true });
});

afterAll(async () => {
  process.env.BUNGIE_API_KEY = originalEnv.apiKey;
  process.env.BUNGIE_CLIENT_ID = originalEnv.clientId;
  process.env.BUNGIE_CLIENT_SECRET = originalEnv.clientSecret;
  await rm(fakeHome, { recursive: true, force: true });
  mock.restore();
});

describe("services/config", () => {
  test("returns local config/cache paths from home directory", () => {
    const paths = getLocalPaths();
    expect(paths.configDir).toBe(join(fakeHome, ".config", "destiny-cli"));
    expect(paths.cacheDir).toBe(join(fakeHome, ".cache", "destiny-cli"));
    expect(paths.tokenPath).toBe(
      join(fakeHome, ".config", "destiny-cli", "tokens.json")
    );
  });

  test("getConfig reads env credentials", () => {
    process.env.BUNGIE_API_KEY = "k";
    process.env.BUNGIE_CLIENT_ID = "id";
    process.env.BUNGIE_CLIENT_SECRET = "secret";

    const config = getConfig();
    expect(config.apiKey).toBe("k");
    expect(config.clientId).toBe("id");
    expect(config.clientSecret).toBe("secret");
  });

  test("ensureDirs creates config/cache keep files", async () => {
    await ensureDirs();
    expect(
      existsSync(join(fakeHome, ".config", "destiny-cli", ".keep"))
    ).toBe(true);
    expect(
      existsSync(join(fakeHome, ".cache", "destiny-cli", ".keep"))
    ).toBe(true);
  });
});
