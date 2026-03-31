import { afterEach, describe, expect, mock, test } from "bun:test";
import { Command } from "commander";

function makeCharacters() {
  return [
    {
      characterId: "titan-id",
      classType: 0,
      membershipId: "1",
      membershipType: 3,
      dateLastPlayed: "2025-01-01T00:00:00Z",
      minutesPlayedTotal: "100",
      light: 1800,
      raceType: 0,
      genderType: 0,
      stats: {},
      emblemPath: "",
      emblemBackgroundPath: "",
    },
    {
      characterId: "hunter-id",
      classType: 1,
      membershipId: "1",
      membershipType: 3,
      dateLastPlayed: "2025-01-01T00:00:00Z",
      minutesPlayedTotal: "100",
      light: 1810,
      raceType: 0,
      genderType: 0,
      stats: {},
      emblemPath: "",
      emblemBackgroundPath: "",
    },
  ];
}

function makeIndex() {
  return {
    all: [
      {
        hash: 1001,
        instanceId: "inst-vault-1",
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
      },
    ],
    byInstanceId: new Map(),
    byHash: new Map(),
    byCharacter: new Map(),
    vaultItems: [],
  };
}

const CLASS_NAMES: Record<number, string> = { 0: "Titan", 1: "Hunter", 2: "Warlock" };

function defaultResolveCharacter(
  characters: ReturnType<typeof makeCharacters>,
  query: string
) {
  const lower = query.toLowerCase();
  const character = characters.find(
    (c) => (CLASS_NAMES[c.classType] ?? "Unknown").toLowerCase() === lower
  );
  if (!character) {
    throw new Error(
      `Character "${query}" not found. Available: ${characters
        .map((c) => (CLASS_NAMES[c.classType] ?? "Unknown").toLowerCase())
        .join(", ")}`
    );
  }
  return character;
}

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
      }
    }
  } finally {
    console.log = origLog;
    console.error = origError;
    (process as unknown as { exit: typeof process.exit }).exit = origExit;
  }

  return { logs, errors, exitCode };
}

function wrapCommandAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<void>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await action(...args);
    } catch (err) {
      console.error(err instanceof Error ? `✗ ${err.message}` : `✗ ${String(err)}`);
      process.exit(1);
    }
  };
}

describe("transfer command", () => {
  afterEach(() => mock.restore());

  test("moves a vault item to an explicit character using shared inventory context", async () => {
    const loadInventoryContextMock = mock(async () => ({
      profile: {},
      characters: makeCharacters(),
      byCharacterId: new Map(makeCharacters().map((character) => [character.characterId, character])),
      index: makeIndex(),
    }));
    const resolveCharacterMock = mock(
      (characters: ReturnType<typeof makeCharacters>, query: string) =>
        defaultResolveCharacter(characters, query)
    );
    const transferItemMock = mock(async () => undefined);
    const spinner = {
      text: "",
      start: mock(function () {
        return spinner;
      }),
      succeed: mock(() => spinner),
      fail: mock(() => spinner),
    };

    mock.module("./shared.ts", () => ({
      loadInventoryContext: loadInventoryContextMock,
      resolveCharacter: resolveCharacterMock,
      locationLabel: (location: string) => (location === "vault" ? "Vault" : "Hunter"),
      runCommandAction: wrapCommandAction,
      toLocatedItem: (item: ReturnType<typeof makeIndex>["all"][number]) => ({
        name: item.name,
        tier: item.tier,
        slot: "",
        instanceId: item.instanceId,
        hash: item.hash,
        quantity: item.quantity,
        isEquipped: item.isEquipped,
        location: "Vault",
        characterId: undefined,
        inVault: true,
      }),
    }));
    mock.module("../api/inventory.ts", () => ({
      transferItem: transferItemMock,
      equipItem: mock(async () => undefined),
    }));
    mock.module("../ui/spinner.ts", () => ({
      createSpinner: mock(() => spinner),
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));
    mock.module("../ui/prompts.ts", () => ({
      pickItem: mock(async () => {
        throw new Error("not used");
      }),
      pickCharacter: mock(async () => {
        throw new Error("not used");
      }),
      pickDestination: mock(async () => {
        throw new Error("not used");
      }),
      confirm: mock(async () => true),
    }));

    const { registerTransferCommand } = await import(
      `./transfer.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerTransferCommand, [
      "transfer",
      "Ace",
      "--to",
      "hunter",
    ]);

    expect(result.exitCode).toBeNull();
    expect(loadInventoryContextMock).toHaveBeenCalledTimes(1);
    expect(transferItemMock).toHaveBeenCalledWith(
      1001,
      1,
      false,
      "inst-vault-1",
      "hunter-id"
    );
  });

  test("exits with code 1 for invalid character name", async () => {
    const loadInventoryContextMock = mock(async () => ({
      profile: {},
      characters: makeCharacters(),
      byCharacterId: new Map(makeCharacters().map((character) => [character.characterId, character])),
      index: makeIndex(),
    }));
    const resolveCharacterMock = mock(
      (characters: ReturnType<typeof makeCharacters>, query: string) =>
        defaultResolveCharacter(characters, query)
    );
    const spinner = {
      text: "",
      start: mock(function () {
        return spinner;
      }),
      succeed: mock(() => spinner),
      fail: mock(() => spinner),
    };

    mock.module("./shared.ts", () => ({
      loadInventoryContext: loadInventoryContextMock,
      resolveCharacter: resolveCharacterMock,
      locationLabel: (location: string) => (location === "vault" ? "Vault" : "Hunter"),
      runCommandAction: wrapCommandAction,
      toLocatedItem: (item: ReturnType<typeof makeIndex>["all"][number]) => ({
        name: item.name,
        tier: item.tier,
        slot: "",
        instanceId: item.instanceId,
        hash: item.hash,
        quantity: item.quantity,
        isEquipped: item.isEquipped,
        location: "Vault",
        characterId: undefined,
        inVault: true,
      }),
    }));
    mock.module("../api/inventory.ts", () => ({
      transferItem: mock(async () => undefined),
      equipItem: mock(async () => undefined),
    }));
    mock.module("../ui/spinner.ts", () => ({
      createSpinner: mock(() => spinner),
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));
    mock.module("../ui/prompts.ts", () => ({
      pickItem: mock(async () => {
        throw new Error("not used");
      }),
      pickCharacter: mock(async () => {
        throw new Error("not used");
      }),
      pickDestination: mock(async () => {
        throw new Error("not used");
      }),
      confirm: mock(async () => true),
    }));

    const { registerTransferCommand } = await import(
      `./transfer.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerTransferCommand, [
      "transfer",
      "Ace",
      "--to",
      "warlock",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((line) => line.includes("Character"))).toBe(true);
  });
});
