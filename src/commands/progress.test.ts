import { afterEach, describe, expect, mock, test } from "bun:test";
import { Command } from "commander";
import { DestinyComponentType } from "../utils/constants.ts";

async function setupProgressCommandTest() {
  const getProfileMock = mock(async () => ({
    profile: {
      data: {
        currentGuardianRank: 8,
        lifetimeHighestGuardianRank: 10,
        currentSeasonRewardPowerCap: 2010,
      },
    },
    characters: {
      data: {
        "char-hunter": {
          characterId: "char-hunter",
          classType: 1,
          light: 2010,
        },
        "char-warlock": {
          characterId: "char-warlock",
          classType: 2,
          light: 1994,
        },
      },
    },
    profileProgression: {
      data: {
        seasonalArtifact: {
          powerBonus: 17,
        },
        checklists: {
          "123": {
            entries: [{ state: 1 }, { state: 0 }, { state: 1 }],
          },
        },
      },
    },
    metrics: {
      data: {
        metrics: {
          "1001": {
            objectiveProgress: {
              progress: 100,
              completionValue: 100,
              complete: true,
            },
          },
          "1002": {
            objectiveProgress: {
              progress: 50,
              completionValue: 100,
              complete: false,
            },
          },
        },
      },
    },
  }));

  const withSpinnerMock = mock(
    async (_text: string, fn: () => Promise<unknown>) => fn()
  );

  mock.module("../api/profile.ts", () => ({
    getProfile: getProfileMock,
  }));
  mock.module("../ui/spinner.ts", () => ({
    withSpinner: withSpinnerMock,
  }));

  const { registerProgressCommand } = await import(
    `./progress.ts?test=${Date.now()}-${Math.random()}`
  );

  return {
    registerProgressCommand,
    getProfileMock,
  };
}

async function runProgress(
  registerProgressCommand: (program: Command) => void,
  args: string[]
): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;

  console.log = (...values: unknown[]) => {
    logs.push(values.map((v) => String(v)).join(" "));
  };

  try {
    const program = new Command();
    registerProgressCommand(program);
    await program.parseAsync(["node", "destiny", "progress", ...args]);
  } finally {
    console.log = originalLog;
  }

  return logs;
}

describe("progress command", () => {
  afterEach(() => {
    mock.restore();
  });

  test("outputs progression summary as JSON and fetches progression components", async () => {
    const ctx = await setupProgressCommandTest();

    const logs = await runProgress(ctx.registerProgressCommand, ["--json"]);
    const output = JSON.parse(logs[0]!);

    const calledWith = ctx.getProfileMock.mock.calls[0]?.[0] as number[] | undefined;
    expect(calledWith).toEqual(
      expect.arrayContaining([
        DestinyComponentType.Profiles,
        DestinyComponentType.Characters,
        DestinyComponentType.Metrics,
        104,
      ])
    );

    expect(output.summary).toMatchObject({
      seasonPowerCap: 2010,
      highestPower: 2010,
      lowestPower: 1994,
      characterCount: 2,
    });
    expect(output.profileCounters).toMatchObject({
      currentGuardianRank: 8,
      lifetimeHighestGuardianRank: 10,
      artifactPowerBonus: 17,
      checklistObjectivesCompleted: 2,
      checklistObjectivesTotal: 3,
      metricsCompleted: 1,
      metricsTotal: 2,
    });
    expect(output.characters[0]).toMatchObject({
      className: "Hunter",
      light: 2010,
      deltaToCap: 0,
    });
  });
});
