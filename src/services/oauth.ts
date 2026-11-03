import { AUTH_URL } from "../utils/constants.ts";
import { AuthError } from "../utils/errors.ts";

export const DEFAULT_OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

export function oauthTimeoutMs(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.DESTINY_OAUTH_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_OAUTH_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1_000) return DEFAULT_OAUTH_TIMEOUT_MS;
  return parsed;
}

export function createOAuthState(): string {
  return crypto.randomUUID();
}

export function buildAuthorizeUrl(clientId: string, state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

export function assertOAuthState(expected: string, actual: string | null): void {
  if (!actual || actual !== expected) {
    throw new AuthError("OAuth state mismatch. Refusing the login callback.");
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
