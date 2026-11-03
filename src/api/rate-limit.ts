export interface RateLimiter {
  acquire(): Promise<void>;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): RateLimiter {
  const windowMs = options.windowMs ?? 1000;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timestamps: number[] = [];
  let chain: Promise<void> = Promise.resolve();

  return {
    acquire() {
      const run = chain.then(async () => {
        for (;;) {
          const current = now();
          while (timestamps.length > 0 && timestamps[0]! <= current - windowMs) {
            timestamps.shift();
          }
          if (timestamps.length < options.limit) {
            timestamps.push(current);
            return;
          }
          const oldest = timestamps[0]!;
          const waitMs = Math.max(1, windowMs - (current - oldest) + 1);
          await sleep(waitMs);
        }
      });
      // Keep the queue moving if one waiter fails.
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
  };
}
