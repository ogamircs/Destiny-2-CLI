import { asRecord, unwrapData } from "./paths.ts";

export interface NormalizedD1Item {
  itemHash: number;
  itemInstanceId?: string;
  quantity: number;
  bucketHash: number;
  transferStatus: number;
  locked: boolean;
  isEquipped: boolean;
  canEquip: boolean;
  power?: number;
  damageType?: number;
  perkHashes: number[];
}

export interface NormalizedD1Character {
  characterId: string;
  membershipId: string;
  membershipType: number;
  dateLastPlayed: string;
  minutesPlayedTotal: string;
  light: number;
  level: number;
  classType: number;
  raceType: number;
  genderType: number;
  emblemPath: string;
  grimoireScore: number;
}

export interface NormalizedD1Account {
  membershipId: string;
  membershipType: number;
  grimoireScore: number;
  dateLastPlayed: string;
  characters: NormalizedD1Character[];
}

const D1_RACE_TYPE_BY_HASH: Record<number, number> = {
  3887404748: 0,
  2803282938: 1,
  898834093: 2,
};

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeD1Item(
  raw: unknown,
  fallbackBucketHash = 0
): NormalizedD1Item | null {
  const record = asRecord(raw);
  if (!record) return null;
  const itemHash = numberOf(record.itemHash);
  if (itemHash === undefined) return null;

  const instanceCandidate = stringOf(record.itemInstanceId) || stringOf(record.itemId);
  const itemInstanceId =
    instanceCandidate && instanceCandidate !== "0" ? instanceCandidate : undefined;
  const primaryStat = asRecord(record.primaryStat);
  const perks = Array.isArray(record.perks) ? record.perks : [];
  const perkHashes = perks
    .map((perk) => numberOf(asRecord(perk)?.perkHash))
    .filter((hash): hash is number => hash !== undefined && hash > 0);
  const state = numberOf(record.state) ?? 0;

  return {
    itemHash,
    itemInstanceId,
    quantity: numberOf(record.quantity) ?? numberOf(record.stackSize) ?? 1,
    bucketHash: numberOf(record.bucketHash) ?? numberOf(record.bucket) ?? fallbackBucketHash,
    transferStatus: numberOf(record.transferStatus) ?? 0,
    locked: record.locked === true || (state & 1) !== 0,
    isEquipped: record.isEquipped === true || numberOf(record.transferStatus) === 1,
    canEquip: record.canEquip !== false,
    power: numberOf(primaryStat?.value),
    damageType: numberOf(record.damageType),
    perkHashes,
  };
}

export function collectD1Items(raw: unknown): NormalizedD1Item[] {
  const root = asRecord(unwrapData(raw));
  if (!root) return [];
  // Character inventories group buckets by category. The vault endpoint
  // returns data.buckets as a flat array of those same bucket objects.
  const groups: unknown[] = Array.isArray(root.buckets)
    ? [root.buckets]
    : Object.values(asRecord(root.buckets) ?? {});
  if (groups.length === 0) return [];

  const items: NormalizedD1Item[] = [];
  for (const group of groups) {
    const bucketList = Array.isArray(group) ? group : group ? [group] : [];
    for (const bucket of bucketList) {
      const bucketRecord = asRecord(bucket);
      if (!bucketRecord) continue;
      const bucketHash = numberOf(bucketRecord.bucketHash) ?? 0;
      const bucketItems = Array.isArray(bucketRecord.items) ? bucketRecord.items : [];
      for (const item of bucketItems) {
        const normalized = normalizeD1Item(item, bucketHash);
        if (normalized) items.push(normalized);
      }
    }
  }
  return items;
}

function raceTypeFrom(base: Record<string, unknown>): number {
  const explicit = numberOf(base.raceType);
  if (explicit !== undefined) return explicit;
  const raceHash = numberOf(base.raceHash);
  if (raceHash === undefined) return -1;
  return D1_RACE_TYPE_BY_HASH[raceHash] ?? -1;
}

export function normalizeD1Character(raw: unknown): NormalizedD1Character | null {
  const record = asRecord(raw);
  if (!record) return null;
  const base = asRecord(record.characterBase) ?? record;
  const characterId = stringOf(base.characterId);
  if (!characterId) return null;

  return {
    characterId,
    membershipId: stringOf(base.membershipId),
    membershipType: numberOf(base.membershipType) ?? 0,
    dateLastPlayed: stringOf(base.dateLastPlayed),
    minutesPlayedTotal: stringOf(base.minutesPlayedTotal) || "0",
    light: numberOf(base.powerLevel) ?? numberOf(record.light) ?? 0,
    level: numberOf(record.characterLevel) ?? numberOf(base.powerLevel) ?? 0,
    classType: numberOf(base.classType) ?? -1,
    raceType: raceTypeFrom(base),
    genderType: numberOf(base.genderType) ?? 0,
    emblemPath: stringOf(record.emblemPath),
    grimoireScore: numberOf(base.grimoireScore) ?? 0,
  };
}

export function normalizeD1Account(raw: unknown): NormalizedD1Account {
  const record = asRecord(unwrapData(raw)) ?? {};
  const characters = (Array.isArray(record.characters) ? record.characters : [])
    .map((character) => normalizeD1Character(character))
    .filter((character): character is NormalizedD1Character => character !== null);

  return {
    membershipId: stringOf(record.membershipId),
    membershipType: numberOf(record.membershipType) ?? 0,
    grimoireScore: numberOf(record.grimoireScore) ?? 0,
    dateLastPlayed: stringOf(record.dateLastPlayed),
    characters,
  };
}
