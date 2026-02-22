import { afterAll, describe, expect, test, mock } from "bun:test";
import { Command } from "commander";

const registerAuthCommands = mock((_program: Command) => {});
const registerCharactersCommand = mock((_program: Command) => {});
const registerInventoryCommand = mock((_program: Command) => {});
const registerTransferCommand = mock((_program: Command) => {});
const registerEquipCommand = mock((_program: Command) => {});
const registerStatsCommand = mock((_program: Command) => {});
const registerTagCommand = mock((_program: Command) => {});
const registerNoteCommand = mock((_program: Command) => {});
const registerSearchCommand = mock((_program: Command) => {});
const registerRollsCommand = mock((_program: Command) => {});
const registerFarmingCommand = mock((_program: Command) => {});
const registerLoadoutCommand = mock((_program: Command) => {});
const registerOrganizeCommand = mock((_program: Command) => {});
const registerCompareCommand = mock((_program: Command) => {});
const registerArmoryCommand = mock((_program: Command) => {});
const registerProgressCommand = mock((_program: Command) => {});
const registerVendorsCommand = mock((_program: Command) => {});
const registerRecordsCommand = mock((_program: Command) => {});
const registerOptimizerCommand = mock((_program: Command) => {});
const registerSyncCommand = mock((_program: Command) => {});
const registerIntegrationsCommand = mock((_program: Command) => {});

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
mock.module("../src/commands/tag.ts", () => ({
  registerTagCommand,
  registerNoteCommand,
}));
mock.module("../src/commands/search.ts", () => ({ registerSearchCommand }));
mock.module("../src/commands/rolls.ts", () => ({ registerRollsCommand }));
mock.module("../src/commands/farming.ts", () => ({ registerFarmingCommand }));
mock.module("../src/commands/loadout.ts", () => ({ registerLoadoutCommand }));
mock.module("../src/commands/organize.ts", () => ({ registerOrganizeCommand }));
mock.module("../src/commands/compare.ts", () => ({ registerCompareCommand }));
mock.module("../src/commands/armory.ts", () => ({ registerArmoryCommand }));
mock.module("../src/commands/progress.ts", () => ({ registerProgressCommand }));
mock.module("../src/commands/vendors.ts", () => ({ registerVendorsCommand }));
mock.module("../src/commands/records.ts", () => ({ registerRecordsCommand }));
mock.module("../src/commands/optimizer.ts", () => ({ registerOptimizerCommand }));
mock.module("../src/commands/sync.ts", () => ({ registerSyncCommand }));
mock.module("../src/commands/integrations.ts", () => ({
  registerIntegrationsCommand,
}));

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
    expect(registerTagCommand).toHaveBeenCalledTimes(1);
    expect(registerNoteCommand).toHaveBeenCalledTimes(1);
    expect(registerSearchCommand).toHaveBeenCalledTimes(1);
    expect(registerRollsCommand).toHaveBeenCalledTimes(1);
    expect(registerFarmingCommand).toHaveBeenCalledTimes(1);
    expect(registerLoadoutCommand).toHaveBeenCalledTimes(1);
    expect(registerOrganizeCommand).toHaveBeenCalledTimes(1);
    expect(registerCompareCommand).toHaveBeenCalledTimes(1);
    expect(registerArmoryCommand).toHaveBeenCalledTimes(1);
    expect(registerProgressCommand).toHaveBeenCalledTimes(1);
    expect(registerVendorsCommand).toHaveBeenCalledTimes(1);
    expect(registerRecordsCommand).toHaveBeenCalledTimes(1);
    expect(registerOptimizerCommand).toHaveBeenCalledTimes(1);
    expect(registerSyncCommand).toHaveBeenCalledTimes(1);
    expect(registerIntegrationsCommand).toHaveBeenCalledTimes(1);
  });
});

afterAll(() => {
  mock.restore();
});
