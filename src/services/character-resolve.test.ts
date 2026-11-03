import { describe, expect, test } from "bun:test";
import type { CharacterData } from "../api/profile.ts";
import { resolveCharacter } from "./character-resolve.ts";

function character(partial: Partial<CharacterData> & Pick<CharacterData, "characterId" | "classType">): CharacterData {
  return {
    membershipId: "1",
    membershipType: 3,
    dateLastPlayed: "2025-01-01T00:00:00.000Z",
    minutesPlayedTotal: "10",
    light: 100,
    raceType: 0,
    genderType: 0,
    stats: {},
    emblemPath: "",
    emblemBackgroundPath: "",
    ...partial,
  };
}

const characters = [
  character({ characterId: "hunter-aaa", classType: 1, dateLastPlayed: "2025-01-02T00:00:00.000Z" }),
  character({ characterId: "hunter-bbb", classType: 1, dateLastPlayed: "2025-03-02T00:00:00.000Z" }),
  character({ characterId: "titan-1", classType: 0 }),
];

describe("resolveCharacter", () => {
  test("matches a unique class name without changing the previous behavior", () => {
    expect(resolveCharacter(characters, "TITAN").characterId).toBe("titan-1");
  });

  test("matches an exact character id", () => {
    expect(resolveCharacter(characters, "hunter-bbb").characterId).toBe("hunter-bbb");
  });

  test("matches a unique character id prefix", () => {
    expect(resolveCharacter(characters, "titan-").characterId).toBe("titan-1");
  });

  test("asks for an id when several characters share a class", () => {
    expect(() => resolveCharacter(characters, "hunter")).toThrow(
      /Multiple hunter characters match "hunter"/
    );
    expect(() => resolveCharacter(characters, "hunter")).toThrow(/hunter-aaa/);
    expect(() => resolveCharacter(characters, "hunter")).toThrow(/hunter-bbb/);
  });

  test("lists available classes when nothing matches", () => {
    expect(() => resolveCharacter(characters, "warlock")).toThrow(
      'Character "warlock" not found. Available: hunter, hunter, titan'
    );
  });
});
