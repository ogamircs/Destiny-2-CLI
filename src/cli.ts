import { Command } from "commander";
import { setVerbose } from "./utils/logger.ts";
import { registerAuthCommands } from "./commands/auth.ts";
import { registerCharactersCommand } from "./commands/characters.ts";
import { registerInventoryCommand } from "./commands/inventory.ts";
import { registerTransferCommand } from "./commands/transfer.ts";
import { registerEquipCommand } from "./commands/equip.ts";
import { registerStatsCommand } from "./commands/stats.ts";

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

  return program;
}
