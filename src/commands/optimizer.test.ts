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

function makeCharacters() {
  return Object.values(makeProfile().characters.data);
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

function makeSharedContext() {
  const characters = makeCharacters();
  return {
    characters,
    byCharacterId: new Map(
      characters.map((character) => [character.characterId, character])
    ),
    index: makeIndex(),
  };
}

function defaultResolveCharacter(
  characters: ReturnType<typeof makeCharacters>,
  query: string
) {
  const lower = query.toLowerCase();
  const character = characters.find((candidate) => {
    if (candidate.classType === 0) return lower === "titan";
    if (candidate.classType === 1) return lower === "hunter";
    if (candidate.classType === 2) return lower === "warlock";
    return false;
  });

  if (!character) {
    throw new Error(
      `Character "${query}" not found. Available: ${characters
        .map((candidate) => {
          if (candidate.classType === 0) return "titan";
          if (candidate.classType === 1) return "hunter";
          if (candidate.classType === 2) return "warlock";
          return "unknown";
        })
        .join(", ")}`
    );
  }

  return character;
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

function mockSharedModule(options?: {
  loadInventoryContext?: () => Promise<ReturnType<typeof makeSharedContext>>;
  resolveCharacter?: (
    characters: ReturnType<typeof makeCharacters>,
    query: string
  ) => ReturnType<typeof makeCharacters>[number];
}) {
  const loadInventoryContextMock = mock(
    options?.loadInventoryContext ?? (async () => makeSharedContext())
  );
  const resolveCharacterMock = mock(
    options?.resolveCharacter ??
      ((characters: ReturnType<typeof makeCharacters>, query: string) =>
        defaultResolveCharacter(characters, query))
  );

  mock.module("./shared.ts", () => ({
    loadInventoryContext: loadInventoryContextMock,
    resolveCharacter: resolveCharacterMock,
    runCommandAction: wrapCommandAction,
  }));

  return {
    loadInventoryContextMock,
    resolveCharacterMock,
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

    const { loadInventoryContextMock } = mockSharedModule();
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
    expect(loadInventoryContextMock).toHaveBeenCalledTimes(1);
    expect(loadWishlistForAppraiseMock).toHaveBeenCalledWith("voltron");
    expect(loadPopularitySourceMock).toHaveBeenCalledWith("/tmp/popularity.json");
    expect(analyzeLoadoutMock).toHaveBeenCalledTimes(1);

    const analysisPayload = JSON.parse(result.logs[0]!);
    expect(analysisPayload.character.id).toBe("char-hunter");
    expect(analysisPayload.summary.totalSlots).toBe(1);
    expect(analysisPayload.recommendations[0].slot).toBe("Kinetic");
  });

  test("loads inventory context and wishlist concurrently", async () => {
    const started: string[] = [];
    let resolveInventory: ((value: ReturnType<typeof makeSharedContext>) => void) | null = null;
    let resolveWishlist: ((value: {
      wishlist: { title: string; entries: unknown[]; byItemHash: Map<unknown, unknown> };
      sourceLabel: string;
      usedCache: boolean;
      cacheUpdatedAt: null;
    }) => void) | null = null;

    const inventoryPromise = new Promise<ReturnType<typeof makeSharedContext>>((resolve) => {
      resolveInventory = resolve;
    });
    const wishlistPromise = new Promise<{
      wishlist: { title: string; entries: unknown[]; byItemHash: Map<unknown, unknown> };
      sourceLabel: string;
      usedCache: boolean;
      cacheUpdatedAt: null;
    }>((resolve) => {
      resolveWishlist = resolve;
    });

    mockSharedModule({
      loadInventoryContext: async () => {
        started.push("inventory");
        return inventoryPromise;
      },
    });
    mock.module("../services/roll-source.ts", () => ({
      loadWishlistForAppraise: mock(async () => {
        started.push("wishlist");
        return wishlistPromise;
      }),
    }));
    mock.module("../services/popularity.ts", () => ({
      loadPopularitySource: mock(async () => ({
        sourceLabel: "none",
        scores: new Map(),
      })),
    }));
    mock.module("../services/optimizer.ts", () => ({
      analyzeLoadout: mock(() => ({
        character: { id: "char-hunter", classType: 1 },
        summary: { totalSlots: 0, improvedSlots: 0 },
        recommendations: [],
      })),
    }));
    mock.module("../ui/spinner.ts", () => ({
      withSpinner: mock(async (_: string, fn: () => Promise<unknown>) => fn()),
    }));

    const { registerOptimizerCommand } = await import(
      `./optimizer.ts?t=${Date.now()}-${Math.random()}`
    );

    const runPromise = runCommand(registerOptimizerCommand, [
      "optimizer",
      "analyze",
      "--character",
      "hunter",
      "--source",
      "voltron",
      "--json",
    ]);

    await Promise.resolve();
    expect(started).toEqual(["inventory", "wishlist"]);

    resolveInventory?.(makeSharedContext());
    resolveWishlist?.({
      wishlist: { title: "Wishlist", entries: [], byItemHash: new Map() },
      sourceLabel: "voltron",
      usedCache: false,
      cacheUpdatedAt: null,
    });

    const result = await runPromise;
    expect(result.exitCode).toBeNull();
  });

  test("unknown character exits with error", async () => {
    mockSharedModule({
      resolveCharacter: () => {
        throw new Error('Character "warlock" not found. Available: hunter');
      },
    });
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
