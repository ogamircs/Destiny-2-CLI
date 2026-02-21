import { TOKEN_URL } from "../utils/constants.ts";
import { getConfig } from "../services/config.ts";
import { AuthError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  membership_id: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const config = getConfig();
  debug("Exchanging auth code for tokens");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    debug("Token exchange failed:", res.status, text);
    throw new AuthError(`Token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  const config = getConfig();
  debug("Refreshing access token");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    debug("Token refresh failed:", res.status, text);
    throw new AuthError(
      `Token refresh failed (${res.status}). Please re-login with: destiny auth login`
    );
  }

  return (await res.json()) as TokenResponse;
}
