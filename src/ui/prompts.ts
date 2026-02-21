import * as p from "@clack/prompts";
import type { CharacterData } from "../api/profile.ts";
import { className } from "./format.ts";
import type { DisplayItem } from "./tables.ts";

export async function pickCharacter(
  characters: CharacterData[],
  message = "Select a character"
): Promise<CharacterData> {
  const result = await p.select({
    message,
    options: characters.map((c) => ({
      label: `${className(c.classType)} (${c.light})`,
      value: c.characterId,
    })),
  });

  if (p.isCancel(result)) {
    process.exit(0);
  }

  return characters.find((c) => c.characterId === result)!;
}

export async function pickItem(
  items: DisplayItem[],
  message = "Select an item"
): Promise<DisplayItem> {
  const result = await p.select({
    message,
    options: items.slice(0, 20).map((item) => ({
      label: `${item.name} (${item.tier}, ${item.location})`,
      value: item.instanceId || String(item.hash),
    })),
  });

  if (p.isCancel(result)) {
    process.exit(0);
  }

  return items.find(
    (i) => (i.instanceId || String(i.hash)) === result
  )!;
}

export async function pickDestination(
  characters: CharacterData[],
  message = "Transfer to"
): Promise<{ type: "vault" } | { type: "character"; characterId: string }> {
  const options = [
    { label: "Vault", value: "vault" },
    ...characters.map((c) => ({
      label: className(c.classType),
      value: c.characterId,
    })),
  ];

  const result = await p.select({ message, options });

  if (p.isCancel(result)) {
    process.exit(0);
  }

  if (result === "vault") {
    return { type: "vault" };
  }
  return { type: "character", characterId: result as string };
}

export async function confirm(message: string): Promise<boolean> {
  const result = await p.confirm({ message });
  if (p.isCancel(result)) {
    process.exit(0);
  }
  return result;
}
