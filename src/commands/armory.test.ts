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

function makeProfile() {
  return {
    characters: {
      data: {
        [HUNTER.characterId]: HUNTER,
      },
    },
  };
}

function makeArmoryIndex() {
  const item = {
    hash: 1001,
    instanceId: "inst-ace",
    quantity: 1,
    bucketHash: 1498876634,
    transferStatus: 1,
    isLocked: true,
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
    damageType: 1,
    energyCapacity: undefined,
    energyUsed: undefined,
    isEquipped: true,
    canEquip: true,
    location: HUNTER.characterId,
    perks: [11, 22],
  };

  return {
    all: [item],
    byInstanceId: new Map([[item.instanceId!, item]]),
    byHash: new Map([[item.hash, [item]]]),
    byCharacter: new Map([[HUNTER.characterId, [item]]]),
    vaultItems: [],
  };
}

async function runArmory(
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
    await program.parseAsync(["node", "destiny", "armory", ...args]);
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

describe("armory command", () => {
  afterEach(() => {
    mock.restore();
  });

  test("supports --item by instanceId and returns deep JSON view", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      lookupPerk: (hash: number) => ({
        hash,
        name: hash === 11 ? "Outlaw" : hash === 22 ? "Firefly" : `Perk ${hash}`,
        description: "",
      }),
      searchItems: mock(() => []),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeArmoryIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerArmoryCommand } = await import(
      `./armory.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runArmory(registerArmoryCommand, [
      "--item",
      "inst-ace",
      "--json",
    ]);

    expect(result.exitCode).toBeNull();
    expect(result.logs).toHaveLength(1);

    const payload = JSON.parse(result.logs[0]!);
    expect(payload.found).toBe(true);
    expect(payload.item).toMatchObject({
      name: "Ace of Spades",
      instanceId: "inst-ace",
      location: "Hunter",
      equipped: true,
      locked: true,
      transferable: false,
    });
    expect(payload.item.perks).toEqual(["Outlaw", "Firefly"]);
  });

  test("prints manifest fallback suggestions when inventory item is not found", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      lookupPerk: mock(() => null),
      searchItems: mock(() => [
        {
          hash: 5001,
          name: "Ace of Spades",
          itemType: 3,
          itemSubType: 1,
          tierTypeName: "Exotic",
          bucketHash: 1498876634,
          classType: -1,
          icon: "",
          maxStackSize: 1,
          nonTransferrable: false,
          equippable: true,
        },
        {
          hash: 5002,
          name: "Ace in the Hole",
          itemType: 3,
          itemSubType: 1,
          tierTypeName: "Legendary",
          bucketHash: 1498876634,
          classType: -1,
          icon: "",
          maxStackSize: 1,
          nonTransferrable: false,
          equippable: true,
        },
      ]),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => ({
        all: [],
        byInstanceId: new Map(),
        byHash: new Map(),
        byCharacter: new Map(),
        vaultItems: [],
      })),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerArmoryCommand } = await import(
      `./armory.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runArmory(registerArmoryCommand, [
      "--item",
      "acezz",
    ]);

    expect(result.exitCode).toBeNull();
    expect(
      result.logs.some((line) => line.includes("No inventory item found"))
    ).toBe(true);
    expect(result.logs.some((line) => line.includes("Ace of Spades"))).toBe(true);
  });
});
