import { Command } from "commander";
import { getProfile, type CharacterData } from "../api/profile.ts";
import { getAccountStats, ActivityMode } from "../api/stats.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { renderStatsTable, formatStatValue, type StatRow } from "../ui/tables.ts";
import { withSpinner } from "../ui/spinner.ts";
import { className, header, error } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";

const MODE_MAP: Record<string, number> = {
  pvp: ActivityMode.AllPvP,
  pve: ActivityMode.AllPvE,
  raid: ActivityMode.Raid,
  strikes: ActivityMode.Strikes,
  gambit: ActivityMode.Gambit,
  trials: ActivityMode.TrialsOfOsiris,
  ironbanner: ActivityMode.IronBanner,
  dungeon: ActivityMode.Dungeon,
  nightfall: ActivityMode.Nightfall,
};

const STAT_DISPLAY_NAMES: Record<string, string> = {
  activitiesCleared: "Activities Cleared",
  activitiesEntered: "Activities Entered",
  kills: "Kills",
  deaths: "Deaths",
  assists: "Assists",
  killsDeathsRatio: "K/D Ratio",
  killsDeathsAssists: "KDA",
  efficiency: "Efficiency",
  precisionKills: "Precision Kills",
  suicides: "Suicides",
  weaponKillsSuper: "Super Kills",
  weaponKillsGrenade: "Grenade Kills",
  weaponKillsMelee: "Melee Kills",
  objectivesCompleted: "Objectives Completed",
  secondsPlayed: "Time Played",
  winLossRatio: "Win Rate",
  combatRating: "Combat Rating",
  longestKillSpree: "Longest Kill Spree",
  bestSingleGameKills: "Best Game Kills",
  averageKillDistance: "Avg Kill Distance",
  totalActivityDurationSeconds: "Total Activity Duration",
};

const KEY_STATS = [
  "activitiesEntered",
  "activitiesCleared",
  "kills",
  "deaths",
  "assists",
  "killsDeathsRatio",
  "killsDeathsAssists",
  "efficiency",
  "winLossRatio",
  "precisionKills",
  "weaponKillsSuper",
  "weaponKillsGrenade",
  "weaponKillsMelee",
  "longestKillSpree",
  "bestSingleGameKills",
  "secondsPlayed",
];

function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function extractStats(
  allTime: Record<string, { statId: string; basic: { value: number; displayValue: string } }> | undefined
): StatRow[] {
  if (!allTime) return [];

  const rows: StatRow[] = [];
  for (const statId of KEY_STATS) {
    const stat = allTime[statId];
    if (!stat) continue;

    const displayName = STAT_DISPLAY_NAMES[statId] || statId;
    let value: string;

    if (statId === "secondsPlayed" || statId === "totalActivityDurationSeconds") {
      value = formatSeconds(stat.basic.value);
    } else {
      value = formatStatValue(statId, stat.basic.value, stat.basic.displayValue);
    }

    rows.push({ name: displayName, value });
  }

  return rows;
}

export function registerStatsCommand(program: Command) {
  program
    .command("stats")
    .description("View your Destiny 2 stats")
    .option(
      "-m, --mode <mode>",
      "Activity mode: pvp, pve, raid, strikes, gambit, trials, ironbanner, dungeon, nightfall",
      "all"
    )
    .option("-c, --character <class>", "Filter by character class")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const modes: number[] = [];
        if (opts.mode && opts.mode !== "all") {
          const mode = MODE_MAP[opts.mode.toLowerCase()];
          if (mode === undefined) {
            console.log(
              error(
                `Unknown mode "${opts.mode}". Options: ${Object.keys(MODE_MAP).join(", ")}`
              )
            );
            return;
          }
          modes.push(mode);
        }

        const [accountStats, profile] = await Promise.all([
          withSpinner("Fetching stats...", () => getAccountStats(modes)),
          getProfile([DestinyComponentType.Characters]),
        ]);

        const characters = profile.characters?.data
          ? (Object.values(profile.characters.data) as CharacterData[])
          : [];

        if (opts.json) {
          console.log(JSON.stringify(accountStats, null, 2));
          return;
        }

        // Merged stats
        const modeKey =
          modes.length > 0
            ? Object.keys(
                accountStats.mergedAllCharacters?.results || {}
              )[0] || ""
            : Object.keys(
                accountStats.mergedAllCharacters?.results || {}
              )[0] || "";

        if (modeKey) {
          const modeData =
            accountStats.mergedAllCharacters.results[modeKey];
          const stats = extractStats(modeData?.allTime);
          const modeName = opts.mode === "all" ? "All Activities" : opts.mode.toUpperCase();
          renderStatsTable(stats, `Account Stats — ${modeName}`);
        }

        // Per-character stats
        if (accountStats.characters) {
          for (const charStats of accountStats.characters) {
            const char = characters.find(
              (c) => c.characterId === charStats.characterId
            );
            if (!char) continue;

            const charName = className(char.classType);

            if (
              opts.character &&
              charName.toLowerCase() !== opts.character.toLowerCase()
            ) {
              continue;
            }

            const charModeKey = Object.keys(charStats.results || {})[0];
            if (!charModeKey) continue;

            const modeData = charStats.results[charModeKey];
            const stats = extractStats(modeData?.allTime);
            if (stats.length > 0) {
              renderStatsTable(stats, `${charName} (${char.light})`);
            }
          }
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
