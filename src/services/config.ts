import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".config", "destiny-cli");
const CACHE_DIR = join(homedir(), ".cache", "destiny-cli");

export interface AppConfig {
  apiKey: string;
  clientId: string;
  clientSecret: string;
  configDir: string;
  cacheDir: string;
  tokenPath: string;
  manifestDir: string;
}

export interface LocalPaths {
  configDir: string;
  cacheDir: string;
  tokenPath: string;
  manifestDir: string;
}

// Always-available paths (no API keys required)
export function getLocalPaths(): LocalPaths {
  return {
    configDir: CONFIG_DIR,
    cacheDir: CACHE_DIR,
    tokenPath: join(CONFIG_DIR, "tokens.json"),
    manifestDir: CACHE_DIR,
  };
}

let cachedConfig: AppConfig | null = null;

// Full config (requires API keys — throws if missing)
export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const apiKey = process.env.BUNGIE_API_KEY;
  const clientId = process.env.BUNGIE_CLIENT_ID;
  const clientSecret = process.env.BUNGIE_CLIENT_SECRET;

  if (!apiKey || !clientId || !clientSecret) {
    const missing = [];
    if (!apiKey) missing.push("BUNGIE_API_KEY");
    if (!clientId) missing.push("BUNGIE_CLIENT_ID");
    if (!clientSecret) missing.push("BUNGIE_CLIENT_SECRET");
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}.\n` +
        `Set them in your shell or create a .env file. See .env.example.`
    );
  }

  cachedConfig = {
    apiKey,
    clientId,
    clientSecret,
    ...getLocalPaths(),
  };

  return cachedConfig;
}

export async function ensureDirs() {
  const paths = getLocalPaths();
  await Bun.write(join(paths.configDir, ".keep"), "");
  await Bun.write(join(paths.cacheDir, ".keep"), "");
}
