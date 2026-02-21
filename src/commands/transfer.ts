import { Command } from "commander";
import chalk from "chalk";
import { getProfile, type CharacterData, type InventoryItemData } from "../api/profile.ts";
import { transferItem } from "../api/inventory.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { ensureManifest, lookupItem } from "../services/manifest-cache.ts";
import { className, success, error } from "../ui/format.ts";
import { withSpinner, createSpinner } from "../ui/spinner.ts";
import { pickItem, pickCharacter, pickDestination, confirm } from "../ui/prompts.ts";
import type { DisplayItem } from "../ui/tables.ts";
import { formatError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";

interface LocatedItem extends DisplayItem {
  characterId?: string;
  inVault: boolean;
}

function findItems(
  profile: any,
  searchQuery: string,
  characters: CharacterData[]
): LocatedItem[] {
  const instances = profile.itemComponents?.instances?.data;
  const results: LocatedItem[] = [];
  const lowerQuery = searchQuery.toLowerCase();

  // Search character equipment + inventories
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

  // Search vault
  const vaultItems = profile.profileInventory?.data?.items || [];
  for (const item of vaultItems as InventoryItemData[]) {
    const def = lookupItem(item.itemHash);
    if (!def || !def.name.toLowerCase().includes(lowerQuery)) continue;

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

export function registerTransferCommand(program: Command) {
  program
    .command("transfer")
    .alias("move")
    .argument("<item>", "Item name to search for")
    .description("Transfer an item between characters and vault")
    .option("--to <destination>", "Destination: vault, titan, hunter, warlock")
    .option("--count <n>", "Stack count to transfer", "1")
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

        const matches = findItems(profile, itemQuery, characters);

        if (matches.length === 0) {
          console.log(error(`No items found matching "${itemQuery}"`));
          return;
        }

        // Select item if ambiguous
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
          console.log(
            error(
              `${selected.name} is currently equipped. Unequip it first or use: destiny equip`
            )
          );
          return;
        }

        // Determine destination
        let toVault = false;
        let destCharacterId: string | undefined;

        if (opts.to) {
          const toLower = opts.to.toLowerCase();
          if (toLower === "vault") {
            toVault = true;
          } else {
            const destChar = characters.find(
              (c) => className(c.classType).toLowerCase() === toLower
            );
            if (!destChar) {
              console.log(error(`Character "${opts.to}" not found`));
              return;
            }
            destCharacterId = destChar.characterId;
          }
        } else {
          const dest = await pickDestination(characters);
          if (dest.type === "vault") {
            toVault = true;
          } else {
            destCharacterId = dest.characterId;
          }
        }

        const count = parseInt(opts.count, 10) || 1;

        // Execute transfer
        const spinner = createSpinner(
          `Transferring ${chalk.bold(selected.name)}...`
        ).start();

        try {
          if (selected.inVault && !toVault) {
            // Vault → Character
            if (!destCharacterId) {
              const dest = await pickCharacter(
                characters,
                "Transfer to which character?"
              );
              destCharacterId = dest.characterId;
            }
            await transferItem(
              selected.hash,
              count,
              false,
              selected.instanceId || "0",
              destCharacterId
            );
          } else if (!selected.inVault && toVault) {
            // Character → Vault
            await transferItem(
              selected.hash,
              count,
              true,
              selected.instanceId || "0",
              selected.characterId!
            );
          } else if (!selected.inVault && !toVault && destCharacterId) {
            // Character → Character (two-hop via vault)
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
            : className(
                characters.find((c) => c.characterId === destCharacterId)!
                  .classType
              );
          spinner.succeed(
            success(`${selected.name} transferred to ${destName}`)
          );
        } catch (err) {
          spinner.fail(error(`Transfer failed: ${formatError(err)}`));
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
