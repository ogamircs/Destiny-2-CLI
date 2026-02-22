import { afterEach, describe, expect, mock, test } from "bun:test";
import { Command } from "commander";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync, writeFileSync } from "fs";

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
        // swallow test harness errors
      }
    }
  } finally {
    console.log = origLog;
    console.error = origError;
    (process as unknown as { exit: typeof process.exit }).exit = origExit;
  }

  return { logs, errors, exitCode };
}

describe("rolls appraise command", () => {
  afterEach(() => mock.restore());

  test("unknown character exits with error", async () => {
    const gradeItemMock = mock(() => "unknown");

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      searchPerks: mock(() => []),
      findWeaponsByPerkGroups: mock(() => []),
      lookupItem: mock(() => null),
      lookupPerk: mock(() => ({ hash: 1, name: "Perk", description: "" })),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/roll-source.ts", () => ({
      setRollSourceAndRefresh: mock(async () => {
        throw new Error("not used");
      }),
      refreshRollSourceWithFallback: mock(async () => {
        throw new Error("not used");
      }),
      loadWishlistForAppraise: mock(async () => ({
        wishlist: {
          title: "Test WL",
          entries: [],
          byItemHash: new Map(),
        },
        sourceLabel: "/tmp/wishlist.txt",
        usedCache: false,
        cacheUpdatedAt: null,
      })),
    }));
    mock.module("../services/local-db.ts", () => ({
      getRollSource: mock(() => null),
    }));
    mock.module("../services/wishlist.ts", () => ({
      gradeItem: gradeItemMock,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
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
    const loadWishlistForAppraiseMock = mock(async (_source?: string) => ({
      wishlist: {
        title: "Test Wishlist",
        entries: [{ itemHash: 1001, perkHashes: [11], notes: "keep for pvp" }],
        byItemHash: new Map([
          [1001, [{ itemHash: 1001, perkHashes: [11], notes: "keep for pvp" }]],
        ]),
      },
      sourceLabel: "/tmp/wishlist.txt",
      usedCache: false,
      cacheUpdatedAt: null,
    }));

    const gradeItemMock = mock((hash: number) => {
      if (hash === 1001) return "god";
      if (hash === 1002) return "trash";
      return "unknown";
    });

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      searchPerks: mock(() => []),
      findWeaponsByPerkGroups: mock(() => []),
      lookupItem: mock(() => null),
      lookupPerk: (perkHash: number) => ({
        hash: perkHash,
        name: perkHash === 11 ? "Outlaw" : perkHash === 22 ? "Kill Clip" : "Unknown Perk",
        description: "",
      }),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/roll-source.ts", () => ({
      setRollSourceAndRefresh: mock(async () => {
        throw new Error("not used");
      }),
      refreshRollSourceWithFallback: mock(async () => {
        throw new Error("not used");
      }),
      loadWishlistForAppraise: loadWishlistForAppraiseMock,
    }));
    mock.module("../services/local-db.ts", () => ({
      getRollSource: mock(() => null),
    }));
    mock.module("../services/wishlist.ts", () => ({
      gradeItem: gradeItemMock,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
      "appraise",
      "--source",
      "/tmp/wishlist.txt",
      "--json",
    ]);

    expect(loadWishlistForAppraiseMock).toHaveBeenCalledWith("/tmp/wishlist.txt");
    expect(gradeItemMock).toHaveBeenCalledTimes(2); // only weapons

    expect(result.logs).toHaveLength(1);
    const output = JSON.parse(result.logs[0]!);
    expect(output).toHaveLength(2);
    expect(output[0]).toMatchObject({
      name: "Ace of Spades",
      grade: "god",
    });
    expect(output[0].matchedPerks).toContain("Outlaw");
    expect(output[0].notes).toContain("keep for pvp");
    expect(result.exitCode).toBeNull();
  });

  test("layers popularity score when requested while keeping deterministic grade ordering", async () => {
    const loadWishlistForAppraiseMock = mock(async (_source?: string) => ({
      wishlist: {
        title: "Test Wishlist",
        entries: [{ itemHash: 1001, perkHashes: [11], notes: "keep for pvp" }],
        byItemHash: new Map([
          [1001, [{ itemHash: 1001, perkHashes: [11], notes: "keep for pvp" }]],
        ]),
      },
      sourceLabel: "/tmp/wishlist.txt",
      usedCache: false,
      cacheUpdatedAt: null,
    }));

    const gradeItemMock = mock((hash: number) => {
      if (hash === 1001) return "god";
      if (hash === 1002) return "good";
      return "unknown";
    });

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      searchPerks: mock(() => []),
      findWeaponsByPerkGroups: mock(() => []),
      lookupItem: mock(() => null),
      lookupPerk: (perkHash: number) => ({
        hash: perkHash,
        name: perkHash === 11 ? "Outlaw" : perkHash === 22 ? "Kill Clip" : "Unknown Perk",
        description: "",
      }),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/roll-source.ts", () => ({
      setRollSourceAndRefresh: mock(async () => {
        throw new Error("not used");
      }),
      refreshRollSourceWithFallback: mock(async () => {
        throw new Error("not used");
      }),
      loadWishlistForAppraise: loadWishlistForAppraiseMock,
    }));
    mock.module("../services/local-db.ts", () => ({
      getRollSource: mock(() => null),
    }));
    mock.module("../services/wishlist.ts", () => ({
      gradeItem: gradeItemMock,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const popularityFile = join(
      tmpdir(),
      `rolls-popularity-${Date.now()}-${Math.random()}.json`
    );
    writeFileSync(
      popularityFile,
      JSON.stringify({
        1001: 0.4,
        1002: 0.95,
      })
    );

    try {
      const { registerRollsCommand } = await import(
        `./rolls.ts?t=${Date.now()}-${Math.random()}`
      );

      const result = await runCommand(registerRollsCommand, [
        "rolls",
        "appraise",
        "--source",
        "/tmp/wishlist.txt",
        "--with-popularity",
        "--popularity-source",
        popularityFile,
        "--json",
      ]);

      expect(loadWishlistForAppraiseMock).toHaveBeenCalledWith("/tmp/wishlist.txt");
      expect(result.exitCode).toBeNull();
      expect(result.logs).toHaveLength(1);

      const output = JSON.parse(result.logs[0]!);
      expect(output).toHaveLength(2);
      expect(output[0].grade).toBe("god");
      expect(output[0].popularityScore).toBe(0.4);
      expect(output[0].score).toBeGreaterThan(0);
      expect(output[1].grade).toBe("good");
      expect(output[1].popularityScore).toBe(0.95);
    } finally {
      rmSync(popularityFile, { force: true });
    }
  });
});

describe("rolls find", () => {
  afterEach(() => mock.restore());

  test("resolves requested perks and prints matching weapons as JSON", async () => {
    const ensureManifestMock = mock(async () => {});
    const searchPerksMock = mock((query: string) => {
      if (query === "outlaw") {
        return [{ hash: 9001, name: "Outlaw", description: "" }];
      }
      if (query === "rampage") {
        return [{ hash: 9002, name: "Rampage", description: "" }];
      }
      return [];
    });
    const findWeaponsByPerkGroupsMock = mock(() => [
      {
        hash: 100,
        name: "Palindrome",
        archetype: "Hand Cannon",
        tierTypeName: "Legendary",
        perkHashes: [9001, 9002],
      },
    ]);

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: ensureManifestMock,
      searchPerks: searchPerksMock,
      findWeaponsByPerkGroups: findWeaponsByPerkGroupsMock,
      lookupItem: mock(() => null),
      lookupPerk: (hash: number) => {
        if (hash === 9001) {
          return { hash, name: "Outlaw", description: "" };
        }
        if (hash === 9002) {
          return { hash, name: "Rampage", description: "" };
        }
        return null;
      },
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
      "find",
      "--perk",
      "outlaw",
      "--perk",
      "rampage",
      "--archetype",
      "hand",
      "--json",
    ]);

    expect(result.exitCode).toBeNull();
    expect(ensureManifestMock).toHaveBeenCalledTimes(1);
    expect(searchPerksMock).toHaveBeenCalledTimes(2);
    expect(findWeaponsByPerkGroupsMock).toHaveBeenCalledWith(
      [[9001], [9002]],
      "hand"
    );

    expect(result.logs).toHaveLength(1);
    const payload = JSON.parse(result.logs[0]!);
    expect(payload).toEqual([
      {
        hash: 100,
        name: "Palindrome",
        archetype: "Hand Cannon",
        tier: "Legendary",
        matchedPerks: ["Outlaw", "Rampage"],
      },
    ]);
  });

  test("exits with error when a requested perk is not found", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      searchPerks: mock(() => []),
      findWeaponsByPerkGroups: mock(() => []),
      lookupItem: mock(() => null),
      lookupPerk: mock(() => null),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
      "find",
      "--perk",
      "does-not-exist",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((line) => line.includes("not found"))).toBe(true);
  });

  test("prefers exact perk matches while keeping partial matches as perk alternatives", async () => {
    const ensureManifestMock = mock(async () => {});
    const searchPerksMock = mock((query: string) => {
      if (query === "outlaw") {
        return [
          { hash: 9001, name: "Outlaw", description: "" },
          { hash: 9003, name: "Outlaw's Tempo", description: "" },
        ];
      }
      if (query === "payload") {
        return [
          { hash: 9101, name: "Explosive Payload", description: "" },
          { hash: 9102, name: "Timed Payload", description: "" },
        ];
      }
      return [];
    });
    const findWeaponsByPerkGroupsMock = mock(() => [
      {
        hash: 200,
        name: "Fatebringer",
        archetype: "Hand Cannon",
        tierTypeName: "Legendary",
        perkHashes: [9001, 9102],
      },
    ]);

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: ensureManifestMock,
      searchPerks: searchPerksMock,
      findWeaponsByPerkGroups: findWeaponsByPerkGroupsMock,
      lookupItem: mock(() => null),
      lookupPerk: (hash: number) => {
        if (hash === 9001) {
          return { hash, name: "Outlaw", description: "" };
        }
        if (hash === 9102) {
          return { hash, name: "Timed Payload", description: "" };
        }
        return null;
      },
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
      "find",
      "--perk",
      "outlaw",
      "--perk",
      "payload",
      "--json",
    ]);

    expect(result.exitCode).toBeNull();
    expect(ensureManifestMock).toHaveBeenCalledTimes(1);
    expect(searchPerksMock).toHaveBeenNthCalledWith(1, "outlaw");
    expect(searchPerksMock).toHaveBeenNthCalledWith(2, "payload");
    expect(findWeaponsByPerkGroupsMock).toHaveBeenCalledWith(
      [[9001], [9101, 9102]],
      undefined
    );

    expect(result.logs).toHaveLength(1);
    const payload = JSON.parse(result.logs[0]!);
    expect(payload).toEqual([
      {
        hash: 200,
        name: "Fatebringer",
        archetype: "Hand Cannon",
        tier: "Legendary",
        matchedPerks: ["Outlaw", "Timed Payload"],
      },
    ]);
  });

  test("prints the empty-state message when no weapons match", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      searchPerks: mock(() => [{ hash: 9001, name: "Outlaw", description: "" }]),
      findWeaponsByPerkGroups: mock(() => []),
      lookupItem: mock(() => null),
      lookupPerk: mock(() => null),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
      "find",
      "--perk",
      "outlaw",
    ]);

    expect(result.exitCode).toBeNull();
    expect(
      result.logs.some((line) =>
        line.includes("No weapons found for this perk combination.")
      )
    ).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("supports --query groups with perk alternatives and optional popularity overlay", async () => {
    const ensureManifestMock = mock(async () => {});
    const searchPerksMock = mock((query: string) => {
      if (query === "outlaw") {
        return [{ hash: 9001, name: "Outlaw", description: "" }];
      }
      if (query === "rapid hit") {
        return [{ hash: 9003, name: "Rapid Hit", description: "" }];
      }
      if (query === "payload") {
        return [
          { hash: 9101, name: "Explosive Payload", description: "" },
          { hash: 9102, name: "Timed Payload", description: "" },
        ];
      }
      return [];
    });
    const findWeaponsByPerkGroupsMock = mock(() => [
      {
        hash: 200,
        name: "Fatebringer",
        archetype: "Hand Cannon",
        tierTypeName: "Legendary",
        perkHashes: [9003, 9102],
      },
    ]);

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: ensureManifestMock,
      searchPerks: searchPerksMock,
      findWeaponsByPerkGroups: findWeaponsByPerkGroupsMock,
      lookupItem: mock(() => null),
      lookupPerk: (hash: number) => {
        if (hash === 9001) {
          return { hash, name: "Outlaw", description: "" };
        }
        if (hash === 9003) {
          return { hash, name: "Rapid Hit", description: "" };
        }
        if (hash === 9102) {
          return { hash, name: "Timed Payload", description: "" };
        }
        return null;
      },
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const popularityFile = join(
      tmpdir(),
      `rolls-find-popularity-${Date.now()}-${Math.random()}.json`
    );
    writeFileSync(
      popularityFile,
      JSON.stringify({
        200: 0.88,
      })
    );

    try {
      const { registerRollsCommand } = await import(
        `./rolls.ts?t=${Date.now()}-${Math.random()}`
      );

      const result = await runCommand(registerRollsCommand, [
        "rolls",
        "find",
        "--query",
        "outlaw|rapid hit + payload",
        "--with-popularity",
        "--popularity-source",
        popularityFile,
        "--json",
      ]);

      expect(result.exitCode).toBeNull();
      expect(ensureManifestMock).toHaveBeenCalledTimes(1);
      expect(searchPerksMock).toHaveBeenNthCalledWith(1, "outlaw");
      expect(searchPerksMock).toHaveBeenNthCalledWith(2, "rapid hit");
      expect(searchPerksMock).toHaveBeenNthCalledWith(3, "payload");
      expect(findWeaponsByPerkGroupsMock).toHaveBeenCalledWith(
        [[9001, 9003], [9101, 9102]],
        undefined
      );

      expect(result.logs).toHaveLength(1);
      const payload = JSON.parse(result.logs[0]!);
      expect(payload).toEqual([
        {
          hash: 200,
          name: "Fatebringer",
          archetype: "Hand Cannon",
          tier: "Legendary",
          matchedPerks: ["Rapid Hit", "Timed Payload"],
          popularityScore: 0.88,
          score: expect.any(Number),
        },
      ]);
    } finally {
      rmSync(popularityFile, { force: true });
    }
  });
});

describe("rolls source", () => {
  afterEach(() => mock.restore());

  test("set stores source and reports cached entry count", async () => {
    const setRollSourceAndRefreshMock = mock(async () => ({
      state: {
        sourceInput: "voltron",
        sourceResolved:
          "https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/voltron.txt",
        sourceKind: "url" as const,
        sourceUpdatedAt: 1700000000,
        cacheText: "title:Wishlist",
        cacheUpdatedAt: 1700000100,
      },
      wishlist: {
        title: "Wishlist",
        entries: [{ itemHash: 1, perkHashes: [2], notes: "" }],
        byItemHash: new Map([[1, [{ itemHash: 1, perkHashes: [2], notes: "" }]]]),
      },
    }));

    mock.module("../services/roll-source.ts", () => ({
      setRollSourceAndRefresh: setRollSourceAndRefreshMock,
      refreshRollSourceWithFallback: mock(async () => {
        throw new Error("not used");
      }),
      loadWishlistForAppraise: mock(async () => {
        throw new Error("not used");
      }),
    }));
    mock.module("../services/local-db.ts", () => ({
      getRollSource: mock(() => null),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
      "source",
      "set",
      "voltron",
    ]);

    expect(result.exitCode).toBeNull();
    expect(setRollSourceAndRefreshMock).toHaveBeenCalledWith("voltron");
    expect(result.logs.some((line) => line.includes("Roll source set to"))).toBe(
      true
    );
    expect(result.logs.some((line) => line.includes("Cached 1 entries"))).toBe(
      true
    );
  });

  test("show prints configured source state", async () => {
    mock.module("../services/roll-source.ts", () => ({
      setRollSourceAndRefresh: mock(async () => {
        throw new Error("not used");
      }),
      refreshRollSourceWithFallback: mock(async () => {
        throw new Error("not used");
      }),
      loadWishlistForAppraise: mock(async () => {
        throw new Error("not used");
      }),
    }));
    mock.module("../services/local-db.ts", () => ({
      getRollSource: mock(() => ({
        sourceInput: "voltron",
        sourceResolved:
          "https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/voltron.txt",
        sourceKind: "url" as const,
        sourceUpdatedAt: 1700000000,
        cacheText: "title:Wishlist",
        cacheUpdatedAt: 1700000100,
      })),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
      "source",
      "show",
    ]);

    expect(result.exitCode).toBeNull();
    expect(result.logs.some((line) => line.includes("Source: voltron"))).toBe(
      true
    );
    expect(result.logs.some((line) => line.includes("Cache:"))).toBe(true);
  });

  test("refresh falls back to cached wishlist when refresh fails", async () => {
    mock.module("../services/roll-source.ts", () => ({
      setRollSourceAndRefresh: mock(async () => {
        throw new Error("not used");
      }),
      refreshRollSourceWithFallback: mock(async () => ({
        state: {
          sourceInput: "voltron",
          sourceResolved:
            "https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/voltron.txt",
          sourceKind: "url" as const,
          sourceUpdatedAt: 1700000000,
          cacheText: "title:Wishlist",
          cacheUpdatedAt: 1700000100,
        },
        wishlist: {
          title: "Wishlist",
          entries: [{ itemHash: 1, perkHashes: [2], notes: "" }],
          byItemHash: new Map([
            [1, [{ itemHash: 1, perkHashes: [2], notes: "" }]],
          ]),
        },
        usedCache: true,
        refreshError: "network down",
      })),
      loadWishlistForAppraise: mock(async () => {
        throw new Error("not used");
      }),
    }));
    mock.module("../services/local-db.ts", () => ({
      getRollSource: mock(() => null),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
      "source",
      "refresh",
    ]);

    expect(result.exitCode).toBeNull();
    expect(
      result.logs.some((line) => line.includes("Using cached wishlist"))
    ).toBe(true);
  });

  test("show prints setup hint when no source is configured", async () => {
    mock.module("../services/roll-source.ts", () => ({
      setRollSourceAndRefresh: mock(async () => {
        throw new Error("not used");
      }),
      refreshRollSourceWithFallback: mock(async () => {
        throw new Error("not used");
      }),
      loadWishlistForAppraise: mock(async () => {
        throw new Error("not used");
      }),
    }));
    mock.module("../services/local-db.ts", () => ({
      getRollSource: mock(() => null),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
      "source",
      "show",
    ]);

    expect(result.exitCode).toBeNull();
    expect(
      result.logs.some((line) => line.includes("No roll source configured"))
    ).toBe(true);
  });
});

describe("rolls appraise source resolution", () => {
  afterEach(() => mock.restore());

  test("uses configured source when --source is omitted and warns on cache fallback", async () => {
    const loadWishlistForAppraiseMock = mock(async () => ({
      wishlist: {
        title: "Cached Wishlist",
        entries: [{ itemHash: 1, perkHashes: [2], notes: "" }],
        byItemHash: new Map([[1, [{ itemHash: 1, perkHashes: [2], notes: "" }]]]),
      },
      sourceLabel: "voltron",
      usedCache: true,
      cacheUpdatedAt: 1700000100,
      refreshError: "offline",
    }));

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
      searchPerks: mock(() => []),
      findWeaponsByPerkGroups: mock(() => []),
      lookupItem: mock(() => null),
      lookupPerk: mock(() => null),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => ({
        all: [],
        byCharacter: new Map(),
      })),
      getRequiredComponents: mock(() => [200, 201, 205, 102, 300]),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => ({
        characters: { data: {} },
      })),
    }));
    mock.module("../services/roll-source.ts", () => ({
      setRollSourceAndRefresh: mock(async () => {
        throw new Error("not used");
      }),
      refreshRollSourceWithFallback: mock(async () => {
        throw new Error("not used");
      }),
      loadWishlistForAppraise: loadWishlistForAppraiseMock,
    }));
    mock.module("../services/local-db.ts", () => ({
      getRollSource: mock(() => null),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerRollsCommand } = await import(
      `./rolls.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerRollsCommand, [
      "rolls",
      "appraise",
      "--json",
    ]);

    expect(result.exitCode).toBeNull();
    expect(loadWishlistForAppraiseMock).toHaveBeenCalledWith(undefined);
    expect(result.logs).toHaveLength(1);
    expect(JSON.parse(result.logs[0]!)).toEqual([]);
    expect(
      result.errors.some((line) => line.includes("Using cached source"))
    ).toBe(true);
  });
});
