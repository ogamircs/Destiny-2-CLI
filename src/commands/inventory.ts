import { Command } from "commander";
import type { DisplayItem } from "../ui/tables.ts";
import { renderInventoryTable } from "../ui/tables.ts";
import { error } from "../ui/format.ts";
import {
  loadInventoryContext,
  locationLabel,
  runCommandAction,
  toDisplayItem,
} from "./shared.ts";

function groupByLocation(items: DisplayItem[]): Map<string, DisplayItem[]> {
  const byLocation = new Map<string, DisplayItem[]>();

  for (const item of items) {
    const locationItems = byLocation.get(item.location) ?? [];
    locationItems.push(item);
    byLocation.set(item.location, locationItems);
  }

  return byLocation;
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
    .action(runCommandAction(async (opts) => {
      const { byCharacterId, index } = await loadInventoryContext();
      let items = index.all;

      if (opts.vault) {
        items = items.filter((item) => item.location === "vault");
      } else if (opts.character) {
        const target = opts.character.toLowerCase();
        items = items.filter(
          (item) => locationLabel(item.location, byCharacterId).toLowerCase() === target
        );
      }

      if (opts.slot) {
        const slotLower = opts.slot.toLowerCase();
        items = items.filter((item) => item.slot.toLowerCase() === slotLower);
      }

      if (opts.search) {
        const searchLower = opts.search.toLowerCase();
        items = items.filter((item) => item.name.toLowerCase().includes(searchLower));
      }

      const displayItems = items.map((item) => toDisplayItem(item, byCharacterId));

      if (opts.json) {
        console.log(JSON.stringify(displayItems, null, 2));
        return;
      }

      if (displayItems.length === 0) {
        console.log(error("No items found matching your criteria"));
        return;
      }

      for (const [location, locationItems] of groupByLocation(displayItems)) {
        renderInventoryTable(locationItems, location);
      }
    }));
}
