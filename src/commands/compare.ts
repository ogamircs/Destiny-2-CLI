import Table from "cli-table3";
import chalk from "chalk";
import { Command } from "commander";
import { getProfile, type CharacterData } from "../api/profile.ts";
import * as manifestCache from "../services/manifest-cache.ts";
import { buildInventoryIndex, getRequiredComponents } from "../services/item-index.ts";
import { buildCompareRows } from "../services/compare.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { className, dim, error, header } from "../ui/format.ts";
import { withSpinner } from "../ui/spinner.ts";
import { formatError } from "../utils/errors.ts";

function locationLabel(location: string, characters: CharacterData[]): string {
  if (location === "vault") {
    return "Vault";
  }
  return className(
    characters.find((character) => character.characterId === location)?.classType ?? -1
  );
}

function perkSummary(perks: string[]): string {
  if (perks.length === 0) {
    return "-";
  }
  if (perks.length <= 2) {
    return perks.join(", ");
  }
  return `${perks.slice(0, 2).join(", ")}, +${perks.length - 2} more`;
}

function compactState(row: { equipped: boolean; locked: boolean; transferable: boolean }) {
  const equipped = row.equipped ? "E" : "-";
  const locked = row.locked ? "L" : "-";
  const transferable = row.transferable ? "T" : "-";
  return `${equipped}${locked}${transferable}`;
}

function compareComponents(): number[] {
  const components = [...getRequiredComponents()];
  if (!components.includes(DestinyComponentType.ItemPerks)) {
    components.push(DestinyComponentType.ItemPerks);
  }
  return components;
}

export function registerCompareCommand(program: Command) {
  program
    .command("compare <query>")
    .description("Compare matching items by name fragment")
    .option("--json", "Output comparison rows as JSON")
    .action(async (query: string, opts) => {
      try {
        await withSpinner("Loading manifest...", () => manifestCache.ensureManifest());

        const profile = await withSpinner("Fetching inventory...", () =>
          getProfile(compareComponents())
        );

        const characters = Object.values(
          profile.characters?.data ?? {}
        ) as CharacterData[];
        const index = buildInventoryIndex(profile, characters);

        const lowerQuery = query.toLowerCase();
        const matches = index.all.filter((item) =>
          item.name.toLowerCase().includes(lowerQuery)
        );

        if (matches.length === 0) {
          console.log(error(`No items found matching "${query}"`));
          return;
        }
        if (matches.length < 2) {
          console.log(dim("Need at least two matching items to compare."));
          return;
        }

        const rows = buildCompareRows(
          matches,
          (location) => locationLabel(location, characters),
          manifestCache.lookupPerk
        );

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                query,
                items: rows,
              },
              null,
              2
            )
          );
          return;
        }

        const table = new Table({
          head: [
            chalk.bold("Item"),
            chalk.bold("Power"),
            chalk.bold("Perks"),
            chalk.bold("State"),
            chalk.bold("Location"),
          ],
          style: { head: [], border: ["dim"] },
          colWidths: [40, 8, 42, 8, 12],
        });

        for (const row of rows) {
          const itemLabel = row.instanceId
            ? `${row.name} (${row.instanceId})`
            : `${row.name} (${row.hash})`;
          table.push([
            `${itemLabel}\n${chalk.dim(`${row.tier} ${row.slot}`)}`,
            row.power === null ? "-" : String(row.power),
            perkSummary(row.perks),
            compactState(row),
            row.location,
          ]);
        }

        console.log(header(`\nCompare: ${query}`));
        console.log(table.toString());
        console.log(dim("State key: E=equipped, L=locked, T=transferable"));
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
