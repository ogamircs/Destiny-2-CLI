import { describe, expect, test } from "bun:test";
import { assertD1Mode, d1ModeResultKey, normalizeD1Stats } from "./stats.ts";

describe("Destiny 1 stats", () => {
  test("maps mode names onto the historical stat keys", () => {
    expect(d1ModeResultKey("strikes")).toBe("allStrikes");
    expect(d1ModeResultKey("trials")).toBe("trialsOfOsiris");
    expect(assertD1Mode("pvp")).toBe("pvp");
    expect(() => assertD1Mode("gambit")).toThrow(/does not exist in Destiny 1/);
  });

  test("promotes merged all-time stats into the allTime result key", () => {
    const stats = normalizeD1Stats(
      {
        mergedAllCharacters: {
          results: { allPvP: { allTime: { kills: { statId: "kills", basic: { value: 3, displayValue: "3" } } } } },
          merged: { allTime: { kills: { statId: "kills", basic: { value: 9, displayValue: "9" } } } },
        },
        characters: [],
      },
      null
    );

    expect(stats.mergedAllCharacters.results.allTime?.allTime?.kills?.basic.value).toBe(9);
  });

  test("wraps a single mode block", () => {
    const stats = normalizeD1Stats(
      { raid: { allTime: { kills: { statId: "kills", basic: { value: 4, displayValue: "4" } } } } },
      "raid"
    );
    expect(stats.mergedAllCharacters.results.raid?.allTime?.kills?.basic.value).toBe(4);
  });
});
