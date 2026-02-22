import type { IndexedItem } from "./item-index.ts";
import type { ManifestPerk } from "./manifest-cache.ts";

export interface CompareRow {
  name: string;
  hash: number;
  instanceId: string | undefined;
  tier: string;
  slot: string;
  power: number | null;
  perks: string[];
  equipped: boolean;
  locked: boolean;
  transferable: boolean;
  location: string;
}

function compareRows(a: CompareRow, b: CompareRow): number {
  const powerA = a.power ?? -1;
  const powerB = b.power ?? -1;
  if (powerA !== powerB) {
    return powerB - powerA;
  }
  if (a.equipped !== b.equipped) {
    return a.equipped ? -1 : 1;
  }
  if (a.locked !== b.locked) {
    return a.locked ? -1 : 1;
  }
  return a.location.localeCompare(b.location);
}

function resolvePerkNames(
  item: IndexedItem,
  lookupPerk: (hash: number) => ManifestPerk | null
): string[] {
  if (!item.perks || item.perks.length === 0) {
    return [];
  }
  return item.perks.map((hash) => lookupPerk(hash)?.name ?? `Perk ${hash}`);
}

function isTransferable(item: IndexedItem): boolean {
  return !item.isEquipped && !item.nonTransferrable && item.transferStatus === 0;
}

export function buildCompareRows(
  items: IndexedItem[],
  resolveLocation: (location: string) => string,
  lookupPerk: (hash: number) => ManifestPerk | null
): CompareRow[] {
  const rows = items.map((item) => ({
    name: item.name,
    hash: item.hash,
    instanceId: item.instanceId,
    tier: item.tier,
    slot: item.slot,
    power: item.power ?? null,
    perks: resolvePerkNames(item, lookupPerk),
    equipped: item.isEquipped,
    locked: item.isLocked,
    transferable: isTransferable(item),
    location: resolveLocation(item.location),
  }));

  return rows.sort(compareRows);
}
