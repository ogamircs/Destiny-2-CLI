import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { setGame } from "../games/context.ts";
import {
  applyRecentLocation,
  hasRecentMoveMatching,
  RECENT_MOVE_TTL_MS,
  recordRecentMove,
  recentLocation,
} from "./recent-moves.ts";

const dir = mkdtempSync(join(tmpdir(), "destiny-recent-moves-"));
const originalDir = process.env.DESTINY_RECENT_MOVES_DIR;

afterEach(() => {
  setGame("d2");
});

process.env.DESTINY_RECENT_MOVES_DIR = dir;

describe("recent moves", () => {
  test("trusts a move recorded in the last three minutes over the profile", () => {
    const now = 1_000_000;
    recordRecentMove({
      instanceId: "inst-1",
      hash: 10,
      name: "Ace of Spades",
      location: "vault",
      at: now,
    });

    expect(recentLocation("inst-1", now + 1_000)).toBe("vault");
    expect(recentLocation("inst-1", now + RECENT_MOVE_TTL_MS)).toBeNull();

    const profileSaysWarlock = {
      instanceId: "inst-1",
      hash: 10,
      name: "Ace of Spades",
      inVault: false,
      characterId: "warlock-id",
      location: "Warlock",
    };
    expect(applyRecentLocation(profileSaysWarlock, now + 1_000)).toMatchObject({
      inVault: true,
      characterId: undefined,
      location: "Vault",
    });
  });

  test("matches a recent item name and ignores other games", () => {
    const now = 2_000_000;
    recordRecentMove({
      instanceId: "inst-2",
      hash: 11,
      name: "Fatebringer",
      location: "vault",
      game: "d1",
      at: now,
    });
    setGame("d1");
    expect(hasRecentMoveMatching("fate", now + 10)).toBe(true);
    setGame("d2");
    expect(hasRecentMoveMatching("fate", now + 10)).toBe(false);
    expect(hasRecentMoveMatching("NotARealGun", now + 10)).toBe(false);
  });
});

afterAll(() => {
  if (originalDir === undefined) delete process.env.DESTINY_RECENT_MOVES_DIR;
  else process.env.DESTINY_RECENT_MOVES_DIR = originalDir;
  rmSync(dir, { recursive: true, force: true });
});
