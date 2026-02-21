import { API_BASE, RATE_LIMIT_PER_SECOND } from "../utils/constants.ts";
import { getConfig } from "../services/config.ts";
import {
  loadTokens,
  saveTokens,
  isTokenExpired,
  isRefreshTokenExpired,
  type StoredTokens,
} from "../services/token-store.ts";
import { refreshAccessToken, type TokenResponse } from "./auth.ts";
import { ApiError, AuthError, RateLimitError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";

// Simple sliding window rate limiter
const requestTimestamps: number[] = [];

function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  // Remove timestamps older than 1 second
  while (requestTimestamps.length > 0 && requestTimestamps[0]! < now - 1000) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= RATE_LIMIT_PER_SECOND) {
    const waitMs = 1000 - (now - requestTimestamps[0]!) + 10;
    debug(`Rate limit: waiting ${waitMs}ms`);
    return new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return Promise.resolve();
}

async function getValidTokens(): Promise<StoredTokens> {
  let tokens = loadTokens();
  if (!tokens) {
    throw new AuthError("Not logged in. Run: destiny auth login");
  }

  if (isTokenExpired(tokens)) {
    if (isRefreshTokenExpired(tokens)) {
      throw new AuthError(
        "Session expired. Please re-login: destiny auth login"
      );
    }

    debug("Access token expired, refreshing...");
    const refreshed: TokenResponse = await refreshAccessToken(
      tokens.refreshToken
    );
    const now = Date.now();
    tokens = {
      ...tokens,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      accessTokenExpiresAt: now + refreshed.expires_in * 1000,
      refreshTokenExpiresAt: now + refreshed.refresh_expires_in * 1000,
    };
    await saveTokens(tokens);
    debug("Tokens refreshed and saved");
  }

  return tokens;
}

interface BungieResponse<T> {
  Response: T;
  ErrorCode: number;
  ThrottleSeconds: number;
  ErrorStatus: string;
  Message: string;
  MessageData: Record<string, string>;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
  } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  await waitForRateLimit();
  requestTimestamps.push(Date.now());

  const config = getConfig();
  const headers: Record<string, string> = {
    "X-API-Key": config.apiKey,
  };

  if (auth) {
    const tokens = await getValidTokens();
    headers["Authorization"] = `Bearer ${tokens.accessToken}`;
  }

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  debug(`${method} ${url}`);

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
    throw new RateLimitError(retryAfter);
  }

  if (!res.ok) {
    const text = await res.text();
    debug(`API error: ${res.status}`, text);
    throw new ApiError(
      `Bungie API error: ${text}`,
      res.status
    );
  }

  const json = (await res.json()) as BungieResponse<T>;

  if (json.ErrorCode !== 1) {
    if (json.ThrottleSeconds > 0) {
      throw new RateLimitError(json.ThrottleSeconds);
    }
    throw new ApiError(
      `${json.ErrorStatus}: ${json.Message}`,
      200,
      json.ErrorCode
    );
  }

  return json.Response;
}
