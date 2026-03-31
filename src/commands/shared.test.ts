import { afterEach, describe, expect, mock, test } from "bun:test";

function makeCharacters() {
  return [
    {
      characterId: "titan-id",
      classType: 0,
      membershipId: "1",
      membershipType: 3,
      dateLastPlayed: "2025-01-01T00:00:00.000Z",
      minutesPlayedTotal: "100",
      light: 2000,
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
      dateLastPlayed: "2025-01-02T00:00:00.000Z",
      minutesPlayedTotal: "200",
      light: 2010,
      raceType: 1,
      genderType: 1,
      stats: {},
      emblemPath: "",
      emblemBackgroundPath: "",
    },
  ];
}

describe("command shared helpers", () => {
  afterEach(() => mock.restore());

  test("resolveCharacter matches class names case-insensitively", async () => {
    const helpers = await import(`./shared.ts?t=${Date.now()}-${Math.random()}`);

    const character = helpers.resolveCharacter(makeCharacters(), "HuNtEr");

    expect(character.characterId).toBe("hunter-id");
  });

  test("resolveCharacter lists available classes when missing", async () => {
    const helpers = await import(`./shared.ts?t=${Date.now()}-${Math.random()}`);

    expect(() => helpers.resolveCharacter(makeCharacters(), "warlock")).toThrow(
      'Character "warlock" not found. Available: titan, hunter'
    );
  });

  test("locationLabel resolves vault and character ids", async () => {
    const helpers = await import(`./shared.ts?t=${Date.now()}-${Math.random()}`);
    const byCharacterId = new Map(makeCharacters().map((character) => [character.characterId, character]));

    expect(helpers.locationLabel("vault", byCharacterId)).toBe("Vault");
    expect(helpers.locationLabel("hunter-id", byCharacterId)).toBe("Hunter");
  });

  test("resolveIndexedItem picks from multiple substring matches", async () => {
    const pickItemMock = mock(async (items: Array<{ instanceId?: string }>) => items[1]!);
    mock.module("../ui/prompts.ts", () => ({
      pickItem: pickItemMock,
    }));

    const helpers = await import(`./shared.ts?t=${Date.now()}-${Math.random()}`);
    const characters = makeCharacters();
    const first = {
      hash: 1001,
      instanceId: "ace-1",
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
      power: 2000,
      damageType: 1,
      energyCapacity: undefined,
      energyUsed: undefined,
      isEquipped: false,
      canEquip: true,
      location: "titan-id",
      perks: undefined,
    };
    const second = {
      ...first,
      instanceId: "ace-2",
      location: "hunter-id",
    };

    const byCharacterId = new Map(characters.map((c) => [c.characterId, c]));
    const selected = await helpers.resolveIndexedItem(
      {
        all: [first, second],
        byInstanceId: new Map([
          ["ace-1", first],
          ["ace-2", second],
        ]),
        byHash: new Map([[1001, [first, second]]]),
        byCharacter: new Map(),
        vaultItems: [],
      },
      byCharacterId,
      "ace"
    );

    expect(selected.instanceId).toBe("ace-2");
    expect(pickItemMock).toHaveBeenCalledTimes(1);
  });

  test("loadInventoryContext loads manifest, profile, and index", async () => {
    const ensureManifestMock = mock(async () => {});
    const getProfileMock = mock(async () => ({
      characters: {
        data: {
          "hunter-id": makeCharacters()[1],
        },
      },
    }));
    const buildInventoryIndexMock = mock(() => ({
      all: [],
      byInstanceId: new Map(),
      byHash: new Map(),
      byCharacter: new Map(),
      vaultItems: [],
    }));
    const withSpinnerMock = mock(async (_message: string, fn: () => Promise<unknown>) => fn());

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: ensureManifestMock,
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: getProfileMock,
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: buildInventoryIndexMock,
      getRequiredComponents: () => [200, 201, 205],
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: withSpinnerMock,
    }));

    const helpers = await import(`./shared.ts?t=${Date.now()}-${Math.random()}`);
    const context = await helpers.loadInventoryContext({
      additionalComponents: [302],
    });

    expect(ensureManifestMock).toHaveBeenCalledTimes(1);
    expect(getProfileMock).toHaveBeenCalledWith([200, 201, 205, 302]);
    expect(buildInventoryIndexMock).toHaveBeenCalledTimes(1);
    expect(context.characters).toHaveLength(1);
    expect(context.byCharacterId.get("hunter-id")?.characterId).toBe("hunter-id");
  });

  test("runCommandAction formats errors and exits with code 1", async () => {
    const origError = console.error;
    const origExit = process.exit;
    const errors: string[] = [];

    console.error = (...values: unknown[]) => {
      errors.push(values.map(String).join(" "));
    };
    (process as unknown as { exit: (code: number) => never }).exit = (code: number) => {
      throw new Error(`__exit_${code}__`);
    };

    try {
      const helpers = await import(`./shared.ts?t=${Date.now()}-${Math.random()}`);

      await expect(
        helpers.runCommandAction(async () => {
          throw new Error("boom");
        })()
      ).rejects.toThrow("__exit_1__");
    } finally {
      console.error = origError;
      (process as unknown as { exit: typeof process.exit }).exit = origExit;
    }

    expect(errors.some((line) => line.includes("boom"))).toBe(true);
  });
});
