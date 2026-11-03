import { describe, expect, test } from "bun:test";
import { createRateLimiter } from "./rate-limit.ts";

describe("createRateLimiter", () => {
  test("spaces callers once the window is full", async () => {
    let time = 0;
    const sleeps: number[] = [];
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 1000,
      now: () => time,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        time += ms;
      },
    });

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(sleeps).toEqual([1001]);
    expect(time).toBe(1001);
  });

  test("does not let concurrent callers exceed the limit together", async () => {
    let time = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1000,
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
    });

    async function take(): Promise<void> {
      await limiter.acquire();
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    }

    await Promise.all([take(), take(), take()]);
    expect(maxInFlight).toBe(1);
  });
});
