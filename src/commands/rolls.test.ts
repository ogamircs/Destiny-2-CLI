import { afterEach, describe, expect, test, mock } from "bun:test";
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
        "char-titan": {
          characterId: "char-titan",
          membershipId: "1",
          membershipType: 3,
          dateLastPlayed: "2025-01-01T00:00:00Z",
          minutesPlayedTotal: "100",
          light: 1810,
          classType: 0,
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
  const hunterWeapon = {
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
    isEquipped: false,
    canEquip: true,
    location: "char-hunter",
    perks: [11, 22],
  };

  const titanWeapon = {
    ...hunterWeapon,
    hash: 1002,
    instanceId: "inst-2",
    name: "Fatebringer",
    location: "char-titan",
    perks: [33],
  };

  const nonWeapon = {
    ...hunterWeapon,
    hash: 1003,
    instanceId: "inst-3",
    name: "Legendary Helmet",
    itemType: 2,
    slot: "Helmet",
  };

  return {
    all: [hunterWeapon, titanWeapon, nonWeapon],
    byInstanceId: new Map([
      [hunterWeapon.instanceId!, hunterWeapon],
      [titanWeapon.instanceId!, titanWeapon],
      [nonWeapon.instanceId!, nonWeapon],
    ]),
    byHash: new Map([
      [hunterWeapon.hash, [hunterWeapon]],
      [titanWeapon.hash, [titanWeapon]],
      [nonWeapon.hash, [nonWeapon]],
    ]),
    byCharacter: new Map([
      ["char-hunter", [hunterWeapon]],
      ["char-titan", [titanWeapon]],
    ]),
    vaultItems: [],
  };
}

async function runRolls(
  registerRollsCommand: (program: Command) => void,
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
    registerRollsCommand(program);
    await program.parseAsync(["node", "destiny", "rolls", ...args]);
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

describe("rolls appraise command", () => {
  afterEach(() => {
    mock.restore();
  });

  test("unknown character exits with error", async () => {
    const gradeItemMock = mock(() => "unknown");

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      lookupPerk: mock(() => ({ name: "Perk" })),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/wishlist.ts", () => ({
      loadWishlist: mock(async () => ({
        title: "Test WL",
        entries: [],
        byItemHash: new Map(),
      })),
      gradeItem: gradeItemMock,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?test=${Date.now()}-${Math.random()}`
    );

    const result = await runRolls(registerRollsCommand, [
      "appraise",
      "--source",
      "/tmp/wishlist.txt",
      "--character",
      "warlock",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.logs.some((l) => l.includes('Character "warlock" not found'))).toBe(
      true
    );
    expect(gradeItemMock).not.toHaveBeenCalled();
  });

  test("--json outputs graded weapon rows", async () => {
    const loadWishlistMock = mock(async (_source: string) => ({
      title: "Test Wishlist",
      entries: [{ itemHash: 1001, perkHashes: [11], notes: "keep for pvp" }],
      byItemHash: new Map([
        [1001, [{ itemHash: 1001, perkHashes: [11], notes: "keep for pvp" }]],
      ]),
    }));
    const gradeItemMock = mock((hash: number) => {
      if (hash === 1001) return "god";
      if (hash === 1002) return "trash";
      return "unknown";
    });

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      lookupPerk: (perkHash: number) => ({
        name: perkHash === 11 ? "Outlaw" : perkHash === 22 ? "Kill Clip" : "Unknown Perk",
      }),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/wishlist.ts", () => ({
      loadWishlist: loadWishlistMock,
      gradeItem: gradeItemMock,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?test=${Date.now()}-${Math.random()}`
    );

    const result = await runRolls(registerRollsCommand, [
      "appraise",
      "--source",
      "/tmp/wishlist.txt",
      "--json",
    ]);

    expect(loadWishlistMock).toHaveBeenCalledWith("/tmp/wishlist.txt");
    expect(gradeItemMock).toHaveBeenCalledTimes(2); // only weapons

    const output = JSON.parse(result.logs[result.logs.length - 1]!);
    expect(output).toHaveLength(2);
    expect(output[0]).toMatchObject({
      name: "Ace of Spades",
      grade: "god",
    });
    expect(output[0].matchedPerks).toContain("Outlaw");
    expect(output[0].notes).toContain("keep for pvp");
    expect(result.exitCode).toBeNull();
  });
});
