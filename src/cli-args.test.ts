import { describe, expect, test } from "bun:test";
import { parseGame, parsePlatform } from "./games/context.ts";
import { hoistGlobalArgs } from "./cli-args.ts";
import { readManifestItem } from "./services/manifest-cache.ts";

describe("global CLI arguments", () => {
  test("hoists game, platform, and verbose in front of the subcommand", () => {
    expect(
      hoistGlobalArgs(["bun", "destiny", "inventory", "--game", "d1", "--platform=psn", "--verbose"])
    ).toEqual(["bun", "destiny", "--game", "d1", "--platform=psn", "--verbose", "inventory"]);
  });

  test("parses game and platform names", () => {
    expect(parseGame("Destiny1")).toBe("d1");
    expect(parseGame("2")).toBe("d2");
    expect(parsePlatform("playstation")).toBe(2);
    expect(() => parseGame("halo")).toThrow(/d1 or d2/);
  });
});

describe("readManifestItem", () => {
  test("reads Destiny 1 definition fields and treats class 3 as unrestricted", () => {
    const item = readManifestItem(
      {
        itemHash: 77,
        itemName: "Fatebringer",
        icon: "/fate.png",
        tierTypeName: "Legendary",
        bucketTypeHash: 1498876634,
        itemType: 3,
        classType: 3,
        equippable: true,
        maxStackSize: 1,
      },
      "d1"
    );

    expect(item).toMatchObject({
      hash: 77,
      name: "Fatebringer",
      tierTypeName: "Legendary",
      bucketHash: 1498876634,
      classType: -1,
      icon: "/fate.png",
      equippable: true,
    });
  });
});
