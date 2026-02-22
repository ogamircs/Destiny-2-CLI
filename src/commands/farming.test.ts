import { afterEach, describe, expect, test, mock } from "bun:test";
import { Command } from "commander";

const HUNTER_CHAR = {
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
        [HUNTER_CHAR.characterId]: HUNTER_CHAR,
      },
    },
  };
}

function makeMoveableIndex() {
  const moveable = {
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
    location: HUNTER_CHAR.characterId,
    perks: undefined,
  };

  const equipped = {
    ...moveable,
    hash: 1002,
    instanceId: "inst-2",
    name: "Equipped Gun",
    isEquipped: true,
  };

  return {
    all: [moveable, equipped],
    byInstanceId: new Map([
      [moveable.instanceId!, moveable],
      [equipped.instanceId!, equipped],
    ]),
    byHash: new Map([
      [moveable.hash, [moveable]],
      [equipped.hash, [equipped]],
    ]),
    byCharacter: new Map([[HUNTER_CHAR.characterId, [moveable, equipped]]]),
    vaultItems: [],
  };
}

function makeVaultIndex() {
  const vaultItem = {
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
    location: "vault",
    perks: undefined,
  };

  return {
    all: [vaultItem],
    byInstanceId: new Map([[vaultItem.instanceId!, vaultItem]]),
    byHash: new Map([[vaultItem.hash, [vaultItem]]]),
    byCharacter: new Map([[HUNTER_CHAR.characterId, []]]),
    vaultItems: [vaultItem],
  };
}

async function runFarming(
  registerFarmingCommand: (program: Command) => void,
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
    registerFarmingCommand(program);
    await program.parseAsync(["node", "destiny", "farming", ...args]);
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

describe("farming command", () => {
  afterEach(() => {
    mock.restore();
  });

  test("status prints no active session message", async () => {
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => null),
      deleteLoadout: mock(() => {}),
      listLoadouts: () => [],
    }));

    const { registerFarmingCommand } = await import(
      `./farming.ts?test=${Date.now()}-${Math.random()}`
    );

    const result = await runFarming(registerFarmingCommand, ["status"]);
    expect(result.logs.some((l) => l.includes("No active farming sessions"))).toBe(
      true
    );
    expect(result.exitCode).toBeNull();
  });

  test("start saves farming loadout and executes move plan", async () => {
    const saveLoadoutMock = mock(() => {});
    const planMoveMock = mock(() => ({ isValid: true, steps: [{}] }));
    const executePlanMock = mock(async () => {});
    const createSpinnerMock = mock(() => ({
      text: "",
      start() {
        return this;
      },
      succeed() {
        return this;
      },
    }));

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeMoveableIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: saveLoadoutMock,
      getLoadout: () => null,
      deleteLoadout: mock(() => {}),
      listLoadouts: () => [],
    }));
    mock.module("../services/move-planner.ts", () => ({
      planMove: planMoveMock,
      executePlan: executePlanMock,
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickItem: mock(async () => ({})),
      pickCharacter: mock(async () => ({})),
      pickDestination: mock(async () => ({ type: "vault" })),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: createSpinnerMock,
    }));

    const { registerFarmingCommand } = await import(
      `./farming.ts?test=${Date.now()}-${Math.random()}`
    );

    const result = await runFarming(registerFarmingCommand, [
      "start",
      "--character",
      "hunter",
    ]);

    expect(saveLoadoutMock).toHaveBeenCalledTimes(1);
    expect(saveLoadoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "__farming__:1",
        classType: 1,
      })
    );
    expect(planMoveMock).toHaveBeenCalledTimes(1);
    expect(executePlanMock).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBeNull();
  });

  test("stop exits when no farming session exists for character", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeVaultIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: () => null,
      deleteLoadout: mock(() => {}),
      listLoadouts: () => [],
    }));
    mock.module("../services/move-planner.ts", () => ({
      planMove: mock(() => ({ isValid: true, steps: [{}] })),
      executePlan: mock(async () => {}),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickItem: mock(async () => ({})),
      pickCharacter: mock(async () => ({})),
      pickDestination: mock(async () => ({ type: "vault" })),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_text: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({
        text: "",
        start() {
          return this;
        },
        succeed() {
          return this;
        },
      })),
    }));

    const { registerFarmingCommand } = await import(
      `./farming.ts?test=${Date.now()}-${Math.random()}`
    );

    const result = await runFarming(registerFarmingCommand, [
      "stop",
      "--character",
      "hunter",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.logs.some((l) => l.includes("No farming session found"))).toBe(
      true
    );
  });
});
