import { Command } from "commander";
import chalk from "chalk";
import type { CharacterData } from "../api/profile.ts";
import { transferItem } from "../api/inventory.ts";
import { className, success, error } from "../ui/format.ts";
import { createSpinner } from "../ui/spinner.ts";
import { pickCharacter, pickDestination, pickItem } from "../ui/prompts.ts";
import { formatError } from "../utils/errors.ts";
import {
  loadInventoryContext,
  resolveCharacter,
  runCommandAction,
  toLocatedItem,
  type LocatedItem,
} from "./shared.ts";

function findItems(
  allItems: Array<Parameters<typeof toLocatedItem>[0]>,
  characters: Map<string, CharacterData>,
  searchQuery: string
): LocatedItem[] {
  const lowerQuery = searchQuery.toLowerCase();

  return allItems
    .filter((item) => item.name.toLowerCase().includes(lowerQuery))
    .map((item) => toLocatedItem(item, characters, { slot: "" }));
}

export function registerTransferCommand(program: Command) {
  program
    .command("transfer")
    .alias("move")
    .argument("<item>", "Item name to search for")
    .description("Transfer an item between characters and vault")
    .option("--to <destination>", "Destination: vault, titan, hunter, warlock")
    .option("--count <n>", "Stack count to transfer", "1")
    .action(runCommandAction(async (itemQuery: string, opts) => {
      const { characters, byCharacterId, index } = await loadInventoryContext();
      const matches = findItems(index.all, byCharacterId, itemQuery);

      if (matches.length === 0) {
        console.log(error(`No items found matching "${itemQuery}"`));
        return;
      }

      const selected = matches.length === 1
        ? matches[0]!
        : (await pickItem(matches, "Multiple items found. Select one:")) as LocatedItem;

      if (selected.isEquipped) {
        console.log(
          error(
            `${selected.name} is currently equipped. Unequip it first or use: destiny equip`
          )
        );
        return;
      }

      let toVault = false;
      let destCharacterId: string | undefined;

      if (opts.to) {
        const toLower = opts.to.toLowerCase();
        if (toLower === "vault") {
          toVault = true;
        } else {
          destCharacterId = resolveCharacter(characters, opts.to).characterId;
        }
      } else {
        const destination = await pickDestination(characters);
        if (destination.type === "vault") {
          toVault = true;
        } else {
          destCharacterId = destination.characterId;
        }
      }

      const count = Number.parseInt(opts.count, 10) || 1;
      const spinner = createSpinner(
        `Transferring ${chalk.bold(selected.name)}...`
      ).start();

      try {
        if (selected.inVault && !toVault) {
          if (!destCharacterId) {
            const destination = await pickCharacter(
              characters,
              "Transfer to which character?"
            );
            destCharacterId = destination.characterId;
          }
          await transferItem(
            selected.hash,
            count,
            false,
            selected.instanceId || "0",
            destCharacterId
          );
        } else if (!selected.inVault && toVault) {
          await transferItem(
            selected.hash,
            count,
            true,
            selected.instanceId || "0",
            selected.characterId!
          );
        } else if (!selected.inVault && !toVault && destCharacterId) {
          spinner.text = `Moving ${chalk.bold(selected.name)} to vault...`;
          await transferItem(
            selected.hash,
            count,
            true,
            selected.instanceId || "0",
            selected.characterId!
          );

          spinner.text = `Moving ${chalk.bold(selected.name)} from vault...`;
          await transferItem(
            selected.hash,
            count,
            false,
            selected.instanceId || "0",
            destCharacterId
          );
        } else {
          spinner.fail();
          console.log(error("Item is already in the destination"));
          return;
        }

        const destName = toVault
          ? "Vault"
          : className(byCharacterId.get(destCharacterId!)!.classType);
        spinner.succeed(success(`${selected.name} transferred to ${destName}`));
      } catch (err) {
        spinner.fail(error(`Transfer failed: ${formatError(err)}`));
      }
    }));
}
