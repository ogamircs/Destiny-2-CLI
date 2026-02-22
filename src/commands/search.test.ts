import { describe, expect, test, mock, afterEach } from "bun:test";
import { Command } from "commander";

function makeProfile() {
  return {
    characters: {
      data: {
        "char-hunter": {
          characterId: "char-hunter",
          membershipId: "1",
          membershipType: 3,
          dateLastPlayed: "2025-01-01T00:00:00Z",
          minutesPlayedTotal: "100",
          light: 1810,
          classType: 1,
          raceType: 0,
          genderType: 0,
          stats: {},
          emblemPath: "",
          emblemBackgroundPath: "",
        },
      },
    },
  };
}

function makeIndex() {
  const item1 = {
    hash: 1001,
    instanceId: "inst-1",
    quantity: 1,
    bucketHash: 1498876634,
    transferStatus: 0,
    isLocked: false,
    name: "Ace of Spades",
    itemType: 3,
    itemSubType: 1,
    tier: "Exotic",
    slot: "Kinetic",
    classRestriction: -1,
    icon: "",
    maxStackSize: 1,
    nonTransferrable: false,
    equippable: true,
    power: 1810,
    damageType: 3,
    energyCapacity: undefined,
    energyUsed: undefined,
    isEquipped: true,
    canEquip: true,
    location: "char-hunter",
    perks: [1, 2],
  };

  const item2 = {
    ...item1,
    hash: 1002,
    instanceId: "inst-2",
    name: "Fatebringer",
    tier: "Legendary",
    isEquipped: false,
    location: "vault",
  };

  return {
    all: [item1, item2],
    byInstanceId: new Map([
      [item1.instanceId!, item1],
      [item2.instanceId!, item2],
    ]),
    byHash: new Map([
      [item1.hash, [item1]],
      [item2.hash, [item2]],
    ]),
    byCharacter: new Map([["char-hunter", [item1]]]),
    vaultItems: [item2],
  };
}

async function runSearch(
  registerSearchCommand: (program: Command) => void,
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
  (process as any).exit = (code: number) => {
    exitCode = code;
    throw new Error(`__exit_${code}__`);
  };

  try {
    const program = new Command();
    registerSearchCommand(program);
    await program.parseAsync(["node", "destiny", "search", ...args]);
  } catch (err: any) {
    if (!err?.message?.startsWith("__exit_")) {
      // Ignore process.exit simulation error.
    }
  } finally {
    console.log = origLog;
    console.error = origError;
    (process as any).exit = origExit;
  }

  return { logs, errors, exitCode };
}

describe("search command", () => {
  afterEach(() => {
    mock.restore();
  });

  test("--saved prints message when there are no saved searches", async () => {
    mock.module("../services/local-db.ts", () => ({
      getAllTags: () => new Map(),
      saveSearch: mock(() => {}),
      listSearches: () => [],
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));

    const { registerSearchCommand } = await import(
      `./search.ts?test=${Date.now()}-${Math.random()}`
    );

    const result = await runSearch(registerSearchCommand, ["--saved"]);
    expect(result.logs.some((l) => l.includes("No saved searches"))).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  test("missing query exits with error", async () => {
    mock.module("../services/local-db.ts", () => ({
      getAllTags: () => new Map(),
      saveSearch: mock(() => {}),
      listSearches: () => [],
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));

    const { registerSearchCommand } = await import(
      `./search.ts?test=${Date.now()}-${Math.random()}`
    );

    const result = await runSearch(registerSearchCommand, []);
    expect(result.exitCode).toBe(1);
    expect(
      result.logs.some((l) => l.includes("Query required"))
    ).toBe(true);
  });

  test("query + --save + --json filters and saves search", async () => {
    const saveSearchMock = mock(() => {});
    const renderInventoryTableMock = mock(() => {});
    const parseQueryMock = mock(
      (_query: string) => (item: any, _tags: string[]) => item.name === "Ace of Spades"
    );

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/search.ts", () => ({
      parseQuery: parseQueryMock,
    }));
    mock.module("../services/local-db.ts", () => ({
      getAllTags: () => new Map([["inst-1", ["pvp"]]]),
      saveSearch: saveSearchMock,
      listSearches: () => [],
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../ui/tables.ts", () => ({
      renderInventoryTable: renderInventoryTableMock,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerSearchCommand } = await import(
      `./search.ts?test=${Date.now()}-${Math.random()}`
    );

    const result = await runSearch(registerSearchCommand, [
      "is:weapon",
      "--save",
      "pvp-weapons",
      "--json",
    ]);

    expect(saveSearchMock).toHaveBeenCalledWith("pvp-weapons", "is:weapon");
    expect(parseQueryMock).toHaveBeenCalledWith("is:weapon");
    expect(renderInventoryTableMock).not.toHaveBeenCalled();

    expect(result.logs.length).toBeGreaterThan(0);
    const jsonOut = JSON.parse(result.logs[result.logs.length - 1]!);
    expect(jsonOut).toHaveLength(1);
    expect(jsonOut[0]).toMatchObject({
      name: "Ace of Spades",
      location: "char-hunter",
    });
    expect(result.exitCode).toBeNull();
  });
});
