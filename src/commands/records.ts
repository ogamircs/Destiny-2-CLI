import { Command } from "commander";
import { getProfile } from "../api/profile.ts";
import type { RecordsProfileResponse } from "../api/progression.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { withSpinner } from "../ui/spinner.ts";
import { error, header } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";
import { buildRecordsReport } from "../services/progression.ts";

const CHARACTER_RECORDS_COMPONENT = 900;
const PROFILE_RECORDS_COMPONENT = 901;
const PRESENTATION_NODES_COMPONENT = 902;

export function registerRecordsCommand(program: Command) {
  program
    .command("records")
    .description("Summarize tracked records and seal completion percentages")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const profile = (await withSpinner("Fetching records...", () =>
          getProfile([
            DestinyComponentType.Characters,
            CHARACTER_RECORDS_COMPONENT,
            PROFILE_RECORDS_COMPONENT,
            PRESENTATION_NODES_COMPONENT,
          ])
        )) as RecordsProfileResponse;

        const report = buildRecordsReport({
          characters: profile.characters?.data,
          profileRecords: profile.profileRecords?.data.records,
          characterRecords: profile.characterRecords?.data,
          profilePresentationNodes: profile.profilePresentationNodes?.data,
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        console.log(header("\nRecords"));
        console.log(
          `Profile records: ${report.summary.profileRecordsCompleted}/${report.summary.profileRecordsTotal} (${report.summary.profileCompletionPct}%)`
        );
        console.log(
          `Seal nodes: ${report.summary.sealNodesCompleted}/${report.summary.sealNodesTotal} (${report.summary.sealCompletionPct}%)`
        );

        if (report.characters.length > 0) {
          console.log(header("\nBy Character"));
          for (const character of report.characters) {
            console.log(
              `${character.className}: ${character.recordsCompleted}/${character.recordsTotal} (${character.completionPct}%)`
            );
          }
        }

        if (report.trackedRecords.length > 0) {
          console.log(header("\nTracked Records"));
          for (const record of report.trackedRecords) {
            console.log(`${record.recordHash}: ${record.completionPct}%`);
          }
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
