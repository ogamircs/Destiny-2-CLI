import { apiRequest } from "./client.ts";
import { loadTokens } from "../services/token-store.ts";
import { AuthError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";

export interface ProfileResponse {
  profile?: {
    data: {
      userInfo: {
        membershipType: number;
        membershipId: string;
        displayName: string;
        bungieGlobalDisplayName?: string;
        bungieGlobalDisplayNameCode?: number;
      };
      dateLastPlayed: string;
    };
  };
  characters?: {
    data: Record<string, CharacterData>;
  };
  characterInventories?: {
    data: Record<string, { items: InventoryItemData[] }>;
  };
  characterEquipment?: {
    data: Record<string, { items: InventoryItemData[] }>;
  };
  profileInventory?: {
    data: { items: InventoryItemData[] };
  };
  itemComponents?: {
    instances?: {
      data: Record<
        string,
        {
          primaryStat?: { value: number; statHash: number };
          isEquipped: boolean;
          canEquip: boolean;
          equipRequiredLevel: number;
          quality?: number;
          damageType?: number;
          energy?: { energyCapacity: number; energyUsed: number };
        }
      >;
    };
  };
}

export interface CharacterData {
  characterId: string;
  membershipId: string;
  membershipType: number;
  dateLastPlayed: string;
  minutesPlayedTotal: string;
  light: number;
  classType: number;
  raceType: number;
  genderType: number;
  stats: Record<string, number>;
  emblemPath: string;
  emblemBackgroundPath: string;
}

export interface InventoryItemData {
  itemHash: number;
  itemInstanceId?: string;
  quantity: number;
  bucketHash: number;
  transferStatus: number; // 0=can transfer, 1=equipped, 2=not transferrable
  state: number;
  overrideStyleItemHash?: number;
}

function getAuthInfo() {
  const tokens = loadTokens();
  if (!tokens) throw new AuthError("Not logged in. Run: destiny auth login");
  return tokens;
}

export async function getProfile(
  components: number[]
): Promise<ProfileResponse> {
  const { destinyMembershipType, destinyMembershipId } = getAuthInfo();
  const componentStr = components.join(",");
  debug(
    `Fetching profile: type=${destinyMembershipType} id=${destinyMembershipId} components=${componentStr}`
  );

  return apiRequest<ProfileResponse>(
    `/Destiny2/${destinyMembershipType}/Profile/${destinyMembershipId}/?components=${componentStr}`
  );
}
