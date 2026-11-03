import { ApiError } from "../utils/errors.ts";

export const STALE_PROFILE_HINT =
  "Bungie's profile can stay cached for about a minute after a move. Wait and retry.";

export function isStaleProfileError(err: unknown): boolean {
  if (err instanceof ApiError && err.errorCode === 1623) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /DestinyItemNotFound|\b1623\b|ItemNotFound/i.test(message);
}

export function shouldRefreshProfile(err: unknown): boolean {
  if (isStaleProfileError(err)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /No items found matching/i.test(message);
}

export async function withFreshProfileRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!shouldRefreshProfile(err)) throw err;
    try {
      return await run();
    } catch (retryErr) {
      const message = retryErr instanceof Error ? retryErr.message : String(retryErr);
      if (message.includes(STALE_PROFILE_HINT)) throw retryErr;
      throw new Error(`${message} ${STALE_PROFILE_HINT}`);
    }
  }
}
