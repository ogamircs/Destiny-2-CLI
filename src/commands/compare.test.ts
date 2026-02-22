import { afterEach, describe, expect, mock, test } from "bun:test";
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

const WARLOCK = {
  ...HUNTER,
  characterId: "char-warlock",
  classType: 2,
};

function makeProfile() {
  return {
    characters: {
      data: {
        [HUNTER.characterId]: HUNTER,
        [WARLOCK.characterId]: WARLOCK,
      },
    },
  };
}

function makeCompareIndex() {
  const roseHunter = {
    hash: 901,
    instanceId: "rose-hunter",
    quantity: 1,
    bucketHash: 1498876634,
    transferStatus: 0,
    isLocked: false,
    name: "Rose",
    itemType: 3,
    itemSubType: 6,
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
    isEquipped: true,
    canEquip: true,
    location: HUNTER.characterId,
    perks: [101, 102],
  };

  const roseWarlock = {
    ...roseHunter,
    instanceId: "rose-warlock",
    power: 1800,
    isEquipped: false,
    isLocked: true,
    location: WARLOCK.characterId,
    perks: [103],
  };

  const roseVault = {
    ...roseHunter,
    instanceId: "rose-vault",
    power: 1795,
    isEquipped: false,
    location: "vault",
    perks: [104],
  };

  const notRose = {
    ...roseHunter,
    hash: 902,
    instanceId: "not-rose",
    name: "Palindrome",
    perks: [105],
  };

  return {
    all: [roseHunter, roseWarlock, roseVault, notRose],
    byInstanceId: new Map([
      [roseHunter.instanceId!, roseHunter],
      [roseWarlock.instanceId!, roseWarlock],
      [roseVault.instanceId!, roseVault],
      [notRose.instanceId!, notRose],
    ]),
    byHash: new Map([
      [roseHunter.hash, [roseHunter, roseWarlock, roseVault]],
      [notRose.hash, [notRose]],
    ]),
    byCharacter: new Map([
      [HUNTER.characterId, [roseHunter, notRose]],
      [WARLOCK.characterId, [roseWarlock]],
    ]),
    vaultItems: [roseVault],
  };
}

function makeSingleMatchIndex() {
  const item = {
    hash: 777,
    instanceId: "single-1",
    quantity: 1,
    bucketHash: 1498876634,
    transferStatus: 0,
    isLocked: false,
    name: "Rose",
    itemType: 3,
    itemSubType: 6,
    tier: "Legendary",
    slot: "Kinetic",
    classRestriction: -1,
    icon: "",
    maxStackSize: 1,
    nonTransferrable: false,
    equippable: true,
    power: 1812,
    damageType: 1,
    energyCapacity: undefined,
    energyUsed: undefined,
    isEquipped: true,
    canEquip: true,
    location: HUNTER.characterId,
    perks: [101],
  };

  return {
    all: [item],
    byInstanceId: new Map([[item.instanceId!, item]]),
    byHash: new Map([[item.hash, [item]]]),
    byCharacter: new Map([[HUNTER.characterId, [item]]]),
    vaultItems: [],
  };
}

async function runCompare(
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
    await program.parseAsync(["node", "destiny", "compare", ...args]);
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

describe("compare command", () => {
  afterEach(() => {
    mock.restore();
  });

  test("compares matching copies and returns compact JSON rows", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      lookupPerk: (hash: number) => ({
        hash,
        name:
          hash === 101
            ? "Explosive Payload"
            : hash === 102
              ? "Slideshot"
              : hash === 103
                ? "Opening Shot"
              : hash === 104
                  ? "Rangefinder"
                  : `Perk ${hash}`,
        description: "",
      }),
      searchItems: mock(() => []),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeCompareIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerCompareCommand } = await import(
      `./compare.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCompare(registerCompareCommand, ["rose", "--json"]);

    expect(result.exitCode).toBeNull();
    expect(result.logs).toHaveLength(1);

    const payload = JSON.parse(result.logs[0]!);
    expect(payload.query).toBe("rose");
    expect(payload.items).toHaveLength(3);
    expect(payload.items[0]).toMatchObject({
      name: "Rose",
      power: 1810,
      location: "Hunter",
      perks: expect.arrayContaining(["Explosive Payload", "Slideshot"]),
    });
    expect(payload.items[1]).toMatchObject({
      location: "Warlock",
      locked: true,
    });
  });

  test("prints fallback message when fewer than two matches are found", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      lookupPerk: mock(() => null),
      searchItems: mock(() => []),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeSingleMatchIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerCompareCommand } = await import(
      `./compare.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCompare(registerCompareCommand, ["rose"]);

    expect(result.exitCode).toBeNull();
    expect(
      result.logs.some((line) => line.includes("Need at least two matching items"))
    ).toBe(true);
  });
});
