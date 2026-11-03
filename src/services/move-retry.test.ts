import { describe, expect, test } from "bun:test";
import { ApiError } from "../utils/errors.ts";
import {
  isStaleProfileError,
  STALE_PROFILE_HINT,
  withFreshProfileRetry,
} from "./move-retry.ts";

describe("withFreshProfileRetry", () => {
  test("treats DestinyItemNotFound as a stale profile", () => {
    expect(isStaleProfileError(new ApiError("DestinyItemNotFound", 200, 1623))).toBe(true);
    expect(isStaleProfileError(new Error("missing perk"))).toBe(false);
  });

  test("refetches once after a stale failure and hints if the retry fails", async () => {
    let calls = 0;
    await expect(
      withFreshProfileRetry(async () => {
        calls += 1;
        throw new ApiError("DestinyItemNotFound", 200, 1623);
      })
    ).rejects.toThrow(STALE_PROFILE_HINT);
    expect(calls).toBe(2);
  });

  test("returns the second attempt when the fresh profile succeeds", async () => {
    let calls = 0;
    const result = await withFreshProfileRetry(async () => {
      calls += 1;
      if (calls === 1) throw new Error("No items found matching \"Ace\"");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  test("does not retry unrelated failures", async () => {
    let calls = 0;
    await expect(
      withFreshProfileRetry(async () => {
        calls += 1;
        throw new Error("locked");
      })
    ).rejects.toThrow("locked");
    expect(calls).toBe(1);
  });
});
