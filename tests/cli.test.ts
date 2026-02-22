import { afterAll, describe, expect, test, mock } from "bun:test";
import { Command } from "commander";

const registerAuthCommands = mock((_program: Command) => {});
const registerCharactersCommand = mock((_program: Command) => {});
const registerInventoryCommand = mock((_program: Command) => {});
const registerTransferCommand = mock((_program: Command) => {});
const registerEquipCommand = mock((_program: Command) => {});
const registerStatsCommand = mock((_program: Command) => {});

mock.module("../src/commands/auth.ts", () => ({ registerAuthCommands }));
mock.module("../src/commands/characters.ts", () => ({
  registerCharactersCommand,
}));
mock.module("../src/commands/inventory.ts", () => ({
  registerInventoryCommand,
}));
mock.module("../src/commands/transfer.ts", () => ({
  registerTransferCommand,
}));
mock.module("../src/commands/equip.ts", () => ({ registerEquipCommand }));
mock.module("../src/commands/stats.ts", () => ({ registerStatsCommand }));

const { createProgram } = await import("../src/cli.ts");

describe("createProgram", () => {
  test("creates commander program and registers all command groups", () => {
    const program = createProgram();

    expect(program).toBeInstanceOf(Command);
    expect(program.name()).toBe("destiny");

    expect(registerAuthCommands).toHaveBeenCalledTimes(1);
    expect(registerCharactersCommand).toHaveBeenCalledTimes(1);
    expect(registerInventoryCommand).toHaveBeenCalledTimes(1);
    expect(registerTransferCommand).toHaveBeenCalledTimes(1);
    expect(registerEquipCommand).toHaveBeenCalledTimes(1);
    expect(registerStatsCommand).toHaveBeenCalledTimes(1);
  });
});

afterAll(() => {
  mock.restore();
});
