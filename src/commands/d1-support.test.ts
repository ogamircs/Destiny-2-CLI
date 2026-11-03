import { afterEach, describe, expect, test } from "bun:test";
import { Command } from "commander";
import { registerOptimizerCommand } from "./optimizer.ts";
import { registerRollsCommand } from "./rolls.ts";
import { setGame } from "../games/context.ts";

afterEach(() => {
  setGame("d2");
});

describe("Destiny 1 unsupported commands", () => {
  test("rolls explains why wishlist grading is unavailable", async () => {
    setGame("d1");
    const program = new Command();
    registerRollsCommand(program);
    program.exitOverride();

    await expect(
      program.parseAsync(["node", "destiny", "rolls", "find", "--perk", "Outlaw"])
    ).rejects.toThrow(/not available for Destiny 1/);
  });

  test("optimizer explains why armor scoring is unavailable", async () => {
    setGame("d1");
    const program = new Command();
    registerOptimizerCommand(program);
    program.exitOverride();

    await expect(
      program.parseAsync(["node", "destiny", "optimizer", "analyze", "--character", "hunter"])
    ).rejects.toThrow(/not available for Destiny 1/);
  });
});
