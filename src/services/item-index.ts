import { lookupItem } from "./manifest-cache.ts";
import { BUCKET_SLOT_NAMES, DestinyComponentType } from "../utils/constants.ts";
import { debug } from "../utils/logger.ts";
import type { ProfileResponse, CharacterData } from "../api/profile.ts";

export interface IndexedItem {
  // from InventoryItemData
  hash: number;
  instanceId: string | undefined;
  quantity: number;
  bucketHash: number;
  transferStatus: number; // 0=can transfer, 1=equipped, 2=not transferrable
  isLocked: boolean; // bit 0 of state field

  // from ManifestItem
  name: string;
  itemType: number;
  itemSubType: number;
  tier: string; // tierTypeName
  slot: string; // human-readable from BUCKET_SLOT_NAMES
  classRestriction: number; // -1=any, 0=Titan, 1=Hunter, 2=Warlock
  icon: string;
  maxStackSize: number;
  nonTransferrable: boolean;
  equippable: boolean;

  // from ItemInstance (undefined when component not fetched)
  power: number | undefined;
  damageType: number | undefined;
  energyCapacity: number | undefined;
  energyUsed: number | undefined;
  isEquipped: boolean;
  canEquip: boolean;

  location: string; // characterId string, or literal "vault"
  perks: number[] | undefined; // perk def hashes; undefined until ItemPerks fetched
}

export interface InventoryIndex {
  all: IndexedItem[];
  byInstanceId: Map<string, IndexedItem>;
  byHash: Map<number, IndexedItem[]>;
  byCharacter: Map<string, IndexedItem[]>; // characterId -> items
  vaultItems: IndexedItem[];
}

export function getRequiredComponents(): number[] {
  return [
    DestinyComponentType.Characters,
    DestinyComponentType.CharacterInventories,
    DestinyComponentType.CharacterEquipment,
    DestinyComponentType.ProfileInventories,
    DestinyComponentType.ItemInstances,
  ];
}

export function buildInventoryIndex(
  profile: ProfileResponse,
  characters: CharacterData[]
): InventoryIndex {
  const all: IndexedItem[] = [];
  const byInstanceId = new Map<string, IndexedItem>();
  const byHash = new Map<number, IndexedItem[]>();
  const byCharacter = new Map<string, IndexedItem[]>();
  const vaultItems: IndexedItem[] = [];

  const instances = profile.itemComponents?.instances?.data ?? {};

  function indexItem(
    rawItem: {
      itemHash: number;
      itemInstanceId?: string;
      quantity: number;
      bucketHash: number;
      transferStatus: number;
      state: number;
    },
    location: string
  ): void {
    const def = lookupItem(rawItem.itemHash);
    if (!def) {
      debug(`Skipping item with unknown hash: ${rawItem.itemHash}`);
      return;
    }

    const instanceId = rawItem.itemInstanceId;
    const instance = instanceId ? instances[instanceId] : undefined;

    const slot =
      BUCKET_SLOT_NAMES[rawItem.bucketHash] ??
      BUCKET_SLOT_NAMES[def.bucketHash] ??
      "Other";

    const indexed: IndexedItem = {
      hash: rawItem.itemHash,
      instanceId,
      quantity: rawItem.quantity,
      bucketHash: rawItem.bucketHash,
      transferStatus: rawItem.transferStatus,
      isLocked: (rawItem.state & 1) !== 0,

      name: def.name,
      itemType: def.itemType,
      itemSubType: def.itemSubType,
      tier: def.tierTypeName,
      slot,
      classRestriction: def.classType,
      icon: def.icon,
      maxStackSize: def.maxStackSize,
      nonTransferrable: def.nonTransferrable,
      equippable: def.equippable,

      power: instance?.primaryStat?.value,
      damageType: instance?.damageType,
      energyCapacity: instance?.energy?.energyCapacity,
      energyUsed: instance?.energy?.energyUsed,
      isEquipped: instance?.isEquipped ?? false,
      canEquip: instance?.canEquip ?? false,

      location,
      perks: undefined,
    };

    all.push(indexed);

    if (instanceId) {
      byInstanceId.set(instanceId, indexed);
    }

    const existing = byHash.get(indexed.hash) ?? [];
    existing.push(indexed);
    byHash.set(indexed.hash, existing);

    if (location === "vault") {
      vaultItems.push(indexed);
    } else {
      const charItems = byCharacter.get(location) ?? [];
      charItems.push(indexed);
      byCharacter.set(location, charItems);
    }
  }

  // Process each character's equipment then inventory
  for (const char of characters) {
    const charId = char.characterId;
    const equipment =
      profile.characterEquipment?.data?.[charId]?.items ?? [];
    const inventory =
      profile.characterInventories?.data?.[charId]?.items ?? [];

    for (const item of equipment) {
      indexItem(item, charId);
    }
    for (const item of inventory) {
      indexItem(item, charId);
    }
  }

  // Process vault
  const vaultRawItems = profile.profileInventory?.data?.items ?? [];
  for (const item of vaultRawItems) {
    indexItem(item, "vault");
  }

  return { all, byInstanceId, byHash, byCharacter, vaultItems };
}
