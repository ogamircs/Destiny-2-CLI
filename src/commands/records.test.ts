import { afterEach, describe, expect, mock, test } from "bun:test";
import { Command } from "commander";
import { DestinyComponentType } from "../utils/constants.ts";

async function setupRecordsCommandTest() {
  const getProfileMock = mock(async () => ({
    characters: {
      data: {
        "char-hunter": {
          characterId: "char-hunter",
          classType: 1,
          light: 2009,
        },
        "char-warlock": {
          characterId: "char-warlock",
          classType: 2,
          light: 2004,
        },
      },
    },
    profileRecords: {
      data: {
        records: {
          "100": {
            objectives: [
              { progress: 1, completionValue: 1, complete: true },
              { progress: 3, completionValue: 5, complete: false },
            ],
          },
          "200": {
            objectives: [{ progress: 10, completionValue: 10, complete: true }],
          },
        },
      },
    },
    characterRecords: {
      data: {
        "char-hunter": {
          records: {
            "1000": {
              objectives: [{ progress: 4, completionValue: 4, complete: true }],
            },
            "1001": {
              objectives: [{ progress: 1, completionValue: 4, complete: false }],
            },
          },
        },
        "char-warlock": {
          records: {
            "2000": {
              objectives: [{ progress: 4, completionValue: 4, complete: true }],
            },
          },
        },
      },
    },
    profilePresentationNodes: {
      data: {
        "3000": {
          objectives: [{ progress: 2, completionValue: 2, complete: true }],
        },
        "3001": {
          objectives: [{ progress: 1, completionValue: 4, complete: false }],
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

  const { registerRecordsCommand } = await import(
    `./records.ts?test=${Date.now()}-${Math.random()}`
  );

  return {
    registerRecordsCommand,
    getProfileMock,
  };
}

async function runRecords(
  registerRecordsCommand: (program: Command) => void,
  args: string[]
): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;

  console.log = (...values: unknown[]) => {
    logs.push(values.map((v) => String(v)).join(" "));
  };

  try {
    const program = new Command();
    registerRecordsCommand(program);
    await program.parseAsync(["node", "destiny", "records", ...args]);
  } finally {
    console.log = originalLog;
  }

  return logs;
}

describe("records command", () => {
  afterEach(() => {
    mock.restore();
  });

  test("outputs tracked records and seal summary as JSON", async () => {
    const ctx = await setupRecordsCommandTest();

    const logs = await runRecords(ctx.registerRecordsCommand, ["--json"]);
    const output = JSON.parse(logs[0]!);

    const calledWith = ctx.getProfileMock.mock.calls[0]?.[0] as number[] | undefined;
    expect(calledWith).toEqual(
      expect.arrayContaining([
        DestinyComponentType.Characters,
        900,
        901,
        902,
      ])
    );

    expect(output.summary).toMatchObject({
      profileRecordsCompleted: 1,
      profileRecordsTotal: 2,
      sealNodesCompleted: 1,
      sealNodesTotal: 2,
    });
    const hunterSummary = output.characters.find(
      (character: { className: string }) => character.className === "Hunter"
    );
    expect(hunterSummary).toMatchObject({
      className: "Hunter",
      recordsCompleted: 1,
      recordsTotal: 2,
      completionPct: 50,
    });
    expect(output.trackedRecords[0]).toMatchObject({
      recordHash: "100",
      completionPct: 80,
      isComplete: false,
    });
  });
});
