import type { IndexedItem } from "./item-index.ts";

export type OrganizeGroupKey = "duplicates" | "underpowered" | "vault";

export interface CleanupSuggestion {
  group: OrganizeGroupKey;
  action: string;
  reason: string;
  name: string;
  hash: number;
  instanceId: string | undefined;
  slot: string;
  tier: string;
  power: number | null;
  location: string;
  equipped: boolean;
  locked: boolean;
}

export interface OrganizeReport {
  groups: Record<OrganizeGroupKey, CleanupSuggestion[]>;
  totalSuggestions: number;
}

function itemId(item: IndexedItem): string {
  return item.instanceId ?? `hash:${item.hash}:${item.location}:${item.slot}`;
}

function toSuggestion(
  group: OrganizeGroupKey,
  item: IndexedItem,
  action: string,
  reason: string
): CleanupSuggestion {
  return {
    group,
    action,
    reason,
    name: item.name,
    hash: item.hash,
    instanceId: item.instanceId,
    slot: item.slot,
    tier: item.tier,
    power: item.power ?? null,
    location: item.location,
    equipped: item.isEquipped,
    locked: item.isLocked,
  };
}

function keeperScore(item: IndexedItem): number {
  let score = 0;
  if (item.isLocked) score += 10000;
  if (item.isEquipped) score += 5000;
  if (item.location !== "vault") score += 500;
  score += item.power ?? 0;
  score += item.perks?.length ?? 0;
  return score;
}

function compareForDuplicates(a: IndexedItem, b: IndexedItem): number {
  return keeperScore(b) - keeperScore(a);
}

function compareSuggestions(a: CleanupSuggestion, b: CleanupSuggestion): number {
  if (a.name !== b.name) {
    return a.name.localeCompare(b.name);
  }
  const powerA = a.power ?? -1;
  const powerB = b.power ?? -1;
  return powerB - powerA;
}

export function buildOrganizeReport(items: IndexedItem[]): OrganizeReport {
  const groups: Record<OrganizeGroupKey, CleanupSuggestion[]> = {
    duplicates: [],
    underpowered: [],
    vault: [],
  };

  const alreadySuggested = new Set<string>();

  // Duplicate gear copies by hash.
  const byHash = new Map<number, IndexedItem[]>();
  for (const item of items) {
    const existing = byHash.get(item.hash) ?? [];
    existing.push(item);
    byHash.set(item.hash, existing);
  }

  for (const copies of byHash.values()) {
    if (copies.length < 2) continue;
    const sorted = [...copies].sort(compareForDuplicates);
    const keeper = sorted[0]!;
    for (let idx = 1; idx < sorted.length; idx += 1) {
      const candidate = sorted[idx]!;
      const id = itemId(candidate);
      alreadySuggested.add(id);

      const keeperPower = keeper.power ?? null;
      const candidatePower = candidate.power ?? null;
      const reason =
        keeperPower !== null && candidatePower !== null
          ? `Duplicate copy. Best copy is ${keeperPower}; this one is ${candidatePower}.`
          : "Duplicate copy with weaker keep-priority than your best roll.";

      groups.duplicates.push(
        toSuggestion(
          "duplicates",
          candidate,
          "Compare perks and dismantle weaker copy",
          reason
        )
      );
    }
  }

  // Underpowered gear by slot.
  const maxPowerBySlot = new Map<string, number>();
  for (const item of items) {
    if (item.power === undefined) continue;
    const current = maxPowerBySlot.get(item.slot) ?? item.power;
    if (item.power > current) {
      maxPowerBySlot.set(item.slot, item.power);
    } else if (!maxPowerBySlot.has(item.slot)) {
      maxPowerBySlot.set(item.slot, item.power);
    }
  }

  for (const item of items) {
    const id = itemId(item);
    if (alreadySuggested.has(id)) continue;
    if (item.power === undefined) continue;
    if (item.isLocked || item.isEquipped) continue;
    if (item.itemType !== 2 && item.itemType !== 3) continue;

    const slotMax = maxPowerBySlot.get(item.slot);
    if (slotMax === undefined) continue;
    const delta = slotMax - item.power;
    if (delta < 10) continue;

    alreadySuggested.add(id);
    groups.underpowered.push(
      toSuggestion(
        "underpowered",
        item,
        "Infuse into stronger item or dismantle",
        `${delta} power behind your top ${item.slot} piece (${slotMax}).`
      )
    );
  }

  // Character inventory candidates that can be stashed before cleanup.
  for (const item of items) {
    const id = itemId(item);
    if (alreadySuggested.has(id)) continue;
    if (item.location === "vault") continue;
    if (item.isEquipped || item.isLocked) continue;
    if (item.nonTransferrable) continue;
    if (item.transferStatus !== 0) continue;

    groups.vault.push(
      toSuggestion(
        "vault",
        item,
        "Move to vault before cleanup sweep",
        "Unequipped + transferable item on character inventory."
      )
    );
  }

  groups.duplicates.sort(compareSuggestions);
  groups.underpowered.sort(compareSuggestions);
  groups.vault.sort(compareSuggestions);

  return {
    groups,
    totalSuggestions:
      groups.duplicates.length + groups.underpowered.length + groups.vault.length,
  };
}

function csvCell(value: string | number | boolean | null): string {
  const stringValue = value === null ? "" : String(value);
  if (
    stringValue.includes(",") ||
    stringValue.includes("\"") ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replaceAll("\"", "\"\"")}"`;
  }
  return stringValue;
}

export function cleanupSuggestionsToCsv(
  report: OrganizeReport,
  resolveLocation: (location: string) => string
): string {
  const rows: string[] = [
    "group,action,name,slot,tier,power,location,instanceId,hash,equipped,locked,reason",
  ];

  const orderedKeys: OrganizeGroupKey[] = ["duplicates", "underpowered", "vault"];

  for (const key of orderedKeys) {
    for (const suggestion of report.groups[key]) {
      rows.push(
        [
          key,
          suggestion.action,
          suggestion.name,
          suggestion.slot,
          suggestion.tier,
          suggestion.power,
          resolveLocation(suggestion.location),
          suggestion.instanceId ?? "",
          suggestion.hash,
          suggestion.equipped,
          suggestion.locked,
          suggestion.reason,
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }

  return `${rows.join("\n")}\n`;
}
