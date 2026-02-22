import { Command } from "commander";
import { setVerbose } from "./utils/logger.ts";
import { registerAuthCommands } from "./commands/auth.ts";
import { registerCharactersCommand } from "./commands/characters.ts";
import { registerInventoryCommand } from "./commands/inventory.ts";
import { registerTransferCommand } from "./commands/transfer.ts";
import { registerEquipCommand } from "./commands/equip.ts";
import { registerStatsCommand } from "./commands/stats.ts";
import { registerTagCommand, registerNoteCommand } from "./commands/tag.ts";
import { registerSearchCommand } from "./commands/search.ts";
import { registerRollsCommand } from "./commands/rolls.ts";
import { registerFarmingCommand } from "./commands/farming.ts";
import { registerLoadoutCommand } from "./commands/loadout.ts";
import { registerOrganizeCommand } from "./commands/organize.ts";
import { registerCompareCommand } from "./commands/compare.ts";
import { registerArmoryCommand } from "./commands/armory.ts";
import { registerProgressCommand } from "./commands/progress.ts";
import { registerVendorsCommand } from "./commands/vendors.ts";
import { registerRecordsCommand } from "./commands/records.ts";
import { registerOptimizerCommand } from "./commands/optimizer.ts";
import { registerSyncCommand } from "./commands/sync.ts";
import { registerIntegrationsCommand } from "./commands/integrations.ts";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("destiny")
    .description("Destiny 2 CLI — manage your inventory from the terminal")
    .version("0.1.0")
    .option("--verbose", "Enable debug logging")
    .hook("preAction", (thisCommand) => {
      const opts = thisCommand.optsWithGlobals();
      if (opts.verbose) {
        setVerbose(true);
      }
    });

  registerAuthCommands(program);
  registerCharactersCommand(program);
  registerInventoryCommand(program);
  registerTransferCommand(program);
  registerEquipCommand(program);
  registerStatsCommand(program);
  registerTagCommand(program);
  registerNoteCommand(program);
  registerSearchCommand(program);
  registerRollsCommand(program);
  registerFarmingCommand(program);
  registerLoadoutCommand(program);
  registerOrganizeCommand(program);
  registerCompareCommand(program);
  registerArmoryCommand(program);
  registerProgressCommand(program);
  registerVendorsCommand(program);
  registerRecordsCommand(program);
  registerOptimizerCommand(program);
  registerSyncCommand(program);
  registerIntegrationsCommand(program);

  return program;
}
