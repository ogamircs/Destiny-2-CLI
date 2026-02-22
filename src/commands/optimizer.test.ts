import { afterEach, describe, expect, mock, test } from "bun:test";
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
      },
    },
  };
}

function makeIndex() {
  return {
    all: [
      {
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
        isEquipped: true,
        canEquip: true,
        location: "char-hunter",
        perks: [11, 22],
      },
    ],
    byInstanceId: new Map(),
    byHash: new Map(),
    byCharacter: new Map(),
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

describe("optimizer analyze", () => {
  afterEach(() => mock.restore());

  test("outputs JSON analysis and layers optional popularity source", async () => {
    const loadWishlistForAppraiseMock = mock(async () => ({
      wishlist: {
        title: "Wishlist",
        entries: [],
        byItemHash: new Map(),
      },
      sourceLabel: "voltron",
      usedCache: false,
      cacheUpdatedAt: null,
    }));
    const loadPopularitySourceMock = mock(async () => ({
      sourceLabel: "/tmp/popularity.json",
      scores: new Map([[1001, 0.8]]),
    }));
    const analyzeLoadoutMock = mock(() => ({
      character: {
        id: "char-hunter",
        classType: 1,
      },
      summary: {
        totalSlots: 1,
        improvedSlots: 1,
      },
      recommendations: [
        {
          slot: "Kinetic",
          currentItem: {
            hash: 1001,
            name: "Ace of Spades",
            power: 1810,
            location: "char-hunter",
          },
          suggestedItem: {
            hash: 1001,
            name: "Ace of Spades",
            power: 1810,
            location: "char-hunter",
          },
          score: 100,
          delta: 0,
          reasons: ["Wishlist grade: god", "Power 1810"],
        },
      ],
    }));

    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/roll-source.ts", () => ({
      loadWishlistForAppraise: loadWishlistForAppraiseMock,
    }));
    mock.module("../services/popularity.ts", () => ({
      loadPopularitySource: loadPopularitySourceMock,
    }));
    mock.module("../services/optimizer.ts", () => ({
      analyzeLoadout: analyzeLoadoutMock,
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerOptimizerCommand } = await import(
      `./optimizer.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerOptimizerCommand, [
      "optimizer",
      "analyze",
      "--character",
      "hunter",
      "--source",
      "voltron",
      "--with-popularity",
      "--popularity-source",
      "/tmp/popularity.json",
      "--json",
    ]);

    expect(result.exitCode).toBeNull();
    expect(loadWishlistForAppraiseMock).toHaveBeenCalledWith("voltron");
    expect(loadPopularitySourceMock).toHaveBeenCalledWith("/tmp/popularity.json");
    expect(analyzeLoadoutMock).toHaveBeenCalledTimes(1);

    const analysisPayload = JSON.parse(result.logs[0]!);
    expect(analysisPayload.character.id).toBe("char-hunter");
    expect(analysisPayload.summary.totalSlots).toBe(1);
    expect(analysisPayload.recommendations[0].slot).toBe("Kinetic");
  });

  test("unknown character exits with error", async () => {
    mock.module("../services/manifest-cache.ts", () => ({
      ensureManifest: mock(async () => {}),
    }));
    mock.module("../api/profile.ts", () => ({
      getProfile: mock(async () => makeProfile()),
    }));
    mock.module("../services/item-index.ts", () => ({
      buildInventoryIndex: mock(() => makeIndex()),
      getRequiredComponents: () => [200, 201, 205, 102, 300],
    }));
    mock.module("../services/roll-source.ts", () => ({
      loadWishlistForAppraise: mock(async () => ({
        wishlist: { title: "Wishlist", entries: [], byItemHash: new Map() },
        sourceLabel: "voltron",
        usedCache: false,
        cacheUpdatedAt: null,
      })),
    }));
    mock.module("../services/popularity.ts", () => ({
      loadPopularitySource: mock(async () => ({
        sourceLabel: "none",
        scores: new Map(),
      })),
    }));
    mock.module("../services/optimizer.ts", () => ({
      analyzeLoadout: mock(() => {
        throw new Error("not used");
      }),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerOptimizerCommand } = await import(
      `./optimizer.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerOptimizerCommand, [
      "optimizer",
      "analyze",
      "--character",
      "warlock",
      "--source",
      "voltron",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.errors.some((line) => line.includes("Character"))).toBe(true);
  });
});
