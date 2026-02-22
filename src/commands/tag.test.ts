import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { Command } from "commander";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ITEM_KINETIC = {
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
  perks: undefined,
};

const ITEM_ENERGY = {
  ...ITEM_KINETIC,
  hash: 1002,
  instanceId: "inst-2",
  name: "Fatebringer",
  slot: "Energy",
  tier: "Legendary",
};

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
    characterEquipment: { data: { "char-hunter": { items: [] } } },
    characterInventories: { data: { "char-hunter": { items: [] } } },
    profileInventory: { data: { items: [] } },
    itemComponents: { instances: { data: {} } },
  };
}

function makeSingleIndex(item = ITEM_KINETIC) {
  return {
    all: [item],
    byInstanceId: new Map([[item.instanceId!, item]]),
    byHash: new Map([[item.hash, [item]]]),
    byCharacter: new Map([["char-hunter", [item]]]),
    vaultItems: [],
  };
}

function makeMultiIndex() {
  return {
    all: [ITEM_KINETIC, ITEM_ENERGY],
    byInstanceId: new Map([
      [ITEM_KINETIC.instanceId!, ITEM_KINETIC],
      [ITEM_ENERGY.instanceId!, ITEM_ENERGY],
    ]),
    byHash: new Map([
      [ITEM_KINETIC.hash, [ITEM_KINETIC]],
      [ITEM_ENERGY.hash, [ITEM_ENERGY]],
    ]),
    byCharacter: new Map([["char-hunter", [ITEM_KINETIC, ITEM_ENERGY]]]),
    vaultItems: [],
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function runCommand(
  register: (p: Command) => void,
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
    program.exitOverride(); // prevent commander from calling process.exit on --help
    register(program);
    await program.parseAsync(["node", "destiny", ...args]);
  } catch (err: any) {
    if (!err?.message?.startsWith("__exit_")) {
      // Commander's exitOverride throws CommanderError — that's fine
      if (err?.code !== "commander.helpDisplayed" && err?.code !== "commander.unknownOption") {
        // Swallow process.exit simulation
      }
    }
  } finally {
    console.log = origLog;
    console.error = origError;
    (process as any).exit = origExit;
  }

  return { logs, errors, exitCode };
}

// ---------------------------------------------------------------------------
// tag add tests
// ---------------------------------------------------------------------------

describe("tag add", () => {
  afterEach(() => mock.restore());

  test("single match — calls addTag, prints success", async () => {
    const addTagMock = mock(() => {});
    const getProfileMock = mock(async () => makeProfile());
    const buildIndexMock = mock(() => makeSingleIndex());
    const withSpinnerMock = mock(
      async (_: string, fn: () => Promise<unknown>) => fn()
    );

    mock.module("../services/local-db.ts", () => ({
      addTag: addTagMock,
      removeTag: mock(() => {}),
      getTags: mock(() => []),
      setNote: mock(() => {}),
      clearNote: mock(() => {}),
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: getProfileMock,
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: buildIndexMock,
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: withSpinnerMock,
    }));

    const { registerTagCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerTagCommand, ["tag", "add", "Ace of Spades", "god-roll"]);
    expect(addTagMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ace of Spades" }),
      "god-roll"
    );
    expect(result.logs.some((l) => l.includes("god-roll"))).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  test("empty tag rejects before API call", async () => {
    const addTagMock = mock(() => {});
    const getProfileMock = mock(async () => makeProfile());

    mock.module("../api/profile.ts", () => ({
      getProfile: getProfileMock,
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: addTagMock,
      removeTag: mock(() => {}),
      getTags: mock(() => []),
      setNote: mock(() => {}),
      clearNote: mock(() => {}),
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeSingleIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerTagCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerTagCommand, ["tag", "add", "Ace", "  "]);
    expect(result.exitCode).toBe(1);
    expect(addTagMock).not.toHaveBeenCalled();
  });

  test("item not found → error, exit 1", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: mock(() => {}),
      removeTag: mock(() => {}),
      getTags: mock(() => []),
      setNote: mock(() => {}),
      clearNote: mock(() => {}),
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
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
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerTagCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerTagCommand, ["tag", "add", "Nonexistent Item", "tag"]);
    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes("No items found"))).toBe(true);
  });

  test("multiple matches → pickItem called", async () => {
    const pickItemMock = mock(async (_items: any[], _msg: string) => ({
      name: ITEM_KINETIC.name,
      tier: ITEM_KINETIC.tier,
      slot: ITEM_KINETIC.slot,
      instanceId: ITEM_KINETIC.instanceId,
      hash: ITEM_KINETIC.hash,
      quantity: 1,
      isEquipped: false,
      location: "Hunter",
    }));
    const addTagMock = mock(() => {});

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: addTagMock,
      removeTag: mock(() => {}),
      getTags: mock(() => []),
      setNote: mock(() => {}),
      clearNote: mock(() => {}),
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeMultiIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));
    mock.module("../ui/prompts.ts", () => ({
      pickItem: pickItemMock,
      pickCharacter: mock(async () => {}),
      pickDestination: mock(async () => {}),
      confirm: mock(async () => true),
    }));

    const { registerTagCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    // Both items share "of" in name (Ace of Spades, Fatebringer — query "r" matches both? No)
    // Use "a" which matches Ace of Spades, Fatebringer? Let's use a broader query
    await runCommand(registerTagCommand, ["tag", "add", "a", "keeper"]);
    expect(pickItemMock).toHaveBeenCalled();
    expect(addTagMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// tag list tests
// ---------------------------------------------------------------------------

describe("tag list", () => {
  afterEach(() => mock.restore());

  test("empty tags → dim message", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: mock(() => {}),
      removeTag: mock(() => {}),
      getTags: mock(() => []),
      setNote: mock(() => {}),
      clearNote: mock(() => {}),
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeSingleIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerTagCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerTagCommand, ["tag", "list", "Ace of Spades"]);
    expect(result.logs.some((l) => l.includes("no tags"))).toBe(true);
  });

  test("with tags → lists each tag", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: mock(() => {}),
      removeTag: mock(() => {}),
      getTags: mock(() => ["god-roll", "keeper"]),
      setNote: mock(() => {}),
      clearNote: mock(() => {}),
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeSingleIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerTagCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerTagCommand, ["tag", "list", "Ace of Spades"]);
    expect(result.logs.some((l) => l.includes("god-roll"))).toBe(true);
    expect(result.logs.some((l) => l.includes("keeper"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// note show tests
// ---------------------------------------------------------------------------

describe("note show", () => {
  afterEach(() => mock.restore());

  test("no note → dim message", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: mock(() => {}),
      removeTag: mock(() => {}),
      getTags: mock(() => []),
      setNote: mock(() => {}),
      clearNote: mock(() => {}),
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeSingleIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerNoteCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerNoteCommand, ["note", "show", "Ace of Spades"]);
    expect(result.logs.some((l) => l.includes("no note set"))).toBe(true);
  });

  test("with note → prints note text", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: mock(() => {}),
      removeTag: mock(() => {}),
      getTags: mock(() => []),
      setNote: mock(() => {}),
      clearNote: mock(() => {}),
      getNote: mock(() => "Best PvP exotic"),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeSingleIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerNoteCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerNoteCommand, ["note", "show", "Ace of Spades"]);
    expect(result.logs.some((l) => l.includes("Best PvP exotic"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tag remove tests
// ---------------------------------------------------------------------------

describe("tag remove", () => {
  afterEach(() => mock.restore());

  test("single match — calls removeTag, prints success", async () => {
    const removeTagMock = mock(() => {});

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: mock(() => {}),
      removeTag: removeTagMock,
      getTags: mock(() => []),
      setNote: mock(() => {}),
      clearNote: mock(() => {}),
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeSingleIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerTagCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerTagCommand, [
      "tag",
      "remove",
      "Ace of Spades",
      "god-roll",
    ]);
    expect(removeTagMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ace of Spades" }),
      "god-roll"
    );
    expect(result.logs.some((l) => l.includes("Removed tag"))).toBe(true);
    expect(result.exitCode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// note set/clear tests
// ---------------------------------------------------------------------------

describe("note set/clear", () => {
  afterEach(() => mock.restore());

  test("set stores note text", async () => {
    const setNoteMock = mock(() => {});

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: mock(() => {}),
      removeTag: mock(() => {}),
      getTags: mock(() => []),
      setNote: setNoteMock,
      clearNote: mock(() => {}),
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeSingleIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerNoteCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerNoteCommand, [
      "note",
      "set",
      "Ace of Spades",
      "Great in PvP",
    ]);
    expect(setNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ace of Spades" }),
      "Great in PvP"
    );
    expect(result.logs.some((l) => l.includes("Note set"))).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  test("set rejects empty note text", async () => {
    const setNoteMock = mock(() => {});

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: mock(() => {}),
      removeTag: mock(() => {}),
      getTags: mock(() => []),
      setNote: setNoteMock,
      clearNote: mock(() => {}),
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeSingleIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerNoteCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerNoteCommand, [
      "note",
      "set",
      "Ace of Spades",
      "  ",
    ]);
    expect(result.exitCode).toBe(1);
    expect(setNoteMock).not.toHaveBeenCalled();
  });

  test("clear removes note", async () => {
    const clearNoteMock = mock(() => {});

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/local-db.ts", () => ({
      addTag: mock(() => {}),
      removeTag: mock(() => {}),
      getTags: mock(() => []),
      setNote: mock(() => {}),
      clearNote: clearNoteMock,
      getNote: mock(() => null),
      itemKey: (item: any) => item.instanceId ?? `hash:${item.hash}`,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeSingleIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerNoteCommand } = await import(
      `./tag.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerNoteCommand, [
      "note",
      "clear",
      "Ace of Spades",
    ]);
    expect(clearNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ace of Spades" })
    );
    expect(result.logs.some((l) => l.includes("Note cleared"))).toBe(true);
    expect(result.exitCode).toBeNull();
  });
});
