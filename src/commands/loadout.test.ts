import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { Command } from "commander";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAR_WARLOCK = {
  characterId: "char-warlock",
  membershipId: "1",
  membershipType: 3,
  dateLastPlayed: "2025-01-01T00:00:00Z",
  minutesPlayedTotal: "200",
  light: 1820,
  classType: 2, // Warlock
  raceType: 0,
  genderType: 0,
  stats: {},
  emblemPath: "",
  emblemBackgroundPath: "",
};

const CHAR_HUNTER = {
  ...CHAR_WARLOCK,
  characterId: "char-hunter",
  classType: 1, // Hunter
};

const CHAR_WARLOCK_ALT = {
  ...CHAR_WARLOCK,
  characterId: "char-warlock-2",
};

const ITEM_EQUIPPED = {
  hash: 2001,
  instanceId: "inst-equip",
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
  power: 1820,
  damageType: 3,
  energyCapacity: undefined,
  energyUsed: undefined,
  isEquipped: true,
  canEquip: true,
  location: "char-warlock",
  perks: undefined,
};

const ITEM_VAULT = {
  ...ITEM_EQUIPPED,
  hash: 2002,
  instanceId: "inst-vault",
  name: "Fatebringer",
  tier: "Legendary",
  isEquipped: false,
  location: "vault",
};

const ITEM_ON_CHAR_NOT_EQUIPPED = {
  ...ITEM_EQUIPPED,
  hash: 2003,
  instanceId: "inst-char-neq",
  name: "Gjallarhorn",
  isEquipped: false,
  location: "char-warlock",
};

function makeProfile(
  characters: Array<typeof CHAR_WARLOCK> = [CHAR_WARLOCK]
) {
  const characterData = Object.fromEntries(
    characters.map((character) => [character.characterId, character])
  );
  const emptyEquipment = Object.fromEntries(
    characters.map((character) => [character.characterId, { items: [] }])
  );

  return {
    characters: {
      data: characterData,
    },
    characterEquipment: { data: emptyEquipment },
    characterInventories: { data: emptyEquipment },
    profileInventory: { data: { items: [] } },
    itemComponents: { instances: { data: {} } },
  };
}

function makeIndexWithEquipped() {
  return {
    all: [ITEM_EQUIPPED],
    byInstanceId: new Map([[ITEM_EQUIPPED.instanceId!, ITEM_EQUIPPED]]),
    byHash: new Map([[ITEM_EQUIPPED.hash, [ITEM_EQUIPPED]]]),
    byCharacter: new Map([["char-warlock", [ITEM_EQUIPPED]]]),
    vaultItems: [],
  };
}

function makeIndexWithVaultAndChar() {
  return {
    all: [ITEM_EQUIPPED, ITEM_VAULT, ITEM_ON_CHAR_NOT_EQUIPPED],
    byInstanceId: new Map([
      [ITEM_EQUIPPED.instanceId!, ITEM_EQUIPPED],
      [ITEM_VAULT.instanceId!, ITEM_VAULT],
      [ITEM_ON_CHAR_NOT_EQUIPPED.instanceId!, ITEM_ON_CHAR_NOT_EQUIPPED],
    ]),
    byHash: new Map([
      [ITEM_EQUIPPED.hash, [ITEM_EQUIPPED]],
      [ITEM_VAULT.hash, [ITEM_VAULT]],
      [ITEM_ON_CHAR_NOT_EQUIPPED.hash, [ITEM_ON_CHAR_NOT_EQUIPPED]],
    ]),
    byCharacter: new Map([
      ["char-warlock", [ITEM_EQUIPPED, ITEM_ON_CHAR_NOT_EQUIPPED]],
    ]),
    vaultItems: [ITEM_VAULT],
  };
}

// ---------------------------------------------------------------------------
// runCommand helper
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
    program.exitOverride();
    register(program);
    await program.parseAsync(["node", "destiny", ...args]);
  } catch (err: any) {
    if (!err?.message?.startsWith("__exit_")) {
      if (err?.code !== "commander.helpDisplayed" && err?.code !== "commander.unknownOption") {
        // swallow
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
// create tests
// ---------------------------------------------------------------------------

describe("loadout create", () => {
  afterEach(() => mock.restore());

  test("saves equipped items → saveLoadout called with correct items", async () => {
    const saveLoadoutMock = mock(() => {});

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: saveLoadoutMock,
      getLoadout: mock(() => null),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "create", "My Build", "--character", "warlock",
    ]);

    expect(saveLoadoutMock).toHaveBeenCalledTimes(1);
    const call = saveLoadoutMock.mock.calls[0]![0] as any;
    expect(call.name).toBe("My Build");
    expect(call.classType).toBe(2);
    expect(call.items).toHaveLength(1);
    expect(call.items[0].instanceId).toBe("inst-equip");
    expect(call.items[0].isEquipped).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  test("name already exists → confirm called; denied → saveLoadout not called", async () => {
    const saveLoadoutMock = mock(() => {});
    const confirmMock = mock(async () => false);
    const existingLoadout = {
      name: "My Build",
      classType: 2,
      items: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: saveLoadoutMock,
      getLoadout: mock(() => existingLoadout),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: confirmMock,
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    await runCommand(registerLoadoutCommand, [
      "loadout", "create", "My Build", "--character", "warlock",
    ]);

    expect(confirmMock).toHaveBeenCalled();
    expect(saveLoadoutMock).not.toHaveBeenCalled();
  });

  test("name already exists → confirm accepted → saveLoadout called", async () => {
    const saveLoadoutMock = mock(() => {});
    const confirmMock = mock(async () => true);
    const existingLoadout = {
      name: "My Build",
      classType: 2,
      items: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: saveLoadoutMock,
      getLoadout: mock(() => existingLoadout),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: confirmMock,
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "create", "My Build", "--character", "warlock",
    ]);

    expect(result.exitCode).toBeNull();
    expect(confirmMock).toHaveBeenCalled();
    expect(String(confirmMock.mock.calls[0]?.[0] ?? "")).toContain("Overwrite");
    expect(saveLoadoutMock).toHaveBeenCalledTimes(1);
    const call = saveLoadoutMock.mock.calls[0]![0] as any;
    expect(call.name).toBe("My Build");
    expect(call.items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// list tests
// ---------------------------------------------------------------------------

describe("loadout list", () => {
  afterEach(() => mock.restore());

  test("no loadouts → dim message", async () => {
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => null),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, ["loadout", "list"]);
    expect(result.logs.some((l) => l.includes("No loadouts saved"))).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  test("farming entries filtered out", async () => {
    const farmingLoadout = {
      name: "__farming__:2",
      classType: 2,
      items: [],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const realLoadout = {
      name: "Raid Build",
      classType: 2,
      items: [{ hash: 1, instanceId: "i1", bucketHash: 2, isEquipped: true }],
      createdAt: 1001,
      updatedAt: 1001,
    };

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => null),
      listLoadouts: mock(() => [farmingLoadout, realLoadout]),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, ["loadout", "list"]);
    const allOutput = result.logs.join("\n");
    expect(allOutput).toContain("Raid Build");
    expect(allOutput).not.toContain("__farming__");
    expect(result.exitCode).toBeNull();
  });

  test("only farming entries → dim message", async () => {
    const farmingLoadout = {
      name: "__farming__:2",
      classType: 2,
      items: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => null),
      listLoadouts: mock(() => [farmingLoadout]),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, ["loadout", "list"]);
    expect(result.logs.some((l) => l.includes("No loadouts saved"))).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  test("normal loadouts rendered in table", async () => {
    const realLoadout = {
      name: "PvP Build",
      classType: 1,
      items: [
        { hash: 1, instanceId: "i1", bucketHash: 2, isEquipped: true },
        { hash: 3, instanceId: "i2", bucketHash: 4, isEquipped: true },
      ],
      createdAt: 1001,
      updatedAt: 1001,
    };

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => null),
      listLoadouts: mock(() => [realLoadout]),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, ["loadout", "list"]);
    const allOutput = result.logs.join("\n");
    expect(allOutput).toContain("PvP Build");
    expect(allOutput).toContain("Hunter");
    expect(allOutput).toContain("2"); // item count
    expect(result.exitCode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// apply tests
// ---------------------------------------------------------------------------

describe("loadout apply", () => {
  afterEach(() => mock.restore());

  function setupApplyMocks({
    loadout,
    index,
    profile,
    planMoveMock,
    executePlanMock,
    equipItemMock,
    pickCharacterMock,
  }: {
    loadout: any;
    index: any;
    profile?: any;
    planMoveMock?: ReturnType<typeof mock>;
    executePlanMock?: ReturnType<typeof mock>;
    equipItemMock?: ReturnType<typeof mock>;
    pickCharacterMock?: ReturnType<typeof mock>;
  }) {
    const _planMoveMock = planMoveMock ?? mock(() => ({ isValid: true, steps: [], errors: [] }));
    const _executePlanMock = executePlanMock ?? mock(async () => {});
    const _equipItemMock = equipItemMock ?? mock(async () => {});
    const _pickCharacterMock = pickCharacterMock ?? mock(async () => CHAR_WARLOCK);

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => profile ?? makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => index),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => loadout),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../services/move-planner.ts", () => ({
      planMove: _planMoveMock,
      executePlan: _executePlanMock,
    }));
    mock.module("../api/inventory.ts", () => ({
      equipItem: _equipItemMock,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({
        start: () => ({
          text: "",
          succeed: (msg?: string) => { if (msg) console.log(msg); },
          fail: () => {},
        }),
      })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: _pickCharacterMock,
    }));

    return {
      planMoveMock: _planMoveMock,
      executePlanMock: _executePlanMock,
      equipItemMock: _equipItemMock,
      pickCharacterMock: _pickCharacterMock,
    };
  }

  test("item in vault → planMove + executePlan + equipItem all called", async () => {
    const loadout = {
      name: "Vault Build",
      classType: 2,
      items: [
        { hash: ITEM_VAULT.hash, instanceId: ITEM_VAULT.instanceId, bucketHash: ITEM_VAULT.bucketHash, isEquipped: true },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const index = makeIndexWithVaultAndChar();

    const planMoveMock = mock(() => ({ isValid: true, steps: [{}], errors: [] }));
    const executePlanMock = mock(async () => {});
    const equipItemMock = mock(async () => {});

    const { } = setupApplyMocks({ loadout, index, planMoveMock, executePlanMock, equipItemMock });

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    await runCommand(registerLoadoutCommand, ["loadout", "apply", "Vault Build", "--character", "warlock"]);

    expect(planMoveMock).toHaveBeenCalled();
    expect(executePlanMock).toHaveBeenCalled();
    expect(equipItemMock).toHaveBeenCalledWith(ITEM_VAULT.instanceId, "char-warlock");
  });

  test("item already equipped on target → no API calls", async () => {
    const loadout = {
      name: "Equipped Build",
      classType: 2,
      items: [
        { hash: ITEM_EQUIPPED.hash, instanceId: ITEM_EQUIPPED.instanceId, bucketHash: ITEM_EQUIPPED.bucketHash, isEquipped: true },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const index = makeIndexWithVaultAndChar();

    const planMoveMock = mock(() => ({ isValid: true, steps: [], errors: [] }));
    const executePlanMock = mock(async () => {});
    const equipItemMock = mock(async () => {});

    setupApplyMocks({ loadout, index, planMoveMock, executePlanMock, equipItemMock });

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    await runCommand(registerLoadoutCommand, ["loadout", "apply", "Equipped Build", "--character", "warlock"]);

    expect(planMoveMock).not.toHaveBeenCalled();
    expect(executePlanMock).not.toHaveBeenCalled();
    expect(equipItemMock).not.toHaveBeenCalled();
  });

  test("item on target character but not equipped → only equipItem called", async () => {
    const loadout = {
      name: "Char Not Equip Build",
      classType: 2,
      items: [
        {
          hash: ITEM_ON_CHAR_NOT_EQUIPPED.hash,
          instanceId: ITEM_ON_CHAR_NOT_EQUIPPED.instanceId,
          bucketHash: ITEM_ON_CHAR_NOT_EQUIPPED.bucketHash,
          isEquipped: true,
        },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const index = makeIndexWithVaultAndChar();

    const planMoveMock = mock(() => ({ isValid: true, steps: [], errors: [] }));
    const executePlanMock = mock(async () => {});
    const equipItemMock = mock(async () => {});

    setupApplyMocks({ loadout, index, planMoveMock, executePlanMock, equipItemMock });

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    await runCommand(registerLoadoutCommand, ["loadout", "apply", "Char Not Equip Build", "--character", "warlock"]);

    expect(planMoveMock).not.toHaveBeenCalled();
    expect(executePlanMock).not.toHaveBeenCalled();
    expect(equipItemMock).toHaveBeenCalledWith(ITEM_ON_CHAR_NOT_EQUIPPED.instanceId, "char-warlock");
  });

  test("item not found → skipped count incremented, no crash", async () => {
    const loadout = {
      name: "Missing Build",
      classType: 2,
      items: [
        { hash: 9999, instanceId: "nonexistent", bucketHash: 1, isEquipped: true },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const index = makeIndexWithVaultAndChar();

    const equipItemMock = mock(async () => {});

    setupApplyMocks({ loadout, index, equipItemMock });

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "apply", "Missing Build", "--character", "warlock",
    ]);

    expect(equipItemMock).not.toHaveBeenCalled();
    expect(result.exitCode).toBeNull();
    // skipped=1, equipped=0
    const allOutput = [...result.logs, ...result.errors].join("\n");
    expect(allOutput).toMatch(/1 skipped/);
  });

  test("character auto-resolved from classType when --character not given", async () => {
    const loadout = {
      name: "Auto Build",
      classType: 2, // Warlock
      items: [
        { hash: ITEM_EQUIPPED.hash, instanceId: ITEM_EQUIPPED.instanceId, bucketHash: ITEM_EQUIPPED.bucketHash, isEquipped: true },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const index = makeIndexWithEquipped(); // only warlock character

    const equipItemMock = mock(async () => {});

    setupApplyMocks({ loadout, index, equipItemMock });

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    // No --character flag
    const result = await runCommand(registerLoadoutCommand, ["loadout", "apply", "Auto Build"]);
    expect(result.exitCode).toBeNull();
  });

  test("auto-resolve with multiple class matches → pickCharacter result is used", async () => {
    const loadout = {
      name: "Auto Build Multi",
      classType: 2, // Warlock
      items: [
        { hash: ITEM_VAULT.hash, instanceId: ITEM_VAULT.instanceId, bucketHash: ITEM_VAULT.bucketHash, isEquipped: true },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const profile = makeProfile([CHAR_WARLOCK, CHAR_WARLOCK_ALT, CHAR_HUNTER]);
    const index = makeIndexWithVaultAndChar();
    const pickCharacterMock = mock(async () => CHAR_WARLOCK_ALT);
    const equipItemMock = mock(async () => {});

    setupApplyMocks({ loadout, index, profile, pickCharacterMock, equipItemMock });

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, ["loadout", "apply", "Auto Build Multi"]);

    expect(result.exitCode).toBeNull();
    expect(pickCharacterMock).toHaveBeenCalledTimes(1);
    const pickedChoices = pickCharacterMock.mock.calls[0]?.[0] as any[];
    expect(pickedChoices).toHaveLength(2);
    expect(pickedChoices.map((character) => character.characterId)).toEqual(
      expect.arrayContaining([CHAR_WARLOCK.characterId, CHAR_WARLOCK_ALT.characterId])
    );
    expect(equipItemMock).toHaveBeenCalledWith(ITEM_VAULT.instanceId, CHAR_WARLOCK_ALT.characterId);
  });

  test("auto-resolve with no matching class → error + exit 1", async () => {
    const loadout = {
      name: "Auto Build Missing Class",
      classType: 2, // Warlock
      items: [],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const profile = makeProfile([CHAR_HUNTER]);
    const index = {
      all: [],
      byInstanceId: new Map(),
      byHash: new Map(),
      byCharacter: new Map(),
      vaultItems: [],
    };
    const pickCharacterMock = mock(async () => CHAR_HUNTER);

    setupApplyMocks({ loadout, index, profile, pickCharacterMock });

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, ["loadout", "apply", "Auto Build Missing Class"]);

    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("No Warlock character found");
    expect(pickCharacterMock).not.toHaveBeenCalled();
  });

  test("instance fallback by hash prefers target character over vault candidate", async () => {
    const sharedHash = 50101;
    const charCandidate = {
      ...ITEM_ON_CHAR_NOT_EQUIPPED,
      hash: sharedHash,
      instanceId: "inst-shared-char",
      location: CHAR_WARLOCK.characterId,
      isEquipped: false,
    };
    const vaultCandidate = {
      ...ITEM_VAULT,
      hash: sharedHash,
      instanceId: "inst-shared-vault",
      location: "vault",
      isEquipped: false,
    };
    const index = {
      all: [charCandidate, vaultCandidate],
      byInstanceId: new Map([
        [charCandidate.instanceId, charCandidate],
        [vaultCandidate.instanceId, vaultCandidate],
      ]),
      byHash: new Map([[sharedHash, [vaultCandidate, charCandidate]]]),
      byCharacter: new Map([[CHAR_WARLOCK.characterId, [charCandidate]]]),
      vaultItems: [vaultCandidate],
    };
    const loadout = {
      name: "Hash Fallback Build",
      classType: 2,
      items: [
        { hash: sharedHash, instanceId: "missing-instance", bucketHash: charCandidate.bucketHash, isEquipped: true },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const planMoveMock = mock(() => ({ isValid: true, steps: [{}], errors: [] }));
    const executePlanMock = mock(async () => {});
    const equipItemMock = mock(async () => {});

    setupApplyMocks({ loadout, index, planMoveMock, executePlanMock, equipItemMock });

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "apply", "Hash Fallback Build", "--character", "warlock",
    ]);

    expect(result.exitCode).toBeNull();
    expect(planMoveMock).not.toHaveBeenCalled();
    expect(executePlanMock).not.toHaveBeenCalled();
    expect(equipItemMock).toHaveBeenCalledWith("inst-shared-char", CHAR_WARLOCK.characterId);
  });

  test("invalid move plan → item skipped without execute/equip", async () => {
    const loadout = {
      name: "Invalid Plan Build",
      classType: 2,
      items: [
        { hash: ITEM_VAULT.hash, instanceId: ITEM_VAULT.instanceId, bucketHash: ITEM_VAULT.bucketHash, isEquipped: true },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    };
    const index = makeIndexWithVaultAndChar();
    const planMoveMock = mock(() => ({ isValid: false, steps: [], errors: ["blocked"] }));
    const executePlanMock = mock(async () => {});
    const equipItemMock = mock(async () => {});

    setupApplyMocks({ loadout, index, planMoveMock, executePlanMock, equipItemMock });

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "apply", "Invalid Plan Build", "--character", "warlock",
    ]);

    expect(result.exitCode).toBeNull();
    expect(planMoveMock).toHaveBeenCalledTimes(1);
    expect(executePlanMock).not.toHaveBeenCalled();
    expect(equipItemMock).not.toHaveBeenCalled();
    expect(result.logs.join("\n")).toMatch(/1 skipped/);
  });
});

// ---------------------------------------------------------------------------
// delete tests
// ---------------------------------------------------------------------------

describe("loadout delete", () => {
  afterEach(() => mock.restore());

  test("not found → error + exit 1", async () => {
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => null),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, ["loadout", "delete", "Ghost Build"]);
    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes("Ghost Build"))).toBe(true);
  });

  test("confirmed → deleteLoadout called", async () => {
    const deleteLoadoutMock = mock(() => {});
    const existingLoadout = {
      name: "Raid Build",
      classType: 2,
      items: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => existingLoadout),
      listLoadouts: mock(() => []),
      deleteLoadout: deleteLoadoutMock,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    await runCommand(registerLoadoutCommand, ["loadout", "delete", "Raid Build"]);
    expect(deleteLoadoutMock).toHaveBeenCalledWith("Raid Build");
  });

  test("denied → deleteLoadout not called", async () => {
    const deleteLoadoutMock = mock(() => {});
    const existingLoadout = {
      name: "Raid Build",
      classType: 2,
      items: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => existingLoadout),
      listLoadouts: mock(() => []),
      deleteLoadout: deleteLoadoutMock,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => false), // denied
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    await runCommand(registerLoadoutCommand, ["loadout", "delete", "Raid Build"]);
    expect(deleteLoadoutMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// export tests
// ---------------------------------------------------------------------------

describe("loadout export", () => {
  afterEach(() => mock.restore());

  test("not found → error + exit 1", async () => {
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => null),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, ["loadout", "export", "NonExistent"]);
    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes("NonExistent"))).toBe(true);
  });

  test("happy path → Bun.write called with JSON", async () => {
    const existingLoadout = {
      name: "Raid Build",
      classType: 2,
      items: [{ hash: 1, instanceId: "i1", bucketHash: 2, isEquipped: true }],
      createdAt: 1000,
      updatedAt: 1001,
    };

    const writtenFiles: { path: string; content: string }[] = [];
    const origWrite = Bun.write;
    (Bun as any).write = async (path: string, content: string) => {
      writtenFiles.push({ path, content });
    };

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => existingLoadout),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "export", "Raid Build", "--out", "/tmp/raid-build.json",
    ]);

    (Bun as any).write = origWrite;

    expect(result.exitCode).toBeNull();
    expect(writtenFiles).toHaveLength(1);
    expect(writtenFiles[0]!.path).toBe("/tmp/raid-build.json");
    const parsed = JSON.parse(writtenFiles[0]!.content);
    expect(parsed.name).toBe("Raid Build");
    expect(parsed.items).toHaveLength(1);
  });

  test("no --out → writes to sanitized default file in cwd", async () => {
    const existingLoadout = {
      name: "Raid Build: S19",
      classType: 2,
      items: [{ hash: 1, instanceId: "i1", bucketHash: 2, isEquipped: true }],
      createdAt: 1000,
      updatedAt: 1001,
    };

    const writtenFiles: { path: string; content: string }[] = [];
    const origWrite = Bun.write;
    (Bun as any).write = async (path: string, content: string) => {
      writtenFiles.push({ path, content });
    };

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => existingLoadout),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "export", "Raid Build: S19",
    ]);

    (Bun as any).write = origWrite;

    expect(result.exitCode).toBeNull();
    expect(writtenFiles).toHaveLength(1);
    expect(writtenFiles[0]!.path).toBe(`${process.cwd()}/raid-build--s19.json`);
    const parsed = JSON.parse(writtenFiles[0]!.content);
    expect(parsed.name).toBe("Raid Build: S19");
  });
});

// ---------------------------------------------------------------------------
// import tests
// ---------------------------------------------------------------------------

describe("loadout import", () => {
  afterEach(() => mock.restore());

  test("missing file → error + exit 1", async () => {
    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => null),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "import", "/tmp/this-file-does-not-exist-xyz.json",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.includes("not found") || e.includes("File"))).toBe(true);
  });

  test("malformed JSON → error + exit 1", async () => {
    // Write a temp file with bad JSON
    const tmpPath = `/tmp/bad-json-${Date.now()}.json`;
    await Bun.write(tmpPath, "not valid json {{{{");

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: mock(() => {}),
      getLoadout: mock(() => null),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, ["loadout", "import", tmpPath]);
    expect(result.exitCode).toBe(1);
    expect(result.errors.some((e) => e.toLowerCase().includes("json") || e.toLowerCase().includes("parse"))).toBe(true);
  });

  test("happy path → saveLoadout called", async () => {
    const tmpPath = `/tmp/valid-loadout-${Date.now()}.json`;
    const loadoutData = {
      name: "Imported Build",
      classType: 2,
      items: [{ hash: 1, instanceId: "i1", bucketHash: 2, isEquipped: true }],
      createdAt: 1000,
      updatedAt: 1001,
    };
    await Bun.write(tmpPath, JSON.stringify(loadoutData));

    const saveLoadoutMock = mock(() => {});

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: saveLoadoutMock,
      getLoadout: mock(() => null),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, ["loadout", "import", tmpPath]);
    expect(result.exitCode).toBeNull();
    expect(saveLoadoutMock).toHaveBeenCalledTimes(1);
    const call = saveLoadoutMock.mock.calls[0]![0] as any;
    expect(call.name).toBe("Imported Build");
    expect(call.items).toHaveLength(1);
  });

  test("--name flag overrides name from file", async () => {
    const tmpPath = `/tmp/override-name-${Date.now()}.json`;
    const loadoutData = {
      name: "Original Name",
      classType: 2,
      items: [],
      createdAt: 1000,
      updatedAt: 1001,
    };
    await Bun.write(tmpPath, JSON.stringify(loadoutData));

    const saveLoadoutMock = mock(() => {});

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: saveLoadoutMock,
      getLoadout: mock(() => null),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: mock(async () => true),
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "import", tmpPath, "--name", "Overridden Name",
    ]);
    expect(result.exitCode).toBeNull();
    expect(saveLoadoutMock).toHaveBeenCalledTimes(1);
    const call = saveLoadoutMock.mock.calls[0]![0] as any;
    expect(call.name).toBe("Overridden Name");
  });

  test("existing loadout + denied overwrite prompt → saveLoadout not called", async () => {
    const tmpPath = `/tmp/import-overwrite-deny-${Date.now()}.json`;
    const loadoutData = {
      name: "Existing Build",
      classType: 2,
      items: [],
      createdAt: 1000,
      updatedAt: 1001,
    };
    await Bun.write(tmpPath, JSON.stringify(loadoutData));

    const saveLoadoutMock = mock(() => {});
    const confirmMock = mock(async () => false);

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: saveLoadoutMock,
      getLoadout: mock(() => loadoutData),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: confirmMock,
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "import", tmpPath,
    ]);

    expect(result.exitCode).toBeNull();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(String(confirmMock.mock.calls[0]?.[0] ?? "")).toContain("Overwrite");
    expect(saveLoadoutMock).not.toHaveBeenCalled();
  });

  test("existing overridden name + accepted overwrite prompt → saveLoadout called", async () => {
    const tmpPath = `/tmp/import-overwrite-accept-${Date.now()}.json`;
    const loadoutData = {
      name: "From File",
      classType: 2,
      items: [{ hash: 1, instanceId: "i1", bucketHash: 2, isEquipped: true }],
      createdAt: 1000,
      updatedAt: 1001,
    };
    await Bun.write(tmpPath, JSON.stringify(loadoutData));

    const saveLoadoutMock = mock(() => {});
    const confirmMock = mock(async () => true);
    const existingLoadout = {
      name: "Overridden Name",
      classType: 2,
      items: [],
      createdAt: 1000,
      updatedAt: 1001,
    };

    mock.module("../services/local-db.ts", () => ({
      saveLoadout: saveLoadoutMock,
      getLoadout: mock((name: string) => (name === "Overridden Name" ? existingLoadout : null)),
      listLoadouts: mock(() => []),
      deleteLoadout: mock(() => {}),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
      createSpinner: mock(() => ({ start: () => ({ text: "", succeed: () => {}, fail: () => {} }) })),
    }));
    mock.module("../ui/prompts.ts", () => ({
      confirm: confirmMock,
      pickCharacter: mock(async () => CHAR_WARLOCK),
    }));
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndexWithEquipped()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));

    const { registerLoadoutCommand } = await import(
      `./loadout.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerLoadoutCommand, [
      "loadout", "import", tmpPath, "--name", "Overridden Name",
    ]);

    expect(result.exitCode).toBeNull();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(String(confirmMock.mock.calls[0]?.[0] ?? "")).toContain("Overridden Name");
    expect(saveLoadoutMock).toHaveBeenCalledTimes(1);
    const call = saveLoadoutMock.mock.calls[0]![0] as any;
    expect(call.name).toBe("Overridden Name");
    expect(call.items).toHaveLength(1);
  });
});
