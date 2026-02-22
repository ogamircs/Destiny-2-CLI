import { afterEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "fs";
import { Command } from "commander";

const HUNTER = {
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
};

const TITAN = {
  ...HUNTER,
  characterId: "char-titan",
  classType: 0,
};

function makeProfile() {
  return {
    characters: {
      data: {
        [HUNTER.characterId]: HUNTER,
        [TITAN.characterId]: TITAN,
      },
    },
  };
}

function makeIndex() {
  const fateKeep = {
    hash: 1001,
    instanceId: "inst-fate-1",
    quantity: 1,
    bucketHash: 1498876634,
    transferStatus: 0,
    isLocked: false,
    name: "Fatebringer",
    itemType: 3,
    itemSubType: 1,
    tier: "Legendary",
    slot: "Kinetic",
    classRestriction: -1,
    icon: "",
    maxStackSize: 1,
    nonTransferrable: false,
    equippable: true,
    power: 1810,
    damageType: 1,
    energyCapacity: undefined,
    energyUsed: undefined,
    isEquipped: false,
    canEquip: true,
    location: HUNTER.characterId,
    perks: [11, 22],
  };

  const fateCleanup = {
    ...fateKeep,
    instanceId: "inst-fate-2",
    power: 1780,
  };

  const oldHelmet = {
    ...fateKeep,
    hash: 2001,
    instanceId: "inst-helm-1",
    name: "Ancient Helm",
    itemType: 2,
    slot: "Helmet",
    power: 1760,
    perks: undefined,
  };

  const titanItem = {
    ...fateKeep,
    hash: 3001,
    instanceId: "inst-titan-1",
    name: "Titan Rifle",
    location: TITAN.characterId,
    power: 1815,
  };

  return {
    all: [fateKeep, fateCleanup, oldHelmet, titanItem],
    byInstanceId: new Map([
      [fateKeep.instanceId!, fateKeep],
      [fateCleanup.instanceId!, fateCleanup],
      [oldHelmet.instanceId!, oldHelmet],
      [titanItem.instanceId!, titanItem],
    ]),
    byHash: new Map([
      [fateKeep.hash, [fateKeep, fateCleanup]],
      [oldHelmet.hash, [oldHelmet]],
      [titanItem.hash, [titanItem]],
    ]),
    byCharacter: new Map([
      [HUNTER.characterId, [fateKeep, fateCleanup, oldHelmet]],
      [TITAN.characterId, [titanItem]],
    ]),
    vaultItems: [],
  };
}

async function runOrganize(
  register: (program: Command) => void,
  args: string[]
): Promise<{ logs: string[]; errors: string[]; exitCode: number | null }> {
  const logs: string[] = [];
  const errors: string[] = [];
  let exitCode: number | null = null;

  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;

  console.log = (...values: unknown[]) => logs.push(values.map(String).join(" "));
  console.error = (...values: unknown[]) =>
    errors.push(values.map(String).join(" "));
  (process as unknown as { exit: (code: number) => never }).exit = (
    code: number
  ) => {
    exitCode = code;
    throw new Error(`__exit_${code}__`);
  };

  try {
    const program = new Command();
    register(program);
    await program.parseAsync(["node", "destiny", "organize", ...args]);
  } catch (err: unknown) {
    const known = err as { message?: string };
    if (!known.message?.startsWith("__exit_")) {
      // swallow harness exit exception
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;
    (process as unknown as { exit: typeof process.exit }).exit = originalExit;
  }

  return { logs, errors, exitCode };
}

describe("organize command", () => {
  afterEach(() => {
    mock.restore();
  });

  test("supports --query + --character and returns grouped JSON actions", async () => {
    const parseQueryMock = mock(
      (_query: string) => (item: { itemType: number }) => item.itemType === 3
    );

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      lookupPerk: mock(() => null),
      searchItems: mock(() => []),
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
      getAllTags: () => new Map(),
      itemKey: (item: { instanceId?: string; hash: number }) =>
        item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerOrganizeCommand } = await import(
      `./organize.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runOrganize(registerOrganizeCommand, [
      "--query",
      "is:weapon",
      "--character",
      "hunter",
      "--json",
    ]);

    expect(result.exitCode).toBeNull();
    expect(parseQueryMock).toHaveBeenCalledWith("is:weapon");
    expect(result.logs).toHaveLength(1);

    const payload = JSON.parse(result.logs[0]!);
    expect(payload.scope).toMatchObject({
      query: "is:weapon",
      character: "Hunter",
      itemCount: 2,
    });
    expect(payload.groups.duplicates).toHaveLength(1);
    expect(payload.groups.duplicates[0]).toMatchObject({
      name: "Fatebringer",
      action: expect.any(String),
    });
  });

  test("writes cleanup actions to CSV via --csv", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      lookupPerk: mock(() => null),
      searchItems: mock(() => []),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/search.ts", () => ({
      parseQuery: (_query: string) => () => true,
    }));
    mock.module("../services/local-db.ts", () => ({
      getAllTags: () => new Map(),
      itemKey: (item: { instanceId?: string; hash: number }) =>
        item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerOrganizeCommand } = await import(
      `./organize.ts?t=${Date.now()}-${Math.random()}`
    );

    const csvPath = `/tmp/destiny-organize-${Date.now()}-${Math.random()}.csv`;
    try {
      const result = await runOrganize(registerOrganizeCommand, [
        "--csv",
        csvPath,
      ]);

      expect(result.exitCode).toBeNull();
      expect(existsSync(csvPath)).toBe(true);

      const csv = await Bun.file(csvPath).text();
      expect(csv).toContain("group,action,name");
      expect(csv).toContain("duplicates");
      expect(
        result.logs.some((line) => line.toLowerCase().includes("csv"))
      ).toBe(true);
    } finally {
      if (existsSync(csvPath)) {
        rmSync(csvPath);
      }
    }
  });
});
