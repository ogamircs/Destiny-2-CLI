import { Command } from "commander";
import { getProfile, type CharacterData } from "../api/profile.ts";
import { ensureManifest } from "../services/manifest-cache.ts";
import {
  addTag,
  removeTag,
  getTags,
  setNote,
  clearNote,
  getNote,
  itemKey,
} from "../services/local-db.ts";
import { buildInventoryIndex, getRequiredComponents } from "../services/item-index.ts";
import type { IndexedItem } from "../services/item-index.ts";
import { pickItem } from "../ui/prompts.ts";
import { className, success, error, dim } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";
import { withSpinner } from "../ui/spinner.ts";

// ---------------------------------------------------------------------------
// Item resolution
// ---------------------------------------------------------------------------

async function resolveItem(query: string): Promise<IndexedItem> {
  await withSpinner("Loading manifest...", () => ensureManifest());

  const profile = await withSpinner("Fetching inventory...", () =>
    getProfile(getRequiredComponents())
  );

  const characters = Object.values(
    profile.characters?.data ?? {}
  ) as CharacterData[];

  const index = buildInventoryIndex(profile, characters);

  const lowerQuery = query.toLowerCase();
  const matches = index.all.filter((i) =>
    i.name.toLowerCase().includes(lowerQuery)
  );

  if (matches.length === 0) {
    throw new Error(`No items found matching "${query}"`);
  }

  if (matches.length === 1) return matches[0]!;

  // Multiple matches — show picker
  const displayItems = matches.map((m) => ({
    name: m.name,
    tier: m.tier,
    slot: m.slot,
    instanceId: m.instanceId,
    hash: m.hash,
    quantity: m.quantity,
    isEquipped: m.isEquipped,
    location:
      m.location === "vault"
        ? "Vault"
        : className(
            characters.find((c) => c.characterId === m.location)?.classType ??
              -1
          ),
  }));

  const picked = await pickItem(displayItems, "Multiple items found. Select one:");

  return (
    index.byInstanceId.get(picked.instanceId ?? "") ??
    index.byHash.get(picked.hash)![0]!
  );
}

// ---------------------------------------------------------------------------
// registerTagCommand
// ---------------------------------------------------------------------------

export function registerTagCommand(program: Command) {
  const tag = program
    .command("tag")
    .description("Tag items for quick filtering and retrieval");

  tag
    .command("add <item> <tag>")
    .description("Add a tag to an item")
    .action(async (itemQuery: string, tagValue: string) => {
      if (!tagValue.trim()) {
        console.log(error("Tag cannot be empty"));
        process.exit(1);
      }
      try {
        const item = await resolveItem(itemQuery);
        addTag(item, tagValue.trim());
        console.log(success(`Tagged "${item.name}" with "${tagValue.trim()}"`));
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  tag
    .command("remove <item> <tag>")
    .description("Remove a tag from an item")
    .action(async (itemQuery: string, tagValue: string) => {
      try {
        const item = await resolveItem(itemQuery);
        removeTag(item, tagValue.trim());
        console.log(
          success(`Removed tag "${tagValue.trim()}" from "${item.name}"`)
        );
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  tag
    .command("list <item>")
    .description("List all tags on an item")
    .action(async (itemQuery: string) => {
      try {
        const item = await resolveItem(itemQuery);
        const tags = getTags(item);
        if (tags.length === 0) {
          console.log(dim(`${item.name}: (no tags)`));
        } else {
          console.log(`${item.name}:`);
          for (const t of tags) {
            console.log(`  • ${t}`);
          }
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}

// ---------------------------------------------------------------------------
// registerNoteCommand
// ---------------------------------------------------------------------------

export function registerNoteCommand(program: Command) {
  const note = program
    .command("note")
    .description("Attach notes to items");

  note
    .command("set <item> <text>")
    .description("Set a note on an item")
    .action(async (itemQuery: string, text: string) => {
      if (!text.trim()) {
        console.log(error("Note text cannot be empty"));
        process.exit(1);
      }
      try {
        const item = await resolveItem(itemQuery);
        setNote(item, text.trim());
        console.log(success(`Note set on "${item.name}"`));
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  note
    .command("clear <item>")
    .description("Clear the note on an item")
    .action(async (itemQuery: string) => {
      try {
        const item = await resolveItem(itemQuery);
        clearNote(item);
        console.log(success(`Note cleared on "${item.name}"`));
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  note
    .command("show <item>")
    .description("Show the note on an item")
    .action(async (itemQuery: string) => {
      try {
        const item = await resolveItem(itemQuery);
        const noteText = getNote(item);
        if (!noteText) {
          console.log(dim(`${item.name}: (no note set)`));
        } else {
          console.log(`${item.name}: ${noteText}`);
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
