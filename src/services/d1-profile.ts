import type { CharacterData, InventoryItemData, ProfileResponse } from "../api/profile.ts";
import {
  getD1Account,
  getD1CharacterInventory,
  getD1Vault,
} from "../api/d1/endpoints.ts";
import {
  collectD1Items,
  normalizeD1Account,
  type NormalizedD1Character,
  type NormalizedD1Item,
} from "../api/d1/normalize.ts";
import { resolveActiveMembership, type LinkedMembership } from "./membership.ts";

function toInventoryItem(item: NormalizedD1Item): InventoryItemData {
  return {
    itemHash: item.itemHash,
    itemInstanceId: item.itemInstanceId,
    quantity: item.quantity,
    bucketHash: item.bucketHash,
    transferStatus: item.transferStatus,
    state: item.locked ? 1 : 0,
  };
}

function toCharacterData(
  character: NormalizedD1Character,
  membership: LinkedMembership
): CharacterData {
  return {
    characterId: character.characterId,
    membershipId: character.membershipId || membership.membershipId,
    membershipType: character.membershipType || membership.membershipType,
    dateLastPlayed: character.dateLastPlayed,
    minutesPlayedTotal: character.minutesPlayedTotal,
    light: character.light,
    classType: character.classType,
    raceType: character.raceType,
    genderType: character.genderType,
    stats: {},
    emblemPath: character.emblemPath,
    emblemBackgroundPath: "",
  };
}

export function toProfileResponse(input: {
  membership: LinkedMembership;
  grimoireScore: number;
  dateLastPlayed: string;
  characters: Array<NormalizedD1Character & { items: NormalizedD1Item[] }>;
  vaultItems: NormalizedD1Item[];
}): ProfileResponse {
  const characters: Record<string, CharacterData> = {};
  const inventories: Record<string, { items: InventoryItemData[] }> = {};
  const equipment: Record<string, { items: InventoryItemData[] }> = {};
  const instances: Record<
    string,
    {
      primaryStat?: { value: number; statHash: number };
      isEquipped: boolean;
      canEquip: boolean;
      equipRequiredLevel: number;
      damageType?: number;
    }
  > = {};
  const perks: Record<
    string,
    { perks: Array<{ perkHash: number; isActive: boolean; isVisible: boolean }> }
  > = {};
  const levelByCharacter: Record<string, number> = {};

  function rememberItem(item: NormalizedD1Item): void {
    if (!item.itemInstanceId) return;
    instances[item.itemInstanceId] = {
      primaryStat: item.power === undefined ? undefined : { value: item.power, statHash: 0 },
      isEquipped: item.isEquipped,
      canEquip: item.canEquip,
      equipRequiredLevel: 0,
      damageType: item.damageType,
    };
    if (item.perkHashes.length > 0) {
      perks[item.itemInstanceId] = {
        perks: item.perkHashes.map((perkHash) => ({
          perkHash,
          isActive: true,
          isVisible: true,
        })),
      };
    }
  }

  for (const character of input.characters) {
    characters[character.characterId] = toCharacterData(character, input.membership);
    levelByCharacter[character.characterId] = character.level;
    const equipped: InventoryItemData[] = [];
    const carried: InventoryItemData[] = [];

    for (const item of character.items) {
      const raw = toInventoryItem(item);
      if (item.isEquipped) equipped.push(raw);
      else carried.push(raw);
      rememberItem(item);
    }

    inventories[character.characterId] = { items: carried };
    equipment[character.characterId] = { items: equipped };
  }

  return {
    profile: {
      data: {
        userInfo: {
          membershipType: input.membership.membershipType,
          membershipId: input.membership.membershipId,
          displayName: input.membership.displayName,
        },
        dateLastPlayed: input.dateLastPlayed,
        currentGuardianRank: 0,
        lifetimeHighestGuardianRank: 0,
        currentSeasonRewardPowerCap: 0,
      },
    },
    characters: { data: characters },
    characterInventories: { data: inventories },
    characterEquipment: { data: equipment },
    profileInventory: {
      data: {
        items: input.vaultItems.map((item) => {
          rememberItem(item);
          return toInventoryItem(item);
        }),
      },
    },
    itemComponents: { instances: { data: instances }, perks: { data: perks } },
    d1: {
      grimoireScore: input.grimoireScore,
      membershipType: input.membership.membershipType,
      membershipId: input.membership.membershipId,
      levelByCharacter,
    },
  };
}

export async function fetchD1Profile(): Promise<ProfileResponse> {
  const membership = await resolveActiveMembership();
  const account = normalizeD1Account(await getD1Account(membership));
  const [vaultRaw, inventoryRaws] = await Promise.all([
    getD1Vault(membership.membershipType),
    Promise.all(
      account.characters.map((character) =>
        getD1CharacterInventory(membership, character.characterId)
      )
    ),
  ]);

  return toProfileResponse({
    membership,
    grimoireScore: account.grimoireScore,
    dateLastPlayed: account.dateLastPlayed,
    characters: account.characters.map((character, index) => ({
      ...character,
      items: collectD1Items(inventoryRaws[index]),
    })),
    vaultItems: collectD1Items(vaultRaw),
  });
}
