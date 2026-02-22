import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { parseWishlist, loadWishlist, gradeItem } from "./wishlist.ts";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync, writeFileSync } from "fs";

// ---------------------------------------------------------------------------
// parseWishlist
// ---------------------------------------------------------------------------

describe("parseWishlist", () => {
  test("parses title", () => {
    const wl = parseWishlist("title:My Awesome Wishlist\n");
    expect(wl.title).toBe("My Awesome Wishlist");
  });

  test("defaults title when absent", () => {
    const wl = parseWishlist("//just a comment\n");
    expect(wl.title).toBe("Wishlist");
  });

  test("parses entry with perks and notes", () => {
    const line =
      "dimwishlist:item=1234567890&perks=111,222,333&notes:god roll pvp";
    const wl = parseWishlist(line);
    expect(wl.entries).toHaveLength(1);
    const entry = wl.entries[0]!;
    expect(entry.itemHash).toBe(1234567890);
    expect(entry.perkHashes).toEqual([111, 222, 333]);
    expect(entry.notes).toBe("god roll pvp");
  });

  test("parses entry without notes", () => {
    const line = "dimwishlist:item=9999&perks=100,200";
    const wl = parseWishlist(line);
    expect(wl.entries).toHaveLength(1);
    expect(wl.entries[0]!.notes).toBe("");
  });

  test("skips // comment lines", () => {
    const text = "// this is a comment\ndimwishlist:item=42&perks=1";
    const wl = parseWishlist(text);
    expect(wl.entries).toHaveLength(1);
    expect(wl.entries[0]!.itemHash).toBe(42);
  });

  test("skips malformed lines", () => {
    const text = "not_a_valid_line\ndimwishlist:item=42&perks=1";
    const wl = parseWishlist(text);
    expect(wl.entries).toHaveLength(1);
  });

  test("skips item=-1 (wildcard)", () => {
    const text = "dimwishlist:item=-1&perks=100";
    const wl = parseWishlist(text);
    expect(wl.entries).toHaveLength(0);
  });

  test("skips entry with no item param", () => {
    const text = "dimwishlist:perks=100";
    const wl = parseWishlist(text);
    expect(wl.entries).toHaveLength(0);
  });

  test("empty perks= → perkHashes: []", () => {
    const text = "dimwishlist:item=42&perks=";
    const wl = parseWishlist(text);
    expect(wl.entries).toHaveLength(1);
    expect(wl.entries[0]!.perkHashes).toEqual([]);
  });

  test("entry without perks param → perkHashes: []", () => {
    const text = "dimwishlist:item=42";
    const wl = parseWishlist(text);
    expect(wl.entries).toHaveLength(1);
    expect(wl.entries[0]!.perkHashes).toEqual([]);
  });

  test("multiple entries for same hash → both in byItemHash", () => {
    const text = [
      "dimwishlist:item=42&perks=100",
      "dimwishlist:item=42&perks=200",
    ].join("\n");
    const wl = parseWishlist(text);
    expect(wl.entries).toHaveLength(2);
    const bucket = wl.byItemHash.get(42);
    expect(bucket).toHaveLength(2);
    expect(bucket![0]!.perkHashes).toEqual([100]);
    expect(bucket![1]!.perkHashes).toEqual([200]);
  });

  test("multiple different hashes each in byItemHash", () => {
    const text = [
      "dimwishlist:item=10&perks=1",
      "dimwishlist:item=20&perks=2",
    ].join("\n");
    const wl = parseWishlist(text);
    expect(wl.byItemHash.get(10)).toHaveLength(1);
    expect(wl.byItemHash.get(20)).toHaveLength(1);
  });

  test("skips blank lines", () => {
    const text = "\n\ndimwishlist:item=99&perks=1\n\n";
    const wl = parseWishlist(text);
    expect(wl.entries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// loadWishlist — file path
// ---------------------------------------------------------------------------

describe("loadWishlist (file)", () => {
  let tmpFile: string;

  beforeAll(() => {
    tmpFile = join(tmpdir(), `wishlist-test-${Date.now()}.txt`);
    writeFileSync(
      tmpFile,
      "title:Test WL\ndimwishlist:item=777&perks=10,20&notes:nice"
    );
  });

  afterAll(() => {
    rmSync(tmpFile, { force: true });
  });

  test("loads and parses a file", async () => {
    const wl = await loadWishlist(tmpFile);
    expect(wl.title).toBe("Test WL");
    expect(wl.entries).toHaveLength(1);
    expect(wl.entries[0]!.itemHash).toBe(777);
    expect(wl.entries[0]!.perkHashes).toEqual([10, 20]);
    expect(wl.entries[0]!.notes).toBe("nice");
  });

  test("throws for missing file", async () => {
    await expect(loadWishlist("/tmp/nonexistent-wishlist-abc.txt")).rejects.toThrow(
      "not found"
    );
  });
});

// ---------------------------------------------------------------------------
// gradeItem
// ---------------------------------------------------------------------------

describe("gradeItem", () => {
  const wishlist = parseWishlist(
    [
      "dimwishlist:item=100&perks=1,2,3",
      "dimwishlist:item=200&perks=",
      "dimwishlist:item=300&perks=10,20",
    ].join("\n")
  );

  test("god — all perks of an entry match", () => {
    expect(gradeItem(100, [1, 2, 3, 4], wishlist)).toBe("god");
  });

  test("god — exact perk match", () => {
    expect(gradeItem(100, [1, 2, 3], wishlist)).toBe("god");
  });

  test("good — partial perk match", () => {
    expect(gradeItem(100, [1, 2], wishlist)).toBe("good");
  });

  test("good — single perk match", () => {
    expect(gradeItem(100, [1], wishlist)).toBe("good");
  });

  test("trash — entry exists but zero perks match", () => {
    expect(gradeItem(100, [99, 88], wishlist)).toBe("trash");
  });

  test("unknown — no wishlist entry for hash", () => {
    expect(gradeItem(999, [1, 2, 3], wishlist)).toBe("unknown");
  });

  test("god — empty perkHashes in entry means any roll is good", () => {
    expect(gradeItem(200, [99, 88], wishlist)).toBe("god");
  });

  test("god — empty perkHashes in entry, item.perks undefined", () => {
    expect(gradeItem(200, undefined, wishlist)).toBe("god");
  });

  test("trash — item.perks undefined, non-empty entry perks", () => {
    expect(gradeItem(100, undefined, wishlist)).toBe("trash");
  });

  test("trash — item.perks empty array, non-empty entry perks", () => {
    expect(gradeItem(100, [], wishlist)).toBe("trash");
  });

  test("good — one of multiple entries partially matches", () => {
    // item 300 has entry with perks [10, 20]
    expect(gradeItem(300, [10], wishlist)).toBe("good");
  });

  test("god — all perks of second entry match", () => {
    // item 300 has entry with perks [10, 20]
    expect(gradeItem(300, [10, 20], wishlist)).toBe("god");
  });
});
