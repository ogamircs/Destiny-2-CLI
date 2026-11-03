import { AUTH_URL } from "../utils/constants.ts";
import { AuthError } from "../utils/errors.ts";

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
