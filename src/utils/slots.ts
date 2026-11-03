import { BUCKET_SLOT_NAMES } from "./constants.ts";
import { getGame } from "../games/context.ts";

/** Destiny 1 bucket hashes that differ in name from the shared D2 buckets. */
export const D1_BUCKET_SLOT_NAMES: Record<number, string> = {
  1498876634: "Primary",
  2465295065: "Special",
  953998645: "Heavy",
  3448274439: "Helmet",
  3551918588: "Gauntlets",
  14239492: "Chest",
  20886954: "Legs",
  1585787867: "Class Item",
  434908299: "Artifact",
  4023194814: "Ghost",
  2025709351: "Vehicle",
  284967655: "Ship",
  2973005342: "Shader",
  4274335291: "Emblem",
  3054419239: "Emote",
  1469714392: "Consumables",
  3865314626: "Materials",
  375726501: "Missions",
  2197472680: "Bounties",
  1801258597: "Quests",
  3284755031: "Subclass",
  3796357825: "Horn",
};

const SLOT_CANONICAL: Record<string, string> = {
  primary: "kinetic",
  kinetic: "kinetic",
  special: "energy",
  energy: "energy",
  heavy: "power",
  power: "power",
};

export function slotNameForBucket(bucketHash: number): string | undefined {
  if (getGame() === "d1") {
    return D1_BUCKET_SLOT_NAMES[bucketHash] ?? BUCKET_SLOT_NAMES[bucketHash];
  }
  return BUCKET_SLOT_NAMES[bucketHash];
}

export function canonicalSlot(slot: string): string {
  const value = slot.toLowerCase();
  return SLOT_CANONICAL[value] ?? value;
}

export function slotsMatch(itemSlot: string, query: string): boolean {
  return canonicalSlot(itemSlot) === canonicalSlot(query);
}
