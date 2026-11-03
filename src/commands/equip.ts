import { Command } from "commander";
import chalk from "chalk";
import type { CharacterData } from "../api/profile.ts";
import { equipItem, transferItem } from "../api/inventory.ts";
import { className, success } from "../ui/format.ts";
import { createSpinner } from "../ui/spinner.ts";
import { pickCharacter, pickItem } from "../ui/prompts.ts";
import { formatError } from "../utils/errors.ts";
import { withFreshProfileRetry } from "../services/move-retry.ts";
import { applyRecentLocation, recordRecentMove } from "../services/recent-moves.ts";
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
      const spinner = createSpinner(`Equipping ${chalk.bold(itemQuery)}...`).start();
      try {
        const message = await withFreshProfileRetry(async () => {
          const { characters, byCharacterId, index } = await loadInventoryContext();
          const matches = findEquippableItems(index.all, byCharacterId, itemQuery).map((item) =>
            applyRecentLocation(item)
          );
          if (matches.length === 0) {
            throw new Error(`No equippable items found matching "${itemQuery}"`);
          }

          const selected = matches.length === 1
            ? matches[0]!
            : applyRecentLocation(
                (await pickItem(matches, "Multiple items found. Select one:")) as LocatedItem
              );

          if (selected.isEquipped) {
            return `${selected.name} is already equipped`;
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

          const remember = (location: string) => {
            if (!selected.instanceId) return;
            recordRecentMove({
              instanceId: selected.instanceId,
              hash: selected.hash,
              name: selected.name,
              location,
            });
          };

          if (selected.inVault) {
            spinner.text = `Transferring ${chalk.bold(selected.name)} from vault...`;
            await transferItem(
              selected.hash,
              1,
              false,
              selected.instanceId || "0",
              targetCharId
            );
            remember(targetCharId);
          } else if (selected.characterId !== targetCharId) {
            spinner.text = `Moving ${chalk.bold(selected.name)} to vault...`;
            await transferItem(
              selected.hash,
              1,
              true,
              selected.instanceId || "0",
              selected.characterId!
            );
            remember("vault");
            spinner.text = `Moving ${chalk.bold(selected.name)} from vault...`;
            await transferItem(
              selected.hash,
              1,
              false,
              selected.instanceId || "0",
              targetCharId
            );
            remember(targetCharId);
          }

          spinner.text = `Equipping ${chalk.bold(selected.name)}...`;
          await equipItem(selected.instanceId || "0", targetCharId);
          const characterName = className(byCharacterId.get(targetCharId)!.classType);
          return `${selected.name} equipped on ${characterName}`;
        });
        spinner.succeed(success(message));
      } catch (err) {
        spinner.fail();
        throw new Error(`Equip failed: ${formatError(err)}`);
      }
    }));
}
