import { Command } from "commander";
import { getProfile, type CharacterData } from "../api/profile.ts";
import * as manifestCache from "../services/manifest-cache.ts";
import { buildInventoryIndex, getRequiredComponents } from "../services/item-index.ts";
import { buildArmoryItemView, resolveArmoryItem } from "../services/armory.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { className, dim, error, header } from "../ui/format.ts";
import { withSpinner } from "../ui/spinner.ts";
import { formatError } from "../utils/errors.ts";

function componentsForArmory(): number[] {
  const components = [...getRequiredComponents()];
  if (!components.includes(DestinyComponentType.ItemPerks)) {
    components.push(DestinyComponentType.ItemPerks);
  }
  return components;
}

function locationLabel(location: string, characters: CharacterData[]): string {
  if (location === "vault") {
    return "Vault";
  }
  return className(
    characters.find((character) => character.characterId === location)?.classType ?? -1
  );
}

export function registerArmoryCommand(program: Command) {
  program
    .command("armory")
    .description("Deep view for a single inventory item")
    .requiredOption("--item <nameOrInstanceId>", "Item name fragment or instanceId")
    .option("--json", "Output deep item view as JSON")
    .action(async (opts) => {
      try {
        await withSpinner("Loading manifest...", () => manifestCache.ensureManifest());

        const profile = await withSpinner("Fetching inventory...", () =>
          getProfile(componentsForArmory())
        );

        const characters = Object.values(
          profile.characters?.data ?? {}
        ) as CharacterData[];
        const index = buildInventoryIndex(profile, characters);

        const item = resolveArmoryItem(index.all, opts.item);

        if (!item) {
          const suggestions = manifestCache.searchItems(opts.item)
            .slice(0, 5)
            .map((entry) => entry.name)
            .filter((name) => name.trim().length > 0);

          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  found: false,
                  query: opts.item,
                  suggestions,
                },
                null,
                2
              )
            );
            return;
          }

          console.log(`No inventory item found for "${opts.item}".`);
          if (suggestions.length > 0) {
            console.log("Manifest suggestions:");
            for (const suggestion of suggestions) {
              console.log(`- ${suggestion}`);
            }
          } else {
            console.log(dim("No manifest suggestions found."));
          }
          return;
        }

        const view = buildArmoryItemView(
          item,
          locationLabel(item.location, characters),
          manifestCache.lookupPerk
        );

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                found: true,
                item: view,
              },
              null,
              2
            )
          );
          return;
        }

        console.log(header(`\n${view.name}`));
        console.log(`Hash: ${view.hash}`);
        console.log(`Instance ID: ${view.instanceId ?? "-"}`);
        console.log(`Tier/Slot: ${view.tier} ${view.slot}`);
        console.log(`Power: ${view.power ?? "-"}`);
        console.log(`Quantity: ${view.quantity}`);
        console.log(`Location: ${view.location}`);
        console.log(`Equipped: ${view.equipped ? "yes" : "no"}`);
        console.log(`Locked: ${view.locked ? "yes" : "no"}`);
        console.log(
          `Transferable: ${view.transferable ? "yes" : "no"} (${view.transferReason})`
        );
        if (view.perks.length === 0) {
          console.log("Perks: -");
        } else {
          console.log("Perks:");
          for (const perk of view.perks) {
            console.log(`- ${perk}`);
          }
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
