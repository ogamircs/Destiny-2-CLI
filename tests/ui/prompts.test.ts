import { afterAll, afterEach, beforeEach, describe, expect, test, mock } from "bun:test";
import type { CharacterData } from "../../src/api/profile.ts";
import type { DisplayItem } from "../../src/ui/tables.ts";

let nextSelect: unknown;
let nextConfirm: unknown;

mock.module("@clack/prompts", () => ({
  select: async () => nextSelect,
  confirm: async () => nextConfirm,
  isCancel: (value: unknown) => value === "__cancel__",
}));

const { confirm, pickCharacter, pickDestination, pickItem } = await import(
  "../../src/ui/prompts.ts"
);

const originalExit = process.exit;

beforeEach(() => {
  nextSelect = undefined;
  nextConfirm = undefined;
  process.exit = (() => {
    throw new Error("process.exit called");
  }) as never;
});

afterEach(() => {
  process.exit = originalExit;
});

afterAll(() => {
  mock.restore();
});

describe("ui/prompts", () => {
  const chars: CharacterData[] = [
    {
      characterId: "char-h",
      membershipId: "m",
      membershipType: 3,
      dateLastPlayed: new Date().toISOString(),
      minutesPlayedTotal: "100",
      light: 2000,
      classType: 1,
      raceType: 1,
      genderType: 1,
      stats: {},
      emblemPath: "",
      emblemBackgroundPath: "",
    },
    {
      characterId: "char-t",
      membershipId: "m",
      membershipType: 3,
      dateLastPlayed: new Date().toISOString(),
      minutesPlayedTotal: "100",
      light: 2000,
      classType: 0,
      raceType: 0,
      genderType: 0,
      stats: {},
      emblemPath: "",
      emblemBackgroundPath: "",
    },
  ];

  const items: DisplayItem[] = [
    {
      name: "Ace",
      tier: "Exotic",
      slot: "Kinetic",
      instanceId: "i1",
      hash: 1,
      quantity: 1,
      isEquipped: false,
      location: "Hunter",
    },
  ];

  test("pickCharacter returns selected character", async () => {
    nextSelect = "char-t";
    const selected = await pickCharacter(chars);
    expect(selected.characterId).toBe("char-t");
  });

  test("pickItem returns selected item", async () => {
    nextSelect = "i1";
    const selected = await pickItem(items);
    expect(selected.name).toBe("Ace");
  });

  test("pickDestination returns vault target", async () => {
    nextSelect = "vault";
    const dest = await pickDestination(chars);
    expect(dest).toEqual({ type: "vault" });
  });

  test("pickDestination returns character target", async () => {
    nextSelect = "char-h";
    const dest = await pickDestination(chars);
    expect(dest).toEqual({ type: "character", characterId: "char-h" });
  });

  test("confirm returns boolean", async () => {
    nextConfirm = true;
    expect(await confirm("Proceed?")).toBe(true);
    nextConfirm = false;
    expect(await confirm("Proceed?")).toBe(false);
  });

  test("cancel selection exits process", async () => {
    nextSelect = "__cancel__";
    await expect(pickCharacter(chars)).rejects.toThrow("process.exit called");
  });

  test("cancel confirmation exits process", async () => {
    nextConfirm = "__cancel__";
    await expect(confirm("Proceed?")).rejects.toThrow("process.exit called");
  });
});
