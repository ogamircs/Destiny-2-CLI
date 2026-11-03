import type { AccountStatsResponse } from "../stats.ts";
import { getD1HistoricalStats } from "./endpoints.ts";
import { asRecord, unwrapData } from "./paths.ts";
import { resolveActiveMembership } from "../../services/membership.ts";

export const D1_UNSUPPORTED_MODES = new Set(["gambit", "dungeon"]);

export const D1_MODE_NAMES: Record<string, string> = {
  pvp: "AllPvP",
  pve: "AllPvE",
  raid: "Raid",
  strikes: "AllStrikes",
  trials: "TrialsOfOsiris",
  ironbanner: "IronBanner",
  nightfall: "Nightfall",
  story: "Story",
  patrol: "Patrol",
};

export function d1ModeResultKey(mode: string): string {
  const name = D1_MODE_NAMES[mode];
  if (!name) return mode;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function normalizeD1Stats(raw: unknown, modeKey: string | null): AccountStatsResponse {
  const record = asRecord(unwrapData(raw)) ?? {};
  if (record.mergedAllCharacters || Array.isArray(record.characters)) {
    const merged = asRecord(record.mergedAllCharacters) ?? {};
    const results = asRecord(merged.results) ?? {};
    const mergedBlock = asRecord(merged.merged);
    if (modeKey === null && mergedBlock?.allTime && !results.allTime) {
      results.allTime = { allTime: mergedBlock.allTime };
    }
    return {
      mergedAllCharacters: { results: results as AccountStatsResponse["mergedAllCharacters"]["results"] },
      characters: Array.isArray(record.characters)
        ? (record.characters as AccountStatsResponse["characters"])
        : [],
    };
  }

  const key = modeKey ?? "allTime";
  const modeBlock = asRecord(record[key]) ?? record;
  return {
    mergedAllCharacters: {
      results: {
        [key]: modeBlock as AccountStatsResponse["mergedAllCharacters"]["results"][string],
      },
    },
    characters: [],
  };
}

export function assertD1Mode(mode: string | undefined): string {
  const normalized = (mode || "all").toLowerCase();
  if (normalized === "all") return "all";
  if (D1_UNSUPPORTED_MODES.has(normalized)) {
    throw new Error(
      `${normalized} does not exist in Destiny 1. Use pvp, pve, raid, strikes, trials, ironbanner, nightfall, story, or patrol.`
    );
  }
  if (!D1_MODE_NAMES[normalized]) {
    throw new Error(
      `Unknown Destiny 1 mode "${mode}". Options: pvp, pve, raid, strikes, trials, ironbanner, nightfall, story, patrol`
    );
  }
  return normalized;
}

export async function getD1AccountStats(mode: string | undefined): Promise<AccountStatsResponse> {
  const normalized = assertD1Mode(mode);
  const membership = await resolveActiveMembership();
  const modeName = normalized === "all" ? null : D1_MODE_NAMES[normalized]!;
  const raw = await getD1HistoricalStats(membership, modeName);
  return normalizeD1Stats(raw, normalized === "all" ? null : d1ModeResultKey(normalized));
}
