import { apiRequest } from "./client.ts";
import { loadTokens } from "../services/token-store.ts";
import { AuthError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";

// Activity mode types
export const ActivityMode = {
  None: 0,
  AllPvE: 7,
  AllPvP: 5,
  Raid: 4,
  Strikes: 18,
  Nightfall: 46,
  Gambit: 63,
  TrialsOfOsiris: 84,
  IronBanner: 19,
  Dungeon: 82,
  Crucible: 5,
} as const;

export interface StatsResponse {
  [characterId: string]: {
    results: {
      [activityMode: string]: {
        allTime?: Record<
          string,
          {
            statId: string;
            basic: { value: number; displayValue: string };
          }
        >;
      };
    };
  };
}

export interface AccountStatsResponse {
  mergedAllCharacters: {
    results: {
      [activityMode: string]: {
        allTime?: Record<
          string,
          {
            statId: string;
            basic: { value: number; displayValue: string };
          }
        >;
      };
    };
  };
  characters: Array<{
    characterId: string;
    results: {
      [activityMode: string]: {
        allTime?: Record<
          string,
          {
            statId: string;
            basic: { value: number; displayValue: string };
          }
        >;
      };
    };
  }>;
}

export async function getAccountStats(
  modes?: number[]
): Promise<AccountStatsResponse> {
  const tokens = loadTokens();
  if (!tokens) throw new AuthError("Not logged in");

  const { destinyMembershipType, destinyMembershipId } = tokens;

  let url = `/Destiny2/${destinyMembershipType}/Account/${destinyMembershipId}/Stats/`;
  if (modes && modes.length > 0) {
    url += `?modes=${modes.join(",")}`;
  }

  debug(`Fetching account stats: ${url}`);
  return apiRequest<AccountStatsResponse>(url);
}

export async function getCharacterStats(
  characterId: string,
  modes?: number[]
): Promise<StatsResponse> {
  const tokens = loadTokens();
  if (!tokens) throw new AuthError("Not logged in");

  const { destinyMembershipType, destinyMembershipId } = tokens;

  let url = `/Destiny2/${destinyMembershipType}/Account/${destinyMembershipId}/Character/${characterId}/Stats/`;
  if (modes && modes.length > 0) {
    url += `?modes=${modes.join(",")}`;
  }

  debug(`Fetching character stats: ${url}`);
  return apiRequest<StatsResponse>(url);
}
