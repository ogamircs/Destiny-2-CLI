import { afterEach, describe, expect, test } from "bun:test";
import { homedir } from "os";
import { join } from "path";

const ENV_KEYS = [
  "BUNGIE_API_KEY",
  "BUNGIE_CLIENT_ID",
  "BUNGIE_CLIENT_SECRET",
] as const;

const originalEnv: Record<string, string | undefined> = {
  BUNGIE_API_KEY: process.env.BUNGIE_API_KEY,
  BUNGIE_CLIENT_ID: process.env.BUNGIE_CLIENT_ID,
  BUNGIE_CLIENT_SECRET: process.env.BUNGIE_CLIENT_SECRET,
};

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function importFreshConfig() {
  return import(`./config.ts?test=${Date.now()}-${Math.random()}`);
}

afterEach(() => {
  restoreEnv();
});

describe("config", () => {
  test("returns expected local paths", async () => {
    const { getLocalPaths } = await importFreshConfig();
    const paths = getLocalPaths();
    const expectedConfigDir = join(homedir(), ".config", "destiny-cli");
    const expectedCacheDir = join(homedir(), ".cache", "destiny-cli");

    expect(paths.configDir).toBe(expectedConfigDir);
    expect(paths.cacheDir).toBe(expectedCacheDir);
    expect(paths.tokenPath).toBe(join(expectedConfigDir, "tokens.json"));
    expect(paths.manifestDir).toBe(expectedCacheDir);
  });

  test("throws when required environment variables are missing", async () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    const { getConfig } = await importFreshConfig();

    expect(() => getConfig()).toThrow(
      "Missing environment variables: BUNGIE_API_KEY, BUNGIE_CLIENT_ID, BUNGIE_CLIENT_SECRET."
    );
  });

  test("builds config from env vars and caches first result", async () => {
    process.env.BUNGIE_API_KEY = "key-1";
    process.env.BUNGIE_CLIENT_ID = "client-1";
    process.env.BUNGIE_CLIENT_SECRET = "secret-1";

    const { getConfig } = await importFreshConfig();
    const first = getConfig();

    process.env.BUNGIE_API_KEY = "key-2";
    process.env.BUNGIE_CLIENT_ID = "client-2";
    process.env.BUNGIE_CLIENT_SECRET = "secret-2";

    const second = getConfig();

    expect(second).toBe(first);
    expect(second.apiKey).toBe("key-1");
    expect(second.clientId).toBe("client-1");
    expect(second.clientSecret).toBe("secret-1");
  });
});
