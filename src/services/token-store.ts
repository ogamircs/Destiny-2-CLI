import { existsSync, readFileSync } from "fs";
import { unlink } from "fs/promises";
import { getLocalPaths } from "./config.ts";
import { debug } from "../utils/logger.ts";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // epoch ms
  refreshTokenExpiresAt: number; // epoch ms
  membershipId: string;
  bungieMembershipType: number;
  destinyMembershipId: string;
  destinyMembershipType: number;
  displayName: string;
}

// Simple obfuscation key derived from machine-specific data.
// Not cryptographically secure — just prevents casual reading of tokens on disk.
function getObfuscationKey(): string {
  return `destiny-cli-${process.env.USER || "default"}-${process.arch}`;
}

function xorObfuscate(data: string, key: string): string {
  const keyBytes = new TextEncoder().encode(key);
  const dataBytes = new TextEncoder().encode(data);
  const result = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    result[i] = dataBytes[i]! ^ keyBytes[i % keyBytes.length]!;
  }
  return Buffer.from(result).toString("base64");
}

function xorDeobfuscate(encoded: string, key: string): string {
  const keyBytes = new TextEncoder().encode(key);
  const dataBytes = Buffer.from(encoded, "base64");
  const result = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    result[i] = dataBytes[i]! ^ keyBytes[i % keyBytes.length]!;
  }
  return new TextDecoder().decode(result);
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  const config = getLocalPaths();
  const key = getObfuscationKey();
  const json = JSON.stringify(tokens);
  const encrypted = xorObfuscate(json, key);
  await Bun.write(config.tokenPath, encrypted);
  debug("Tokens saved to", config.tokenPath);
}

export function loadTokens(): StoredTokens | null {
  const config = getLocalPaths();
  if (!existsSync(config.tokenPath)) {
    return null;
  }
  try {
    const encrypted = readFileSync(config.tokenPath, "utf-8");
    const key = getObfuscationKey();
    const json = xorDeobfuscate(encrypted, key);
    return JSON.parse(json) as StoredTokens;
  } catch (err) {
    debug("Failed to load tokens:", err);
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  const config = getLocalPaths();
  if (existsSync(config.tokenPath)) {
    await unlink(config.tokenPath);
    debug("Tokens cleared");
  }
}

export function isTokenExpired(tokens: StoredTokens): boolean {
  // Consider expired 60s before actual expiry for safety margin
  return Date.now() >= tokens.accessTokenExpiresAt - 60_000;
}

export function isRefreshTokenExpired(tokens: StoredTokens): boolean {
  return Date.now() >= tokens.refreshTokenExpiresAt - 60_000;
}
