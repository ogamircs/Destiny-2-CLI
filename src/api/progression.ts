import { apiRequest } from "./client.ts";
import { loadTokens } from "../services/token-store.ts";
import { AuthError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";

export const VendorComponentType = {
  Vendors: 400,
  VendorSales: 401,
  VendorCategories: 402,
} as const;

export interface ObjectiveProgress {
  progress?: number;
  completionValue?: number;
  complete?: boolean;
}

export interface ChecklistEntry {
  state?: number;
  completed?: boolean;
  objective?: ObjectiveProgress;
}

export interface ChecklistProgress {
  entries?: ChecklistEntry[];
}

export interface MetricProgress {
  objectiveProgress?: ObjectiveProgress;
}

export interface RecordProgress {
  objectives?: ObjectiveProgress[];
}

export interface PresentationNodeProgress {
  state?: number;
  objectives?: ObjectiveProgress[];
}

export interface ProgressionProfileResponse {
  profile?: {
    data: {
      currentGuardianRank?: number;
      lifetimeHighestGuardianRank?: number;
      currentSeasonRewardPowerCap?: number;
    };
  };
  characters?: {
    data: Record<
      string,
      {
        characterId: string;
        classType: number;
        light: number;
      }
    >;
  };
  profileProgression?: {
    data: {
      seasonalArtifact?: {
        powerBonus?: number;
      };
      checklists?: Record<string, ChecklistProgress>;
    };
  };
  metrics?: {
    data: {
      metrics?: Record<string, MetricProgress>;
    };
  };
}

export interface RecordsProfileResponse {
  characters?: {
    data: Record<
      string,
      {
        characterId: string;
        classType: number;
      }
    >;
  };
  profileRecords?: {
    data: {
      records?: Record<string, RecordProgress>;
    };
  };
  characterRecords?: {
    data: Record<
      string,
      {
        records?: Record<string, RecordProgress>;
      }
    >;
  };
  profilePresentationNodes?: {
    data: Record<string, PresentationNodeProgress>;
  };
}

export interface VendorData {
  vendorHash: number;
  enabled?: boolean;
  nextRefreshDate?: string;
}

export interface VendorCategoryData {
  categories?: Array<{
    itemIndexes?: number[];
  }>;
}

export interface VendorSaleData {
  vendorItemIndex: number;
}

export interface CharacterVendorsResponse {
  vendors?: {
    data?: Record<string, VendorData>;
  };
  categories?: {
    data?: Record<string, VendorCategoryData>;
  };
  sales?: {
    data?: Record<string, VendorSaleData>;
  };
}

export async function getCharacterVendors(
  characterId: string,
  components = [
    VendorComponentType.Vendors,
    VendorComponentType.VendorSales,
    VendorComponentType.VendorCategories,
  ]
): Promise<CharacterVendorsResponse> {
  const tokens = loadTokens();
  if (!tokens) throw new AuthError("Not logged in. Run: destiny auth login");

  const componentStr = components.join(",");
  const { destinyMembershipType, destinyMembershipId } = tokens;

  const path =
    `/Destiny2/${destinyMembershipType}/Profile/${destinyMembershipId}` +
    `/Character/${characterId}/Vendors/?components=${componentStr}`;

  debug(
    `Fetching vendors: type=${destinyMembershipType} id=${destinyMembershipId} char=${characterId} components=${componentStr}`
  );

  return apiRequest<CharacterVendorsResponse>(path);
}
