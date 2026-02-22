import {
  describe,
  expect,
  test,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync } from "fs";

// ---------------------------------------------------------------------------
// Create a unique temp dir per test run so tests are fully isolated
// ---------------------------------------------------------------------------
const TEST_DIR = join(tmpdir(), `destiny-cli-test-${Date.now()}`);
mkdirSync(TEST_DIR, { recursive: true });

// Mock config so local-db.ts writes to our temp dir
mock.module("./config.ts", () => ({
  getLocalPaths: () => ({
    configDir: TEST_DIR,
    cacheDir: TEST_DIR,
    tokenPath: join(TEST_DIR, "tokens.json"),
    manifestDir: TEST_DIR,
  }),
  getConfig: () => {
    throw new Error("getConfig should not be called from local-db");
  },
}));

// Import after mock is set up
const {
  itemKey,
  openLocalDb,
  closeLocalDb,
  addTag,
  removeTag,
  getTags,
  setNote,
  clearNote,
  getNote,
  saveLoadout,
  getLoadout,
  listLoadouts,
  deleteLoadout,
  saveSearch,
  listSearches,
  deleteSearch,
} = await import(`./local-db.ts?test=${Date.now()}`);

// ---------------------------------------------------------------------------
// Reset singleton between tests
// ---------------------------------------------------------------------------
afterEach(() => {
  closeLocalDb();
});

// ---------------------------------------------------------------------------
// itemKey
// ---------------------------------------------------------------------------
describe("itemKey", () => {
  test("returns instanceId when present", () => {
    expect(itemKey({ instanceId: "abc-123", hash: 999 })).toBe("abc-123");
  });

  test("returns hash:<hash> when instanceId is absent", () => {
    expect(itemKey({ instanceId: undefined, hash: 42 })).toBe("hash:42");
  });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
describe("tags", () => {
  const ITEM = { instanceId: "inst-1", hash: 100 };

  beforeEach(() => {
    const db = openLocalDb();
    db.query("DELETE FROM item_tags").run();
  });

  test("addTag is idempotent (INSERT OR IGNORE)", () => {
    addTag(ITEM, "junk");
    addTag(ITEM, "junk"); // second call should not throw
    expect(getTags(ITEM)).toEqual(["junk"]);
  });

  test("multiple distinct tags accumulate", () => {
    addTag(ITEM, "keep");
    addTag(ITEM, "infuse");
    const tags = getTags(ITEM);
    expect(tags).toContain("keep");
    expect(tags).toContain("infuse");
  });

  test("removeTag removes only that tag", () => {
    addTag(ITEM, "a");
    addTag(ITEM, "b");
    removeTag(ITEM, "a");
    expect(getTags(ITEM)).toEqual(["b"]);
  });

  test("getTags returns [] for unknown item", () => {
    expect(getTags({ instanceId: "never-added", hash: 0 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
describe("notes", () => {
  const ITEM = { instanceId: "inst-notes", hash: 200 };

  beforeEach(() => {
    const db = openLocalDb();
    db.query("DELETE FROM item_notes").run();
  });

  test("setNote stores a note", () => {
    setNote(ITEM, "save for raid");
    expect(getNote(ITEM)).toBe("save for raid");
  });

  test("setNote overwrites existing note", () => {
    setNote(ITEM, "first note");
    setNote(ITEM, "second note");
    expect(getNote(ITEM)).toBe("second note");
  });

  test("clearNote removes the note", () => {
    setNote(ITEM, "temporary");
    clearNote(ITEM);
    expect(getNote(ITEM)).toBeNull();
  });

  test("getNote returns null for unknown item", () => {
    expect(getNote({ instanceId: "no-note-item", hash: 0 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Loadouts
// ---------------------------------------------------------------------------
describe("loadouts", () => {
  beforeEach(() => {
    const db = openLocalDb();
    db.query("DELETE FROM loadouts").run();
  });

  const SAMPLE_LOADOUT = {
    name: "Raid Build",
    classType: 0,
    items: [
      { hash: 111, instanceId: "i1", bucketHash: 1498876634, isEquipped: true },
      { hash: 222, instanceId: undefined, bucketHash: 2465295065, isEquipped: false },
    ],
    createdAt: 1700000000,
    updatedAt: 1700000000,
  };

  test("saveLoadout / getLoadout round-trip", () => {
    saveLoadout(SAMPLE_LOADOUT);
    const loaded = getLoadout("Raid Build");
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Raid Build");
    expect(loaded!.classType).toBe(0);
    expect(loaded!.items).toHaveLength(2);
    expect(loaded!.items[0]).toEqual(SAMPLE_LOADOUT.items[0]);
    expect(loaded!.items[1]).toEqual(SAMPLE_LOADOUT.items[1]);
  });

  test("getLoadout returns null for unknown name", () => {
    expect(getLoadout("NonExistent")).toBeNull();
  });

  test("listLoadouts returns all saved loadouts", () => {
    saveLoadout(SAMPLE_LOADOUT);
    saveLoadout({ ...SAMPLE_LOADOUT, name: "PvP Build", classType: 1, items: [] });
    const all = listLoadouts();
    const names = all.map((l) => l.name);
    expect(names).toContain("Raid Build");
    expect(names).toContain("PvP Build");
  });

  test("deleteLoadout removes it", () => {
    saveLoadout(SAMPLE_LOADOUT);
    deleteLoadout("Raid Build");
    expect(getLoadout("Raid Build")).toBeNull();
  });

  test("saveLoadout preserves created_at on update", () => {
    saveLoadout(SAMPLE_LOADOUT);
    const firstLoad = getLoadout("Raid Build")!;
    const firstCreatedAt = firstLoad.createdAt;

    // Update by saving again with different items
    saveLoadout({ ...SAMPLE_LOADOUT, items: [], updatedAt: 1800000000 });
    const secondLoad = getLoadout("Raid Build")!;

    expect(secondLoad.createdAt).toBe(firstCreatedAt);
    expect(secondLoad.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Saved searches
// ---------------------------------------------------------------------------
describe("saved searches", () => {
  beforeEach(() => {
    const db = openLocalDb();
    db.query("DELETE FROM saved_searches").run();
  });

  test("saveSearch / listSearches / deleteSearch round-trip", () => {
    saveSearch("nightfall", "is:weapon perk:vorpal");
    saveSearch("armor-grind", "type:armor tier:legendary");

    const searches = listSearches();
    const names = searches.map((s) => s.name);
    expect(names).toContain("nightfall");
    expect(names).toContain("armor-grind");

    const nightfall = searches.find((s) => s.name === "nightfall")!;
    expect(nightfall.query).toBe("is:weapon perk:vorpal");
    expect(typeof nightfall.createdAt).toBe("number");

    deleteSearch("nightfall");
    const after = listSearches();
    expect(after.map((s) => s.name)).not.toContain("nightfall");
    expect(after.map((s) => s.name)).toContain("armor-grind");
  });
});

// ---------------------------------------------------------------------------
// Migrations idempotent
// ---------------------------------------------------------------------------
describe("migrations", () => {
  test("opening the same DB twice does not error", () => {
    // First open happens in afterEach-reset cycle; open it again
    const db1 = openLocalDb();
    closeLocalDb();
    // Second open should re-run migration check without throwing
    expect(() => openLocalDb()).not.toThrow();
  });
});
