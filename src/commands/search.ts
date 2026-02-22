import { Command } from "commander";
import { getProfile, type CharacterData } from "../api/profile.ts";
import { ensureManifest } from "../services/manifest-cache.ts";
import { buildInventoryIndex, getRequiredComponents } from "../services/item-index.ts";
import type { IndexedItem } from "../services/item-index.ts";
import { parseQuery } from "../services/search.ts";
import { getAllTags, saveSearch, listSearches, itemKey } from "../services/local-db.ts";
import { renderInventoryTable } from "../ui/tables.ts";
import { className, error, success, header } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";
import { withSpinner } from "../ui/spinner.ts";

export function registerSearchCommand(program: Command) {
  program
    .command("search [query]")
    .description("Search your inventory using a query DSL")
    .option("--json", "Output results as JSON")
    .option("--save <name>", "Save this query with a name")
    .option("--saved", "List all saved queries")
    .action(async (query: string | undefined, opts) => {
      try {
        // List saved queries
        if (opts.saved) {
          const searches = listSearches();
          if (searches.length === 0) {
            console.log("No saved searches.");
          } else {
            console.log(header("\nSaved Searches"));
            for (const s of searches) {
              console.log(`  ${s.name}: ${s.query}`);
            }
          }
          return;
        }

        if (!query) {
          console.log(error("Query required. Use --saved to list saved queries."));
          process.exit(1);
        }

        await withSpinner("Loading manifest...", () => ensureManifest());

        const profile = await withSpinner("Fetching inventory...", () =>
          getProfile(getRequiredComponents())
        );

        const characters = Object.values(
          profile.characters?.data ?? {}
        ) as CharacterData[];

        const index = buildInventoryIndex(profile, characters);
        const allTags = getAllTags();
        const predicate = parseQuery(query);

        const matches = index.all.filter((item) => {
          const key = itemKey(item);
          const tags = allTags.get(key) ?? [];
          return predicate(item, tags);
        });

        // Save query if requested
        if (opts.save) {
          saveSearch(opts.save, query);
          console.log(success(`Saved search "${opts.save}"`));
        }

        if (opts.json) {
          console.log(JSON.stringify(matches, null, 2));
          return;
        }

        if (matches.length === 0) {
          console.log("No items matched the query.");
          return;
        }

        // Group by location for display
        const byLocation = new Map<string, typeof matches>();
        for (const item of matches) {
          const loc =
            item.location === "vault"
              ? "Vault"
              : className(
                  characters.find((c) => c.characterId === item.location)
                    ?.classType ?? -1
                );
          const existing = byLocation.get(loc) ?? [];
          existing.push(item);
          byLocation.set(loc, existing);
        }

        for (const [loc, items] of byLocation) {
          const displayItems = items.map((i) => ({
            name: i.name,
            tier: i.tier,
            slot: i.slot,
            instanceId: i.instanceId,
            hash: i.hash,
            quantity: i.quantity,
            isEquipped: i.isEquipped,
            location: loc,
          }));
          renderInventoryTable(displayItems, loc);
        }

        console.log(`\n${matches.length} item(s) matched.`);
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
