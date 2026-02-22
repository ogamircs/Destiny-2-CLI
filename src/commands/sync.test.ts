import { afterEach, describe, expect, mock, test } from "bun:test";
import { Command } from "commander";

async function runCommand(
  register: (program: Command) => void,
  args: string[]
): Promise<{ logs: string[]; errors: string[]; exitCode: number | null }> {
  const logs: string[] = [];
  const errors: string[] = [];
  let exitCode: number | null = null;

  const origLog = console.log;
  const origError = console.error;
  const origExit = process.exit;

  console.log = (...v: unknown[]) => logs.push(v.map(String).join(" "));
  console.error = (...v: unknown[]) => errors.push(v.map(String).join(" "));
  (process as unknown as { exit: (code: number) => never }).exit = (
    code: number
  ) => {
    exitCode = code;
    throw new Error(`__exit_${code}__`);
  };

  try {
    const program = new Command();
    program.exitOverride();
    register(program);
    await program.parseAsync(["node", "destiny", ...args]);
  } catch (err: unknown) {
    const known = err as { message?: string; code?: string };
    if (!known.message?.startsWith("__exit_")) {
      if (
        known.code !== "commander.helpDisplayed" &&
        known.code !== "commander.unknownOption"
      ) {
        // swallow test harness errors
      }
    }
  } finally {
    console.log = origLog;
    console.error = origError;
    (process as unknown as { exit: typeof process.exit }).exit = origExit;
  }

  return { logs, errors, exitCode };
}

describe("sync command", () => {
  afterEach(() => mock.restore());

  test("status prints offline and queue state", async () => {
    const getSyncStatusMock = mock(() => ({
      offline: true,
      queuedCount: 3,
      lastReplayAt: 1700000100,
      cloudRecordCount: 2,
    }));

    mock.module("../services/sync-queue.ts", () => ({
      getSyncStatus: getSyncStatusMock,
      setSyncOfflineMode: mock(() => {
        throw new Error("not used");
      }),
      queueOrSyncOperation: mock(async () => {
        throw new Error("not used");
      }),
      replaySyncQueue: mock(async () => {
        throw new Error("not used");
      }),
    }));

    const { registerSyncCommand } = await import(
      `./sync.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerSyncCommand, ["sync", "status"]);

    expect(result.exitCode).toBeNull();
    expect(getSyncStatusMock).toHaveBeenCalledTimes(1);
    expect(result.logs.some((line) => line.includes("Offline: on"))).toBe(true);
    expect(result.logs.some((line) => line.includes("Queued operations: 3"))).toBe(
      true
    );
  });

  test("offline on toggles state through service", async () => {
    const setSyncOfflineModeMock = mock(() => ({
      offline: true,
      queuedCount: 0,
      lastReplayAt: null,
      cloudRecordCount: 0,
    }));

    mock.module("../services/sync-queue.ts", () => ({
      getSyncStatus: mock(() => ({
        offline: false,
        queuedCount: 0,
        lastReplayAt: null,
        cloudRecordCount: 0,
      })),
      setSyncOfflineMode: setSyncOfflineModeMock,
      queueOrSyncOperation: mock(async () => {
        throw new Error("not used");
      }),
      replaySyncQueue: mock(async () => {
        throw new Error("not used");
      }),
    }));

    const { registerSyncCommand } = await import(
      `./sync.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerSyncCommand, [
      "sync",
      "offline",
      "on",
    ]);

    expect(result.exitCode).toBeNull();
    expect(setSyncOfflineModeMock).toHaveBeenCalledWith(true);
    expect(result.logs.some((line) => line.includes("Offline mode enabled"))).toBe(
      true
    );
  });

  test("queue accepts JSON payload and reports queued operation", async () => {
    const queueOrSyncOperationMock = mock(async () => ({
      queued: true,
      id: "op-123",
      reason: "offline mode enabled",
    }));

    mock.module("../services/sync-queue.ts", () => ({
      getSyncStatus: mock(() => ({
        offline: true,
        queuedCount: 1,
        lastReplayAt: null,
        cloudRecordCount: 0,
      })),
      setSyncOfflineMode: mock(() => ({
        offline: true,
        queuedCount: 1,
        lastReplayAt: null,
        cloudRecordCount: 0,
      })),
      queueOrSyncOperation: queueOrSyncOperationMock,
      replaySyncQueue: mock(async () => ({
        replayed: 0,
        failed: 0,
        remaining: 1,
      })),
    }));

    const { registerSyncCommand } = await import(
      `./sync.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerSyncCommand, [
      "sync",
      "queue",
      "tag.add",
      '{"item":"ace","tag":"pvp"}',
    ]);

    expect(result.exitCode).toBeNull();
    expect(queueOrSyncOperationMock).toHaveBeenCalledWith("tag.add", {
      item: "ace",
      tag: "pvp",
    });
    expect(result.logs.some((line) => line.includes("Queued operation op-123"))).toBe(
      true
    );
  });

  test("replay prints replay summary", async () => {
    const replaySyncQueueMock = mock(async () => ({
      replayed: 2,
      failed: 1,
      remaining: 1,
    }));

    mock.module("../services/sync-queue.ts", () => ({
      getSyncStatus: mock(() => ({
        offline: false,
        queuedCount: 1,
        lastReplayAt: null,
        cloudRecordCount: 2,
      })),
      setSyncOfflineMode: mock(() => ({
        offline: false,
        queuedCount: 1,
        lastReplayAt: null,
        cloudRecordCount: 2,
      })),
      queueOrSyncOperation: mock(async () => ({
        queued: false,
        id: "not-used",
      })),
      replaySyncQueue: replaySyncQueueMock,
    }));

    const { registerSyncCommand } = await import(
      `./sync.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerSyncCommand, ["sync", "replay"]);

    expect(result.exitCode).toBeNull();
    expect(replaySyncQueueMock).toHaveBeenCalledTimes(1);
    expect(result.logs.some((line) => line.includes("Replayed: 2"))).toBe(true);
    expect(result.logs.some((line) => line.includes("Failed: 1"))).toBe(true);
  });
});
