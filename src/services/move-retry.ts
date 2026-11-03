import { ApiError } from "../utils/errors.ts";
import { hasRecentMoveMatching } from "./recent-moves.ts";

export const STALE_PROFILE_HINT =
  "Bungie's profile can stay cached for a couple of minutes after a move. Wait and retry.";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function quotedItem(message: string): string | null {
  return message.match(/No items found matching "([^"]+)"/i)?.[1] ?? null;
}

export function isStaleProfileError(err: unknown): boolean {
  if (err instanceof ApiError && err.errorCode === 1623) return true;
  return /DestinyItemNotFound|\b1623\b|ItemNotFound/i.test(messageOf(err));
}

export function shouldRefreshProfile(err: unknown): boolean {
  if (isStaleProfileError(err)) return true;
  const item = quotedItem(messageOf(err));
  return item !== null && hasRecentMoveMatching(item);
}

function withCacheHint(err: unknown): Error {
  const message = messageOf(err);
  if (message.includes(STALE_PROFILE_HINT)) {
    return err instanceof Error ? err : new Error(message);
  }
  const item = quotedItem(message);
  const mentionCache = isStaleProfileError(err) || (item !== null && hasRecentMoveMatching(item));
  if (!mentionCache) return err instanceof Error ? err : new Error(message);
  return new Error(`${message} ${STALE_PROFILE_HINT}`);
}

export async function withFreshProfileRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!shouldRefreshProfile(err)) throw err;
    try {
      return await run();
    } catch (retryErr) {
      throw withCacheHint(retryErr);
    }
  }
}
