import { describe, expect, test } from "bun:test";
import { Command } from "commander";
import { registerAuthCommands } from "../../src/commands/auth.ts";
import { registerCharactersCommand } from "../../src/commands/characters.ts";
import { registerEquipCommand } from "../../src/commands/equip.ts";
import { registerInventoryCommand } from "../../src/commands/inventory.ts";
import { registerStatsCommand } from "../../src/commands/stats.ts";
import { registerTransferCommand } from "../../src/commands/transfer.ts";

function commandNames(program: Command): string[] {
  return program.commands.map((c) => c.name());
}

describe("command registration", () => {
  test("registerAuthCommands adds auth and subcommands", () => {
    const program = new Command();
    registerAuthCommands(program);

    expect(commandNames(program)).toContain("auth");
    const auth = program.commands.find((c) => c.name() === "auth");
    expect(auth).toBeDefined();
    expect(auth?.commands.map((c) => c.name())).toEqual([
      "login",
      "logout",
      "status",
    ]);
  });

  test("registerCharactersCommand adds characters command", () => {
    const program = new Command();
    registerCharactersCommand(program);
    expect(commandNames(program)).toContain("characters");
  });

  test("registerInventoryCommand adds inventory command", () => {
    const program = new Command();
    registerInventoryCommand(program);
    expect(commandNames(program)).toContain("inventory");
  });

  test("registerTransferCommand adds transfer command", () => {
    const program = new Command();
    registerTransferCommand(program);
    expect(commandNames(program)).toContain("transfer");
  });

  test("registerEquipCommand adds equip command", () => {
    const program = new Command();
    registerEquipCommand(program);
    expect(commandNames(program)).toContain("equip");
  });

  test("registerStatsCommand adds stats command", () => {
    const program = new Command();
    registerStatsCommand(program);
    expect(commandNames(program)).toContain("stats");
  });
});
