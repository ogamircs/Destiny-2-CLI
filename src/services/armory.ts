import type { IndexedItem } from "./item-index.ts";
import type { ManifestPerk } from "./manifest-cache.ts";

export interface TransferabilityInfo {
  transferable: boolean;
  reason: string;
}

export interface ArmoryItemView {
  name: string;
  hash: number;
  instanceId: string | undefined;
  tier: string;
  slot: string;
  power: number | null;
  quantity: number;
  location: string;
  equipped: boolean;
  locked: boolean;
  transferable: boolean;
  transferReason: string;
  perks: string[];
}

function candidateScore(item: IndexedItem): number {
  let score = 0;
  if (item.isEquipped) score += 1000;
  if (item.isLocked) score += 500;
  if (item.location !== "vault") score += 100;
  score += item.power ?? 0;
  return score;
}

export function resolveArmoryItem(
  items: IndexedItem[],
  query: string
): IndexedItem | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const byInstanceId = items.find((item) => item.instanceId === trimmed);
  if (byInstanceId) {
    return byInstanceId;
  }

  const lower = trimmed.toLowerCase();
  const matches = items.filter((item) => item.name.toLowerCase().includes(lower));
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0]!;
  }

  return [...matches].sort((a, b) => candidateScore(b) - candidateScore(a))[0]!;
}

export function describeTransferability(item: IndexedItem): TransferabilityInfo {
  if (item.nonTransferrable) {
    return {
      transferable: false,
      reason: "Item is flagged as non-transferrable.",
    };
  }
  if (item.isEquipped) {
    return {
      transferable: false,
      reason: "Unequip before transferring this item.",
    };
  }
  if (item.transferStatus === 2) {
    return {
      transferable: false,
      reason: "Transfer status indicates item cannot be moved.",
    };
  }
  if (item.transferStatus === 1) {
    return {
      transferable: false,
      reason: "Item is currently in an equipped transfer state.",
    };
  }

  return {
    transferable: true,
    reason: "Item can be transferred.",
  };
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

export function buildArmoryItemView(
  item: IndexedItem,
  location: string,
  lookupPerk: (hash: number) => ManifestPerk | null
): ArmoryItemView {
  const transferability = describeTransferability(item);
  return {
    name: item.name,
    hash: item.hash,
    instanceId: item.instanceId,
    tier: item.tier,
    slot: item.slot,
    power: item.power ?? null,
    quantity: item.quantity,
    location,
    equipped: item.isEquipped,
    locked: item.isLocked,
    transferable: transferability.transferable,
    transferReason: transferability.reason,
    perks: resolvePerkNames(item, lookupPerk),
  };
}
