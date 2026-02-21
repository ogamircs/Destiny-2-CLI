import { Command } from "commander";
import { getProfile, type CharacterData, type InventoryItemData } from "../api/profile.ts";
import { DestinyComponentType, BUCKET_SLOT_NAMES, WEAPON_BUCKETS, ARMOR_BUCKETS } from "../utils/constants.ts";
import { ensureManifest, lookupItem } from "../services/manifest-cache.ts";
import { renderInventoryTable, type DisplayItem } from "../ui/tables.ts";
import { withSpinner } from "../ui/spinner.ts";
import { className, header } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";
import { error } from "../ui/format.ts";

function resolveItems(
  items: InventoryItemData[],
  instances: Record<string, any> | undefined,
  location: string
): DisplayItem[] {
  const result: DisplayItem[] = [];

  for (const item of items) {
    const def = lookupItem(item.itemHash);
    if (!def) continue;

    const instance = item.itemInstanceId
      ? instances?.[item.itemInstanceId]
      : undefined;

    const slotName =
      BUCKET_SLOT_NAMES[item.bucketHash] ||
      BUCKET_SLOT_NAMES[def.bucketHash] ||
      "Other";

    result.push({
      name: def.name,
      tier: def.tierTypeName,
      slot: slotName,
      instanceId: item.itemInstanceId,
      hash: item.itemHash,
      quantity: item.quantity,
      isEquipped: instance?.isEquipped || false,
      location,
    });
  }

  return result;
}

export function registerInventoryCommand(program: Command) {
  program
    .command("inventory")
    .alias("inv")
    .description("View your inventory")
    .option("-c, --character <class>", "Filter by character class (titan/hunter/warlock)")
    .option("-v, --vault", "Show vault items only")
    .option("-s, --slot <slot>", "Filter by slot (kinetic/energy/power/helmet/etc)")
    .option("-q, --search <query>", "Search items by name")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
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

        const characters = profile.characters?.data
          ? (Object.values(profile.characters.data) as CharacterData[])
          : [];

        const instances = profile.itemComponents?.instances?.data;
        let allItems: DisplayItem[] = [];

        // Character equipment + inventory
        if (!opts.vault) {
          for (const char of characters) {
            const charName = className(char.classType);

            if (
              opts.character &&
              charName.toLowerCase() !== opts.character.toLowerCase()
            ) {
              continue;
            }

            const equipped =
              profile.characterEquipment?.data?.[char.characterId]?.items || [];
            const inventory =
              profile.characterInventories?.data?.[char.characterId]?.items || [];

            allItems.push(
              ...resolveItems(equipped, instances, charName),
              ...resolveItems(inventory, instances, charName)
            );
          }
        }

        // Vault items
        if (!opts.character || opts.vault) {
          const vaultItems = profile.profileInventory?.data?.items || [];
          allItems.push(...resolveItems(vaultItems, instances, "Vault"));
        }

        // Filter by slot
        if (opts.slot) {
          const slotLower = opts.slot.toLowerCase();
          allItems = allItems.filter(
            (i) => i.slot.toLowerCase() === slotLower
          );
        }

        // Filter by search
        if (opts.search) {
          const searchLower = opts.search.toLowerCase();
          allItems = allItems.filter((i) =>
            i.name.toLowerCase().includes(searchLower)
          );
        }

        if (opts.json) {
          console.log(JSON.stringify(allItems, null, 2));
          return;
        }

        if (allItems.length === 0) {
          console.log(error("No items found matching your criteria"));
          return;
        }

        // Group by location and render
        const byLocation = new Map<string, DisplayItem[]>();
        for (const item of allItems) {
          const locItems = byLocation.get(item.location) || [];
          locItems.push(item);
          byLocation.set(item.location, locItems);
        }

        for (const [location, items] of byLocation) {
          renderInventoryTable(items, location);
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
