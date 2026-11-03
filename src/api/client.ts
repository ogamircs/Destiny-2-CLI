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
import { createRateLimiter } from "./rate-limit.ts";
import { ApiError, AuthError, RateLimitError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";

const rateLimiter = createRateLimiter({ limit: RATE_LIMIT_PER_SECOND });

// Concurrent requests share one refresh so a rotated refresh token is not used twice.
let refreshInFlight: Promise<StoredTokens> | null = null;

async function refreshTokens(tokens: StoredTokens): Promise<StoredTokens> {
  debug("Access token expired, refreshing...");
  const refreshed: TokenResponse = await refreshAccessToken(tokens.refreshToken);
  const now = Date.now();
  const next: StoredTokens = {
    ...tokens,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    accessTokenExpiresAt: now + refreshed.expires_in * 1000,
    refreshTokenExpiresAt: now + refreshed.refresh_expires_in * 1000,
  };
  await saveTokens(next);
  debug("Tokens refreshed and saved");
  return next;
}

async function getValidTokens(): Promise<StoredTokens> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new AuthError("Not logged in. Run: destiny auth login");
  }

  if (!isTokenExpired(tokens)) {
    return tokens;
  }

  if (isRefreshTokenExpired(tokens)) {
    throw new AuthError("Session expired. Please re-login: destiny auth login");
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshTokens(tokens).finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

function clipBody(text: string, max = 300): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
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

  await rateLimiter.acquire();

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
    const text = clipBody(await res.text());
    debug(`API error: ${res.status}`, text);
    throw new ApiError(`Bungie API error: ${text}`, res.status);
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
