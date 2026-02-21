import { describe, expect, test, mock } from "bun:test";
import { Command } from "commander";
import { DestinyComponentType } from "../utils/constants.ts";

async function setupStatsCommandTest() {
  const getProfileMock = mock(async () => ({
    characters: { data: {} },
  }));
  const getAccountStatsMock = mock(async () => ({
    mergedAllCharacters: { results: {} },
    characters: [],
  }));
  const withSpinnerMock = mock(
    async (_text: string, fn: () => Promise<unknown>) => fn()
  );

  mock.module("../api/profile.ts", () => ({
    getProfile: getProfileMock,
  }));
  mock.module("../api/stats.ts", () => ({
    getAccountStats: getAccountStatsMock,
    ActivityMode: {
      None: 0,
      AllPvE: 7,
      AllPvP: 5,
      Raid: 4,
      Strikes: 18,
      Nightfall: 46,
      Gambit: 63,
      TrialsOfOsiris: 84,
      IronBanner: 19,
      Dungeon: 82,
      Crucible: 5,
    },
  }));
  mock.module("../ui/spinner.ts", () => ({
    withSpinner: withSpinnerMock,
  }));

  const { registerStatsCommand } = await import(
    `./stats.ts?test=${Date.now()}-${Math.random()}`
  );

  return {
    registerStatsCommand,
    getProfileMock,
    getAccountStatsMock,
    cleanup: () => mock.restore(),
  };
}

async function runStats(
  registerStatsCommand: (program: Command) => void,
  args: string[]
): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;

  console.log = (...values: unknown[]) => {
    logs.push(values.map((v) => String(v)).join(" "));
  };

  try {
    const program = new Command();
    registerStatsCommand(program);
    await program.parseAsync(["node", "destiny", "stats", ...args]);
  } finally {
    console.log = originalLog;
  }

  return logs;
}

describe("stats command", () => {
  test("passes mapped mode to API and outputs JSON", async () => {
    const ctx = await setupStatsCommandTest();
    try {
      const statsResponse = {
        mergedAllCharacters: {
          results: {
            allPvP: {
              allTime: {
                kills: {
                  statId: "kills",
                  basic: { value: 10, displayValue: "10" },
                },
              },
            },
          },
        },
        characters: [],
      };
      ctx.getAccountStatsMock.mockResolvedValue(statsResponse);

      const logs = await runStats(ctx.registerStatsCommand, [
        "--mode",
        "pvp",
        "--json",
      ]);
      expect(ctx.getAccountStatsMock).toHaveBeenCalledWith([5]);
      expect(ctx.getProfileMock).toHaveBeenCalledWith([
        DestinyComponentType.Characters,
      ]);

      expect(logs.length).toBe(1);
      const output = JSON.parse(logs[0]!);
      expect(output).toMatchObject({
        mergedAllCharacters: {
          results: {
            allPvP: {},
          },
        },
        characters: [],
      });
    } finally {
      ctx.cleanup();
    }
  });

  test("prints friendly error for unknown mode and skips API calls", async () => {
    const ctx = await setupStatsCommandTest();
    try {
      const logs = await runStats(ctx.registerStatsCommand, [
        "--mode",
        "invalid-mode",
      ]);
      expect(logs.join("\n")).toContain('Unknown mode "invalid-mode"');
      expect(ctx.getAccountStatsMock).not.toHaveBeenCalled();
      expect(ctx.getProfileMock).not.toHaveBeenCalled();
    } finally {
      ctx.cleanup();
    }
  });
});
