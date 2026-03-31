import { Command } from "commander";
import {
  addTag,
  removeTag,
  getTags,
  setNote,
  clearNote,
  getNote,
} from "../services/local-db.ts";
import type { IndexedItem } from "../services/item-index.ts";
import { success, error, dim } from "../ui/format.ts";
import {
  loadInventoryContext,
  resolveIndexedItem,
  runCommandAction,
} from "./shared.ts";

// ---------------------------------------------------------------------------
// Item resolution
// ---------------------------------------------------------------------------

async function resolveItem(query: string): Promise<IndexedItem> {
  const { byCharacterId, index } = await loadInventoryContext();
  return resolveIndexedItem(index, byCharacterId, query);
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
    .action(runCommandAction(async (itemQuery: string, tagValue: string) => {
      if (!tagValue.trim()) {
        console.log(error("Tag cannot be empty"));
        process.exit(1);
      }
      const item = await resolveItem(itemQuery);
      addTag(item, tagValue.trim());
      console.log(success(`Tagged "${item.name}" with "${tagValue.trim()}"`));
    }));

  tag
    .command("remove <item> <tag>")
    .description("Remove a tag from an item")
    .action(runCommandAction(async (itemQuery: string, tagValue: string) => {
      const item = await resolveItem(itemQuery);
      removeTag(item, tagValue.trim());
      console.log(
        success(`Removed tag "${tagValue.trim()}" from "${item.name}"`)
      );
    }));

  tag
    .command("list <item>")
    .description("List all tags on an item")
    .action(runCommandAction(async (itemQuery: string) => {
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
    }));
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
    .action(runCommandAction(async (itemQuery: string, text: string) => {
      if (!text.trim()) {
        console.log(error("Note text cannot be empty"));
        process.exit(1);
      }
      const item = await resolveItem(itemQuery);
      setNote(item, text.trim());
      console.log(success(`Note set on "${item.name}"`));
    }));

  note
    .command("clear <item>")
    .description("Clear the note on an item")
    .action(runCommandAction(async (itemQuery: string) => {
      const item = await resolveItem(itemQuery);
      clearNote(item);
      console.log(success(`Note cleared on "${item.name}"`));
    }));

  note
    .command("show <item>")
    .description("Show the note on an item")
    .action(runCommandAction(async (itemQuery: string) => {
      const item = await resolveItem(itemQuery);
      const noteText = getNote(item);
      if (!noteText) {
        console.log(dim(`${item.name}: (no note set)`));
      } else {
        console.log(`${item.name}: ${noteText}`);
      }
    }));
}
