import { Command } from "commander";
import chalk from "chalk";
import { getProfile, type CharacterData, type InventoryItemData } from "../api/profile.ts";
import { equipItem, transferItem } from "../api/inventory.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { ensureManifest, lookupItem } from "../services/manifest-cache.ts";
import { className, success, error } from "../ui/format.ts";
import { withSpinner, createSpinner } from "../ui/spinner.ts";
import { pickItem, pickCharacter } from "../ui/prompts.ts";
import type { DisplayItem } from "../ui/tables.ts";
import { formatError } from "../utils/errors.ts";

interface LocatedItem extends DisplayItem {
  characterId?: string;
  inVault: boolean;
}

function findEquippableItems(
  profile: any,
  searchQuery: string,
  characters: CharacterData[]
): LocatedItem[] {
  const instances = profile.itemComponents?.instances?.data;
  const results: LocatedItem[] = [];
  const lowerQuery = searchQuery.toLowerCase();

  for (const char of characters) {
    const charName = className(char.classType);
    const sources = [
      profile.characterEquipment?.data?.[char.characterId]?.items || [],
      profile.characterInventories?.data?.[char.characterId]?.items || [],
    ];

    for (const items of sources) {
      for (const item of items as InventoryItemData[]) {
        const def = lookupItem(item.itemHash);
        if (!def || !def.name.toLowerCase().includes(lowerQuery)) continue;
        if (!def.equippable) continue;

        const instance = item.itemInstanceId
          ? instances?.[item.itemInstanceId]
          : undefined;

        results.push({
          name: def.name,
          tier: def.tierTypeName,
          slot: "",
          instanceId: item.itemInstanceId,
          hash: item.itemHash,
          quantity: item.quantity,
          isEquipped: instance?.isEquipped || false,
          location: charName,
          characterId: char.characterId,
          inVault: false,
        });
      }
    }
  }

  // Vault items
  const vaultItems = profile.profileInventory?.data?.items || [];
  for (const item of vaultItems as InventoryItemData[]) {
    const def = lookupItem(item.itemHash);
    if (!def || !def.name.toLowerCase().includes(lowerQuery)) continue;
    if (!def.equippable) continue;

    const instance = item.itemInstanceId
      ? instances?.[item.itemInstanceId]
      : undefined;

    results.push({
      name: def.name,
      tier: def.tierTypeName,
      slot: "",
      instanceId: item.itemInstanceId,
      hash: item.itemHash,
      quantity: item.quantity,
      isEquipped: false,
      location: "Vault",
      characterId: undefined,
      inVault: true,
    });
  }

  return results;
}

export function registerEquipCommand(program: Command) {
  program
    .command("equip")
    .argument("<item>", "Item name to search for")
    .description("Equip an item on a character")
    .option("-c, --character <class>", "Character class (titan/hunter/warlock)")
    .action(async (itemQuery: string, opts) => {
      try {
        await withSpinner("Loading manifest...", () => ensureManifest());

        const profile = await withSpinner("Fetching inventory...", () =>
          getProfile([
            DestinyComponentType.Characters,
            DestinyComponentType.CharacterInventories,
            DestinyComponentType.CharacterEquipment,
            DestinyComponentType.ProfileInventories,
            DestinyComponentType.ItemInstances,
          ])
        );

        const characters = Object.values(
          profile.characters?.data || {}
        ) as CharacterData[];

        const matches = findEquippableItems(profile, itemQuery, characters);

        if (matches.length === 0) {
          console.log(error(`No equippable items found matching "${itemQuery}"`));
          return;
        }

        let selected: LocatedItem;
        if (matches.length === 1) {
          selected = matches[0]!;
        } else {
          selected = (await pickItem(
            matches,
            "Multiple items found. Select one:"
          )) as LocatedItem;
        }

        if (selected.isEquipped) {
          console.log(chalk.yellow(`${selected.name} is already equipped`));
          return;
        }

        // Determine target character
        let targetCharId: string;
        if (opts.character) {
          const char = characters.find(
            (c) =>
              className(c.classType).toLowerCase() ===
              opts.character.toLowerCase()
          );
          if (!char) {
            console.log(error(`Character "${opts.character}" not found`));
            return;
          }
          targetCharId = char.characterId;
        } else if (selected.characterId && !selected.inVault) {
          targetCharId = selected.characterId;
        } else {
          const char = await pickCharacter(
            characters,
            "Equip on which character?"
          );
          targetCharId = char.characterId;
        }

        const spinner = createSpinner(
          `Equipping ${chalk.bold(selected.name)}...`
        ).start();

        try {
          // If item is in vault, transfer to character first
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
            // Item on different character — two-hop transfer
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

          // Now equip
          spinner.text = `Equipping ${chalk.bold(selected.name)}...`;
          await equipItem(selected.instanceId || "0", targetCharId);

          const charName = className(
            characters.find((c) => c.characterId === targetCharId)!.classType
          );
          spinner.succeed(
            success(`${selected.name} equipped on ${charName}`)
          );
        } catch (err) {
          spinner.fail(error(`Equip failed: ${formatError(err)}`));
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
