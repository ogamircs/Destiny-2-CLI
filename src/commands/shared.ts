import { getProfile, type CharacterData } from "../api/profile.ts";
import {
  buildInventoryIndex,
  getRequiredComponents,
  type InventoryIndex,
  type IndexedItem,
} from "../services/item-index.ts";
import { ensureManifest } from "../services/manifest-cache.ts";
import { className, error as formatCliError } from "../ui/format.ts";
import { pickItem } from "../ui/prompts.ts";
import type { DisplayItem } from "../ui/tables.ts";
import { withSpinner } from "../ui/spinner.ts";
import { formatError } from "../utils/errors.ts";

export interface InventoryContext {
  characters: CharacterData[];
  byCharacterId: Map<string, CharacterData>;
  index: InventoryIndex;
}

export interface LoadInventoryContextOptions {
  additionalComponents?: number[];
  components?: number[];
}

export interface LocatedItem extends DisplayItem {
  characterId?: string;
  inVault: boolean;
}

export function runCommandAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<void>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await action(...args);
    } catch (err) {
      console.error(formatCliError(formatError(err)));
      process.exit(1);
    }
  };
}

export async function loadInventoryContext(
  options: LoadInventoryContextOptions = {}
): Promise<InventoryContext> {
  const components = options.components ?? [
    ...getRequiredComponents(),
    ...(options.additionalComponents ?? []),
  ];

  const [, profile] = await Promise.all([
    withSpinner("Loading manifest...", () => ensureManifest()),
    withSpinner("Fetching inventory...", () => getProfile(components)),
  ]);

  const characters = Object.values(profile.characters?.data ?? {}) as CharacterData[];
  const byCharacterId = new Map(
    characters.map((character) => [character.characterId, character])
  );

  return {
    characters,
    byCharacterId,
    index: buildInventoryIndex(profile, characters),
  };
}

export function resolveCharacter(
  characters: CharacterData[],
  classArg: string
): CharacterData {
  const lower = classArg.toLowerCase();
  const character = characters.find(
    (candidate) => className(candidate.classType).toLowerCase() === lower
  );

  if (!character) {
    throw new Error(
      `Character "${classArg}" not found. Available: ${characters
        .map((candidate) => className(candidate.classType).toLowerCase())
        .join(", ")}`
    );
  }

  return character;
}

export function locationLabel(
  location: string,
  byCharacterId: Map<string, CharacterData>
): string {
  if (location === "vault") {
    return "Vault";
  }

  return className(byCharacterId.get(location)?.classType ?? -1);
}

export function toDisplayItem(
  item: IndexedItem,
  byCharacterId: Map<string, CharacterData>
): DisplayItem {
  return {
    name: item.name,
    tier: item.tier,
    slot: item.slot,
    instanceId: item.instanceId,
    hash: item.hash,
    quantity: item.quantity,
    isEquipped: item.isEquipped,
    location: locationLabel(item.location, byCharacterId),
  };
}

export function toLocatedItem(
  item: IndexedItem,
  byCharacterId: Map<string, CharacterData>,
  options: { slot?: string } = {}
): LocatedItem {
  const displayItem = toDisplayItem(item, byCharacterId);
  const inVault = item.location === "vault";

  return {
    ...displayItem,
    slot: options.slot ?? displayItem.slot,
    characterId: inVault ? undefined : item.location,
    inVault,
  };
}

export async function resolveIndexedItem(
  index: InventoryIndex,
  byCharacterId: Map<string, CharacterData>,
  query: string,
  message = "Multiple items found. Select one:"
): Promise<IndexedItem> {
  const lowerQuery = query.toLowerCase();
  const matches = index.all.filter((item) =>
    item.name.toLowerCase().includes(lowerQuery)
  );

  if (matches.length === 0) {
    throw new Error(`No items found matching "${query}"`);
  }

  if (matches.length === 1) {
    return matches[0]!;
  }

  const picked = await pickItem(
    matches.map((item) => toDisplayItem(item, byCharacterId)),
    message
  );

  return (
    matches.find((item) => item.instanceId && item.instanceId === picked.instanceId) ??
    matches.find(
      (item) =>
        item.hash === picked.hash &&
        locationLabel(item.location, byCharacterId) === picked.location
    ) ??
    index.byHash.get(picked.hash)?.[0] ??
    matches[0]!
  );
}
