import { Command } from "commander";
import { getProfile } from "../api/profile.ts";
import type { ProgressionProfileResponse } from "../api/progression.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { withSpinner } from "../ui/spinner.ts";
import { error, header } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";
import { buildProgressReport } from "../services/progression.ts";
import { loadD1ProgressReport } from "../services/d1-views.ts";
import { ensureManifest } from "../services/manifest-cache.ts";
import { getGame } from "../games/context.ts";

const PROFILE_PROGRESSION_COMPONENT = 104;

export function registerProgressCommand(program: Command) {
  program
    .command("progress")
    .description("Summarize character power progression and profile counters")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        if (getGame() === "d1") {
          await withSpinner("Loading manifest...", () => ensureManifest());
          const report = await withSpinner("Fetching Destiny 1 progression...", () =>
            loadD1ProgressReport()
          );
          if (opts.json) {
            console.log(JSON.stringify(report, null, 2));
            return;
          }
          console.log(header("\nDestiny 1 Progression"));
          console.log(`Grimoire: ${report.grimoireScore}`);
          for (const character of report.characters) {
            console.log(
              `${character.className}: light ${character.light}, level ${character.level}`
            );
            for (const progression of character.progressions) {
              console.log(
                `  ${progression.name}: level ${progression.level} (${progression.progress})`
              );
            }
          }
          return;
        }

        const profile = (await withSpinner("Fetching progression...", () =>
          getProfile([
            DestinyComponentType.Profiles,
            DestinyComponentType.Characters,
            PROFILE_PROGRESSION_COMPONENT,
            DestinyComponentType.Metrics,
          ])
        )) as ProgressionProfileResponse;

        const report = buildProgressReport({
          characters: profile.characters?.data,
          seasonPowerCap: profile.profile?.data.currentSeasonRewardPowerCap,
          currentGuardianRank: profile.profile?.data.currentGuardianRank,
          lifetimeHighestGuardianRank: profile.profile?.data.lifetimeHighestGuardianRank,
          artifactPowerBonus: profile.profileProgression?.data.seasonalArtifact?.powerBonus,
          checklists: profile.profileProgression?.data.checklists,
          metrics: profile.metrics?.data.metrics,
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        console.log(header("\nProgression"));
        console.log(
          `Characters: ${report.summary.characterCount} | Power cap: ${report.summary.seasonPowerCap ?? "n/a"}`
        );
        for (const character of report.characters) {
          const capDelta =
            character.deltaToCap === null ? "n/a" : `-${character.deltaToCap} to cap`;
          console.log(`${character.className}: ${character.light} (${capDelta})`);
        }

        console.log(header("\nProfile Counters"));
        console.log(
          `Guardian Rank: ${report.profileCounters.currentGuardianRank ?? "n/a"} (lifetime ${report.profileCounters.lifetimeHighestGuardianRank ?? "n/a"})`
        );
        console.log(
          `Artifact bonus: ${report.profileCounters.artifactPowerBonus ?? "n/a"}`
        );
        console.log(
          `Checklist progress: ${report.profileCounters.checklistObjectivesCompleted}/${report.profileCounters.checklistObjectivesTotal}`
        );
        console.log(
          `Metrics progress: ${report.profileCounters.metricsCompleted}/${report.profileCounters.metricsTotal}`
        );
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
