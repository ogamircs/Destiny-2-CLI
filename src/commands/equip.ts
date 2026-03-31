import { Command } from "commander";
import chalk from "chalk";
import type { CharacterData } from "../api/profile.ts";
import { equipItem, transferItem } from "../api/inventory.ts";
import { className, success, error } from "../ui/format.ts";
import { createSpinner } from "../ui/spinner.ts";
import { pickCharacter, pickItem } from "../ui/prompts.ts";
import { formatError } from "../utils/errors.ts";
import {
  loadInventoryContext,
  resolveCharacter,
  runCommandAction,
  toLocatedItem,
  type LocatedItem,
} from "./shared.ts";

function findEquippableItems(
  allItems: Array<Parameters<typeof toLocatedItem>[0]>,
  characters: Map<string, CharacterData>,
  searchQuery: string
): LocatedItem[] {
  const lowerQuery = searchQuery.toLowerCase();

  return allItems
    .filter(
      (item) => item.equippable && item.name.toLowerCase().includes(lowerQuery)
    )
    .map((item) => toLocatedItem(item, characters, { slot: "" }));
}

export function registerEquipCommand(program: Command) {
  program
    .command("equip")
    .argument("<item>", "Item name to search for")
    .description("Equip an item on a character")
    .option("-c, --character <class>", "Character class (titan/hunter/warlock)")
    .action(runCommandAction(async (itemQuery: string, opts) => {
      const { characters, byCharacterId, index } = await loadInventoryContext();
      const matches = findEquippableItems(index.all, byCharacterId, itemQuery);

      if (matches.length === 0) {
        console.log(error(`No equippable items found matching "${itemQuery}"`));
        return;
      }

      const selected = matches.length === 1
        ? matches[0]!
        : (await pickItem(matches, "Multiple items found. Select one:")) as LocatedItem;

      if (selected.isEquipped) {
        console.log(chalk.yellow(`${selected.name} is already equipped`));
        return;
      }

      let targetCharId: string;
      if (opts.character) {
        targetCharId = resolveCharacter(characters, opts.character).characterId;
      } else if (selected.characterId && !selected.inVault) {
        targetCharId = selected.characterId;
      } else {
        const character = await pickCharacter(characters, "Equip on which character?");
        targetCharId = character.characterId;
      }

      const spinner = createSpinner(
        `Equipping ${chalk.bold(selected.name)}...`
      ).start();

      try {
        if (selected.inVault) {
          spinner.text = `Transferring ${chalk.bold(selected.name)} from vault...`;
          await transferItem(
            selected.hash,
            1,
            false,
            selected.instanceId || "0",
            targetCharId
          );
        } else if (selected.characterId !== targetCharId) {
          spinner.text = `Moving ${chalk.bold(selected.name)} to vault...`;
          await transferItem(
            selected.hash,
            1,
            true,
            selected.instanceId || "0",
            selected.characterId!
          );
          spinner.text = `Moving ${chalk.bold(selected.name)} from vault...`;
          await transferItem(
            selected.hash,
            1,
            false,
            selected.instanceId || "0",
            targetCharId
          );
        }

        spinner.text = `Equipping ${chalk.bold(selected.name)}...`;
        await equipItem(selected.instanceId || "0", targetCharId);

        const characterName = className(byCharacterId.get(targetCharId)!.classType);
        spinner.succeed(success(`${selected.name} equipped on ${characterName}`));
      } catch (err) {
        spinner.fail(error(`Equip failed: ${formatError(err)}`));
      }
    }));
}
